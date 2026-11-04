import {fetchPhoto,MAX_BYTES,MAX_PIXELS,imageFilename} from '../shared/media.js';
import {nativeClock} from '../shared/api.js';
import {uuid} from '../shared/protocol.js';

export async function decodeImage(blob) {
  const bitmap=await createImageBitmap(blob);
  if(!bitmap.width || !bitmap.height || bitmap.width*bitmap.height>MAX_PIXELS){bitmap.close();throw new Error('IMAGE_TOO_LARGE');}
  return {width:bitmap.width,height:bitmap.height,bitmap,close:()=>bitmap.close()};
}
export async function pngPhoto(photo) {
  if(photo.blob.type==='image/png')return photo.blob;
  const canvas=new OffscreenCanvas(photo.width,photo.height);
  canvas.getContext('2d').drawImage(photo.bitmap,0,0);
  const blob=await canvas.convertToBlob({type:'image/png'});
  if(blob.size>MAX_BYTES)throw new Error('IMAGE_TOO_LARGE');
  return blob;
}
export function createMediaHost({fetch:fetcher=globalThis.fetch,decode=decodeImage,writeImage,createObjectURL=blob=>URL.createObjectURL(blob),revokeObjectURL=url=>URL.revokeObjectURL(url),clock=nativeClock,onExpire=async()=>{},validation=false}={}) {
  const helperGeneration=uuid(),leases=new Map(),timers=new Map(),faults=new Map(),barriers=new Map();let busy=false,disposed=false,activeAbort=null,activeOwner=null;
  const descriptor=lease=>structuredClone(lease);
  function inventory(){return {helperGeneration,leases:[...leases.values()].map(descriptor)};}
  async function release(leaseId){const lease=leases.get(leaseId);if(!lease)return {released:true};clock.clearTimeout(timers.get(leaseId));timers.delete(leaseId);revokeObjectURL(lease.blobUrl);leases.delete(leaseId);return {released:true};}
  async function perform(owner,snapshot,prepare) {
    if(disposed)throw new Error('HELPER_LOST');
    if(busy || (prepare && (leases.size>=2 || [...leases.values()].reduce((sum,l)=>sum+l.byteLength,0)+MAX_BYTES>64*1024*1024)))throw new Error('BUSY');
    busy=true;activeAbort=new AbortController();activeOwner=owner.documentToken;let photo;
    try {
      const behavior=validation?faults.get(owner.tabId):null;faults.delete(owner.tabId);let attempts=0;
      photo=await fetchPhoto(snapshot.mediaUrl,{fetch:async(...args)=>{
        attempts++;
        if(behavior==='both-fetches-failed'||behavior==='redirect'||behavior==='preferred-fetch-failed'&&attempts===1)throw new Error('FETCH_FAILED');
        return fetcher(...args);
      },decode,signal:activeAbort.signal});
      if(disposed)throw new Error('HELPER_LOST');
      if(activeAbort.signal.aborted)throw new Error('OWNER_GONE');
      if(!prepare){if(!writeImage||behavior==='clipboard-denied')throw new Error('CLIPBOARD_DENIED');await writeImage(photo);return {width:photo.width,height:photo.height,rendition:photo.rendition};}
      const createdAt=clock.now();const lease={leaseId:uuid(),helperGeneration,owner:structuredClone(owner),blobUrl:createObjectURL(photo.blob),byteLength:photo.blob.size,filename:imageFilename(snapshot.mediaId,snapshot.postId,photo.blob.type),createdAt,expiresAt:createdAt+300000,state:'READY',downloadId:null};
      leases.set(lease.leaseId,lease);
      const timer=clock.setTimeout(async()=>{try{await onExpire(lease.leaseId);}finally{await release(lease.leaseId);}},300000);timer?.unref?.();timers.set(lease.leaseId,timer);
      if(barriers.has(owner.tabId))await barriers.get(owner.tabId).promise;
      if(disposed || !leases.has(lease.leaseId))throw new Error('HELPER_LOST');
      return {...descriptor(lease),rendition:photo.rendition};
    }finally{photo?.close?.();busy=false;activeAbort=null;activeOwner=null;}
  }
  return {inventory,copy:(owner,snapshot)=>perform(owner,snapshot,false),prepare:(owner,snapshot)=>perform(owner,snapshot,true),release,
    async bind(leaseId,downloadId){const lease=leases.get(leaseId);if(!lease)throw new Error('HELPER_LOST');lease.downloadId=downloadId;lease.state='BOUND';return {leaseId,state:'BOUND'};},
    configure({tabId,fault,barrier}){if(!validation)throw new Error('INVALID_MESSAGE');faults.set(tabId,fault);barriers.get(tabId)?.resolve();barriers.delete(tabId);if(barrier==='prepared'){let resolve;const promise=new Promise(done=>{resolve=done;});barriers.set(tabId,{promise,resolve});}},
    releaseBarrier(tabId){barriers.get(tabId)?.resolve();barriers.delete(tabId);},
    cancelOwner(documentToken){if(activeOwner===documentToken)activeAbort?.abort(new Error('OWNER_GONE'));},
    dispose(){disposed=true;activeAbort?.abort();for(const b of barriers.values())b.resolve();barriers.clear();for(const id of [...leases.keys()])void release(id);}
  };
}
