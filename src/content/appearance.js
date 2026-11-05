import {getApi} from '../shared/api.js';

export function pageAppearance(window){
  const document=window.document;
  const candidates=[document.querySelector('main'),document.body,document.documentElement];
  for(const node of candidates){
    if(!node)continue;
    const rgb=window.getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);
    if(!rgb||rgb.length<3||rgb.length===4&&rgb[3]<0.5)continue;
    const luminance=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)/255;
    return {mode:luminance>.5?'light':'dark'};
  }
  return {mode:window.matchMedia?.('(prefers-color-scheme: light)').matches?'light':'dark'};
}
const api=getApi();
if(typeof window!=='undefined'&&api?.runtime?.id){
  const listener=(message,sender,reply)=>{if(sender.id===api.runtime.id&&message?.type==='tweetx.appearance')reply(pageAppearance(window));return false;};
  api.runtime.onMessage.addListener(listener);
  window.addEventListener('pagehide',event=>{if(!event.persisted)api.runtime.onMessage.removeListener(listener);});
}
