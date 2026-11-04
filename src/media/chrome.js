import {getApi} from '../shared/api.js';
import {createMediaHost,pngPhoto} from './host.js';
import {validEnvelope,success,failure,request} from '../shared/protocol.js';
const api=getApi();
const host=createMediaHost({
  validation:__VALIDATION__,
  writeImage:async photo=>{try{await navigator.clipboard.write([new ClipboardItem({'image/png':await pngPhoto(photo)})]);}catch(error){if(error.message==='IMAGE_TOO_LARGE')throw error;throw new Error('CLIPBOARD_DENIED');}},
  onExpire:leaseId=>request(api,'lease.expired','background',{leaseId})
});
api.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m?.target!=='media')return false;
  if(!validEnvelope(m)||sender.id!==api.runtime.id||sender.tab||sender.url && sender.url!==api.runtime.getURL('background.js')){reply(failure(m,new Error('INVALID_MESSAGE')));return false;}
  const actions={'media.copy':()=>host.copy(m.payload.owner,m.payload.snapshot),'media.prepare':()=>host.prepare(m.payload.owner,m.payload.snapshot),'lease.bind':()=>host.bind(m.payload.leaseId,m.payload.downloadId),'lease.release':()=>host.release(m.payload.leaseId),'lease.inventory':()=>host.inventory()};
  if(__VALIDATION__){actions['validation.configure']=()=>host.configure(m.payload);actions['validation.release']=()=>host.releaseBarrier(m.payload.tabId);}
  const action=actions[m.command];if(!action){reply(failure(m,new Error('INVALID_MESSAGE')));return false;}
  Promise.resolve().then(action).then(result=>reply(success(m,result)),error=>reply(failure(m,error)));return true;
});
