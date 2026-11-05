import {socialPlatform,transformSocialUrl} from '../shared/social.js';
import {normalizeService} from '../shared/settings.js';

export const SOCIAL_CHANNEL='tweetx.social.v1';

// Runs in the page world so the site's own clipboard write can be transformed.
// It has no extension API access and never reads clipboard contents.
export function installSocialClipboard({window,isTrusted=event=>event.isTrusted,now=()=>Date.now()}){
  const platform=socialPlatform(window.location.href),document=window.document;
  let domain=null,armedUntil=0,post=null,disposed=false;
  const clipboard=window.navigator.clipboard,original=clipboard?.writeText;
  function configure(value){
    try{domain=value?.enabled===false?null:normalizeService(value?.activeDomain);}catch{domain=null;}
  }
  function transform(text){
    const armed=armedUntil>now();armedUntil=0;
    if(!armed||!domain||typeof text!=='string'||socialPlatform(text)!==platform)return text;
    let input=text;
    // Reddit sometimes copies an opaque /s/ link. Use only a permalink belonging
    // to the post whose Share control opened this action, never a random page link.
    if(platform==='reddit'&&/^\/r\/[^/]+\/s\/[^/]+\/?$/.test(new URL(text).pathname)&&post?.location===window.location.href&&now()-post.time<120000)input=post.url;
    try{return transformSocialUrl(input,domain);}catch{return text;}
  }
  function click(event){
    if(!isTrusted(event)||event.button>0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    armedUntil=0;
    const path=event.composedPath();
    const controls=path.filter(node=>node?.matches?.('button,a,[role="button"],[role="menuitem"],[data-e2e],[data-testid]'));
    const label=node=>(node.getAttribute('aria-label')||node.getAttribute('title')||node.textContent||'').replace(/[\u200b-\u200f\ufeff]/g,'').trim();
    const copy=controls.some(node=>/^copy (?:post )?link(?: to (?:post|video|reel))?$/i.test(label(node))||/^(?:copy-link|share-copy|copy-link-button)$/.test(node.getAttribute('data-e2e')||node.getAttribute('data-testid')||''));
    if(copy){armedUntil=now()+3000;return;}
    post=null;
    if(platform==='reddit'&&controls.some(node=>/^share(?: post)?$/i.test(label(node))||node.getAttribute('slot')==='share-button')){
      const owner=path.find(node=>node?.matches?.('shreddit-post'));
      const permalink=owner?.getAttribute('permalink');
      if(permalink){try{const url=new URL(permalink,window.location.origin).href;transformSocialUrl(url,'vxreddit.com');post={url,location:window.location.href,time:now()};}catch{}}
    }
  }
  const wrapped=function(text){return original.call(this,transform(text));};
  if(original){try{clipboard.writeText=wrapped;}catch{/* Legacy copy-event fallback remains available. */}}
  function copy(event){
    if(!event.clipboardData||!isTrusted(event)||armedUntil<=now())return;
    const active=document.activeElement;
    const text=active?.matches('input,textarea')?active.value.slice(active.selectionStart,active.selectionEnd):String(window.getSelection()||'');
    const result=transform(text);
    if(result!==text){event.clipboardData.setData('text/plain',result);event.preventDefault();event.stopImmediatePropagation();}
  }
  function receive(event){
    if(event.source!==window||event.origin!==window.location.origin||event.data?.channel!==SOCIAL_CHANNEL||event.data?.type!=='settings')return;
    configure(event.data.value);
  }
  function clear(){armedUntil=0;post=null;}
  function keydown(event){if(event.key==='Escape')clear();}
  function hide(event){clear();if(!event.persisted)dispose();}
  function dispose(){
    if(disposed)return;disposed=true;clear();
    if(clipboard?.writeText===wrapped)clipboard.writeText=original;
    window.removeEventListener('click',click,true);window.removeEventListener('copy',copy,true);
    window.removeEventListener('message',receive);window.removeEventListener('keydown',keydown,true);window.removeEventListener('pagehide',hide);
  }
  window.addEventListener('click',click,true);window.addEventListener('copy',copy,true);
  window.addEventListener('message',receive);window.addEventListener('keydown',keydown,true);window.addEventListener('pagehide',hide);
  window.postMessage({channel:SOCIAL_CHANNEL,type:'ready'},window.location.origin);
  return {configure,dispose};
}
if(typeof window!=='undefined'&&socialPlatform(window.location.href))installSocialClipboard({window});
