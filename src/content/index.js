import {getApi} from '../shared/api.js';
import {request,success,failure,validEnvelope,uuid} from '../shared/protocol.js';
import {transformPostUrl} from '../shared/url.js';
import {validateSettings,SETTINGS_KEY} from '../shared/settings.js';
import {shareControl,copyLinkControl,copyLinkMenu,COPY_LINK_SELECTOR,resolvePost,resolvePhoto} from './x-dom.js';
import {createFeedback} from './feedback.js';

export function createContent({window,api,clipboard=window.navigator.clipboard,isTrusted=event=>event.isTrusted,now=()=>Date.now()}) {
  const document=window.document,documentToken=uuid(),feedback=createFeedback(document);
  let settings=null,pending=false,savedPhoto=null,snapshotLocation=null,bypass=null,ownerPort=null,disposed=false,fault=null,share=null,menuObserver=null;
  const snapshot=()=>savedPhoto && snapshotLocation===window.location.href && now()-savedPhoto.capturedAt<=120000?savedPhoto:null;
  const ready=Promise.allSettled([
    request(api,'settings.get','background').then(value=>{if(!disposed)settings=validateSettings(value);}),
    request(api,'content.ready','background',{documentToken})
  ]);
  function clearShare(){share=null;menuObserver?.disconnect();menuObserver=null;}
  function trackShare(button) {
    clearShare();const original=resolvePost(button);if(!original)return;
    const captured={original,button,location:window.location.href,capturedAt:now(),menu:null};share=captured;
    menuObserver=new window.MutationObserver(changes=>{
      if(share!==captured)return;
      if(captured.location!==window.location.href){clearShare();return;}
      // Inspect changed subtrees, not every button in the timeline. X may reuse
      // an existing dropdown or render its actions as role=button elements.
      for(const change of changes){
        const roots=change.type==='attributes'?[change.target]:[...change.addedNodes];
        for(const root of roots){
          if(root.nodeType!==1)continue;
          const candidates=[...(root.matches(COPY_LINK_SELECTOR)?[root]:[]),...root.querySelectorAll(COPY_LINK_SELECTOR)];
          for(const candidate of candidates){
            const copy=copyLinkControl(candidate),menu=copyLinkMenu(copy);
            if(menu?.isConnected&&!menu.closest('[hidden],[aria-hidden="true"]')&&window.getComputedStyle(menu).display!=='none'){captured.menu=menu;break;}
          }
        }
      }
      if(captured.menu&&!captured.menu.isConnected)clearShare();
    });
    menuObserver.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','style']});
  }
  function dismissMenu(item){item.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));}
  function keydown(event){if(event.key==='Escape')clearShare();}
  function click(event) {
    if(!isTrusted(event)||event.button>0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    const button=shareControl(event.target);
    if(button){trackShare(button);return;}
    const item=copyLinkControl(event.target),captured=share;
    if(!item || !captured){clearShare();return;}
    const menu=copyLinkMenu(item);
    if(captured.location!==window.location.href || now()-captured.capturedAt>120000 || captured.menu&&captured.menu!==menu){clearShare();return;}
    const {original,button:trigger}=captured;
    clearShare();
    if(bypass){const allowed=bypass.url===original && bypass.expires>now() && bypass.location===window.location.href;bypass=null;if(allowed)return;}
    if(!settings||settings.enabled===false)return;
    let link;try{link=transformPostUrl(original,settings.activeDomain);}catch{return;}
    // Replace only X's Copy link action so its handler cannot overwrite the proxy URL.
    event.stopImmediatePropagation();event.preventDefault();
    if(pending){dismissMenu(item);return;}
    pending=true;
    let operation;
    try{
      if(fault==='clipboard-denied'){fault=null;throw new Error('CLIPBOARD_DENIED');}
      operation=clipboard.writeText(link);
    }catch(error){operation=Promise.reject(error);}
    Promise.resolve(operation).then(()=>{if(!disposed)feedback.show('Link copied');},()=>{
      if(!disposed)feedback.show('Could not copy the proxy link. Share the original instead.',{error:true,persistent:true,original,onOriginal:()=>{bypass={url:original,expires:now()+60000,location:window.location.href};trigger.focus();}});
    }).finally(()=>{pending=false;});
    dismissMenu(item);
  }
  function context(event) {
    savedPhoto=null;snapshotLocation=null;
    if(!isTrusted(event))return;
    const photo=resolvePhoto(event.target);if(!photo)return;
    savedPhoto={...photo,snapshotId:uuid(),documentToken,capturedAt:now()};snapshotLocation=window.location.href;
    event.stopImmediatePropagation(); // Do not preventDefault: the browser must still open its menu.
  }
  function onMessage(m,sender,sendResponse) {
    if(sender.id!==api.runtime.id || !validEnvelope(m)||m.target!=='content')return false;
    try{
      if(m.command==='photo.snapshot') {
        if(m.payload.documentToken && m.payload.documentToken!==documentToken)throw new Error('STALE_CONTEXT');
        sendResponse(success(m,snapshot()||{snapshot:null}));return false;
      }
      if(m.command==='content.identify'){sendResponse(success(m,{documentToken}));return false;}
      if(m.payload.documentToken!==documentToken)throw new Error('STALE_CONTEXT');
      if(m.command==='media.owner') {
        if(m.payload.hold && !ownerPort){ownerPort=api.runtime.connect({name:'tweetx.media-owner.v1'});ownerPort.onDisconnect.addListener(()=>{ownerPort=null;});}
        else if(!m.payload.hold && ownerPort){ownerPort.disconnect();ownerPort=null;}
        sendResponse(success(m,{}));return false;
      }
      if(m.command==='action.result') {
        if(m.payload.outcome==='failed')feedback.error(m.payload.code);
        else feedback.show(({copied:'Image copied','download-started':'Download started','download-complete':'Image downloaded'})[m.payload.outcome]||'Image action complete');
        if(m.payload.rendition==='displayed-fallback')feedback.show(`${m.payload.outcome==='copied'?'Image copied':'Download started'}. Using displayed image; original size unavailable.`);
        sendResponse(success(m,{}));return false;
      }
      if(typeof __VALIDATION__!=='undefined' && __VALIDATION__ && m.command==='validation.configure') {fault=m.payload.fault;sendResponse(success(m,{}));return false;}
    }catch(error){sendResponse(failure(m,error));return false;}
    return false;
  }
  const changed=(changes,area)=>{if(area==='local'&&changes[SETTINGS_KEY]){try{settings=validateSettings(changes[SETTINGS_KEY].newValue);}catch{settings=null;}}};
  window.addEventListener('click',click,true);window.addEventListener('contextmenu',context,true);window.addEventListener('keydown',keydown,true);
  api.runtime.onMessage.addListener(onMessage);api.storage.onChanged.addListener(changed);
  function dispose(){if(disposed)return;disposed=true;savedPhoto=null;clearShare();ownerPort?.disconnect();feedback.dispose();window.removeEventListener('click',click,true);window.removeEventListener('contextmenu',context,true);window.removeEventListener('keydown',keydown,true);window.removeEventListener('pagehide',dispose);api.runtime.onMessage.removeListener(onMessage);api.storage.onChanged.removeListener(changed);}
  window.addEventListener('pagehide',dispose);
  return {ready,snapshot,dispose};
}
if(typeof window!=='undefined' && getApi()?.runtime?.id)createContent({window,api:getApi()});
