import {getApi} from '../shared/api.js';
import {request} from '../shared/protocol.js';
import {normalizeService,repairSettings,validateSettings,SETTINGS_KEY} from '../shared/settings.js';
import {SOCIAL_KEY,socialSettings,socialPlatform} from '../shared/social.js';
import {createIcon} from './icons.js';

const PLATFORMS={x:{name:'X / Twitter',detail:'Post links + photo tools',example:'fixupx.com'},instagram:{name:'Instagram',detail:'Posts, reels & carousels',example:'zzinstagram.com'},reddit:{name:'Reddit',detail:'Posts & comment links',example:'vxreddit.com'},tiktok:{name:'TikTok',detail:'Videos & photo posts',example:'tfxktok.com'}};

export function createSettingsView({document,api}){
  const window=document.defaultView,dashboard=document.body.dataset.dashboard==='true',cards=document.getElementById('cards'),nav=document.getElementById('platforms'),status=document.getElementById('status');
  let xSettings=null,social=null,selected='x',disposed=false,revision=0,xRevision=0,socialWrites=Promise.resolve(),statusTimer=null;
  const views=new Map(),busy=new Set(),queued=new Map();
  const current=platform=>platform==='x'?xSettings:social?.[platform];
  const note=settings=>settings.enabled===false?'Original links · rewriting off':'Copy link → '+settings.activeDomain;
  function clearStatus(){window.clearTimeout(statusTimer);statusTimer=null;status.textContent='';}
  function show(text,error=false){
    clearStatus();status.textContent=text;status.dataset.error=String(error);
    if(!error)statusTimer=window.setTimeout(clearStatus,2600);
  }
  function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function icon(name){return createIcon(document,name,'material-icon');}
  function choose(platform){
    if(selected!==platform)clearStatus();
    selected=platform;document.body.dataset.platform=platform;
    nav?.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.platform===platform)));
    cards.querySelectorAll('.platform-card').forEach(card=>{card.hidden=!dashboard&&card.dataset.site!==selected;});
  }
  function setBusy(platform,value){
    if(value)busy.add(platform);else busy.delete(platform);
    const card=views.get(platform)?.card;if(!card)return;
    card.setAttribute('aria-busy',String(value));
    card.querySelectorAll('button').forEach(node=>{node.disabled=value;});
  }
  async function save(platform,value){
    if(busy.has(platform)){queued.set(platform,value);return;}setBusy(platform,true);
    try{
      if(platform==='x')xSettings=await request(api,'settings.replace','background',{settings:{version:1,...value}});
      else{
        const write=socialWrites.catch(()=>{}).then(async()=>{
          const latest=socialSettings((await api.storage.local.get(SOCIAL_KEY))[SOCIAL_KEY]);
          const next=socialSettings({...latest,[platform]:value});await api.storage.local.set({[SOCIAL_KEY]:next});social=next;
        });socialWrites=write;await write;
      }
      if(!disposed){render();show(current(platform)?.enabled===false?'Saved. Original links will be copied on this site.':'Saved. Your next copied link will use this service.');}
    }catch{if(!disposed){render();show('Could not save. Your previous settings remain active.',true);}}
    finally{if(!disposed){setBusy(platform,false);const next=queued.get(platform);queued.delete(platform);if(next)void save(platform,next);}}
  }
  function render(){
    for(const [platform,info] of Object.entries(PLATFORMS)){
      const settings=current(platform),previous=views.get(platform),signature=JSON.stringify(settings?.services??null);
      if(previous?.signature===signature){
        if(settings){
          previous.card.querySelectorAll('input[type="radio"]').forEach(radio=>{radio.checked=radio.value===settings.activeDomain;});
          previous.card.querySelector('.card-note').textContent=note(settings);
          previous.card.querySelector('[role="switch"]').checked=settings.enabled!==false;
          previous.card.querySelector('.toggle-state').textContent=settings.enabled===false?'Off':'On';
        }
        continue;
      }
      const card=element('section','platform-card');card.dataset.site=platform;
      views.set(platform,{card,signature});
      if(previous)previous.card.replaceWith(card);else cards.append(card);
      const heading=element('div','card-heading'),mark=element('span','platform-mark'),logo=createIcon(document,platform,'brand-logo brand-'+platform),title=element('div');
      mark.setAttribute('aria-hidden','true');mark.append(logo);title.append(element('h2','',info.name),element('p','hint',info.detail));heading.append(mark,title);card.append(heading);
      if(!settings){card.append(element('p','error','Could not load services. Reload to try again.'));continue;}
      const toggleLabel=element('label','rewrite-toggle'),toggle=element('input'),toggleState=element('span','toggle-state',settings.enabled===false?'Off':'On');
      toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','Rewrite links for '+info.name);toggle.checked=settings.enabled!==false;toggleLabel.title='Turn off to copy original links';toggleLabel.append(toggleState,toggle);heading.append(toggleLabel);
      toggle.addEventListener('change',()=>void save(platform,{...current(platform),enabled:toggle.checked}));
      const list=element('div','services');list.setAttribute('role','radiogroup');list.setAttribute('aria-label',info.name+' embed service');
      for(const domain of settings.services){
        const row=element('div','service'),radio=element('input'),label=element('label','',domain),remove=element('button','remove');remove.append(icon('close'));
        radio.type='radio';radio.name='service-'+platform;radio.value=domain;radio.id=platform+'-'+domain;radio.checked=domain===settings.activeDomain;label.htmlFor=radio.id;
        radio.addEventListener('change',()=>void save(platform,{...current(platform),activeDomain:domain}));
        remove.type='button';remove.setAttribute('aria-label','Remove '+domain+' from '+info.name);
        remove.addEventListener('click',()=>{
          const latest=current(platform),remaining={...latest,services:latest.services.filter(value=>value!==domain)};
          const repaired=platform==='x'?repairSettings({version:1,...remaining}).settings:socialSettings({[platform]:remaining})[platform];
          void save(platform,repaired);
        });row.append(radio,label,remove);list.append(row);
      }
      card.append(list);
      const form=element('form'),inputLabel=element('label','','Add custom service'),row=element('div','input-row'),input=element('input'),add=element('button','','Add');
      input.type='text';input.id='domain-'+platform;inputLabel.htmlFor=input.id;input.placeholder=info.example;input.autocomplete='off';input.spellcheck=false;input.maxLength=270;input.required=true;add.type='submit';add.prepend(icon('add'));row.append(input,add);form.append(inputLabel,row);
      form.addEventListener('submit',event=>{
        event.preventDefault();if(busy.has(platform))return;
        try{
          const settings=current(platform);
          const domain=normalizeService(input.value);
          if(settings.services.includes(domain)){show('That service is already listed.',true);return;}
          if(settings.services.length>=20){show('Remove a service before adding another.',true);return;}
          void save(platform,{...settings,services:[...settings.services,domain]});
        }catch{show('Enter an HTTPS domain without a path, such as proxy.example.',true);}
      });card.append(form,element('p','card-note',note(settings)));setBusy(platform,busy.has(platform));
    }
    choose(selected);
  }
  if(!dashboard)for(const [platform,info] of Object.entries(PLATFORMS)){
    const button=element('button','platform-tab');button.append(createIcon(document,platform,'nav-logo'),element('span','',platform==='x'?'X':info.name));button.type='button';button.dataset.platform=platform;button.addEventListener('click',()=>choose(platform));nav.append(button);
  }
  const link=document.getElementById('dashboard');
  if(link){link.replaceChildren(icon('dashboard'),element('span','','Dashboard'));link.href=api.runtime.getURL('dashboard/index.html');link.addEventListener('click',event=>{event.preventDefault();void api.tabs.create({url:link.href});});}
  async function appearance(){
    try{
      const [tab]=await api.tabs.query({active:true,currentWindow:true});
      if(disposed)return;
      choose(socialPlatform(tab?.url)||'x');
      if(tab?.id){try{const result=await api.tabs.sendMessage(tab.id,{type:'tweetx.appearance'});if(!disposed&&['light','dark'].includes(result?.mode))document.body.dataset.mode=result.mode;}catch{}}
    }catch{}
  }
  function changed(changes,area){
    if(area!=='local')return;
    if(changes[SOCIAL_KEY]){revision++;social=socialSettings(changes[SOCIAL_KEY].newValue);}
    if(changes[SETTINGS_KEY]){xRevision++;try{xSettings=validateSettings(changes[SETTINGS_KEY].newValue);}catch{xSettings=null;}}
    if(!disposed&&(changes[SOCIAL_KEY]||changes[SETTINGS_KEY]))render();
  }
  api.storage.onChanged.addListener(changed);
  const initialRevision=revision,initialXRevision=xRevision;
  const ready=Promise.allSettled([
    request(api,'settings.get','background').then(value=>{if(xRevision===initialXRevision)xSettings=value;}),
    api.storage.local.get(SOCIAL_KEY).then(stored=>{if(revision===initialRevision)social=socialSettings(stored[SOCIAL_KEY]);}),
    appearance()
  ]).then(results=>{if(disposed)return;render();if(results.some(result=>result.status==='rejected'))show('Some settings could not load. Reload this page to try again.',true);});
  function dispose(){disposed=true;clearStatus();api.storage.onChanged.removeListener(changed);window.removeEventListener('pagehide',dispose);}
  window.addEventListener('pagehide',dispose);return {ready,dispose};
}
if(typeof document!=='undefined'&&getApi()?.runtime?.id)createSettingsView({document,api:getApi()});
