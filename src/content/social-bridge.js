import {getApi} from '../shared/api.js';
import {SOCIAL_KEY,socialPlatform,socialSettings} from '../shared/social.js';

const CHANNEL='tweetx.social.v1';
export function createSocialBridge({window,api}){
  const platform=socialPlatform(window.location.href);let current=null,disposed=false,revision=0;
  function publish(){if(current&&!disposed)window.postMessage({channel:CHANNEL,type:'settings',value:current[platform]},window.location.origin);}
  function receive(event){if(event.source===window&&event.origin===window.location.origin&&event.data?.channel===CHANNEL&&event.data?.type==='ready')publish();}
  function changed(changes,area){if(area==='local'&&changes[SOCIAL_KEY]){revision++;current=socialSettings(changes[SOCIAL_KEY].newValue);publish();}}
  window.addEventListener('message',receive);api.storage.onChanged.addListener(changed);
  const initialRevision=revision;
  const ready=api.storage.local.get(SOCIAL_KEY).then(stored=>{if(!disposed&&revision===initialRevision){current=socialSettings(stored[SOCIAL_KEY]);publish();}}).catch(()=>{/* Fail open to the native copy action when storage is unavailable. */});
  function hide(event){if(!event.persisted)dispose();}
  function dispose(){disposed=true;window.removeEventListener('message',receive);window.removeEventListener('pagehide',hide);api.storage.onChanged.removeListener(changed);}
  window.addEventListener('pagehide',hide);return {ready,dispose};
}
if(typeof window!=='undefined'&&getApi()?.runtime?.id&&socialPlatform(window.location.href))createSocialBridge({window,api:getApi()});
