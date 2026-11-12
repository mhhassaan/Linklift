import {MAX_MEDIA_BYTES,safeMediaUrl} from './model.js';
import {isUuid} from '../shared/protocol.js';

// TikTok playback links can require the normal page session. This component has
// no extension APIs: the browser applies its usual cookies, CORS and site policy.
export function installPageTransfer(window,{fetch:fetcher,findPost}){
  const pending=new Map(),leases=new Map();let disposed=false;
  const reply=(request,result,error)=>window.postMessage({channel:'linklift.media.v1',type:'tiktok-download-result',operationId:request.operationId,documentToken:request.documentToken,...(error?{error}:{result})},window.location.origin);
  function release(id){const lease=leases.get(id);if(!lease)return;window.clearTimeout(lease.timer);window.URL.revokeObjectURL(lease.blobUrl);leases.delete(id);}
  async function prepare(request){
    const {operationId,documentToken,postId,url}=request;
    if(!isUuid(operationId)||!isUuid(documentToken))return;
    if(pending.size||leases.size>=2||leases.has(operationId)){reply(request,null,'BUSY');return;}
    let source;try{source=safeMediaUrl('tiktok',url);}catch{reply(request,null,'INVALID_MEDIA');return;}
    const post=findPost(postId);
    if(!post?.items.some(item=>item.kind==='video'&&item.variants.some(v=>v.url===source&&v.type==='video/mp4'))){reply(request,null,'MEDIA_UNAVAILABLE');return;}
    const controller=new AbortController();pending.set(operationId,controller);
    let reader,blobUrl;
    try{
      const response=await fetcher(source,{credentials:'include',mode:'cors',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)])});
      if(!response.ok||response.redirected){await response.body?.cancel();throw new Error(response.status===403?'SERVER_FORBIDDEN':response.status===401?'SERVER_UNAUTHORIZED':'FETCH_FAILED');}
      let expectedLength;
      if(response.status===206){const range=response.headers.get('content-range')?.match(/^bytes 0-(\d+)\/(\d+)$/);if(!range||Number(range[1])+1!==Number(range[2])){await response.body?.cancel();throw new Error('UNSUPPORTED_MEDIA');}expectedLength=Number(range[2]);}
      if(Number(response.headers.get('content-length'))>MAX_MEDIA_BYTES){await response.body?.cancel();throw new Error('MEDIA_TOO_LARGE');}
      reader=response.body?.getReader();if(!reader)throw new Error('FETCH_FAILED');
      let size=0;const chunks=[];
      while(true){controller.signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;if((size+=value.byteLength)>MAX_MEDIA_BYTES)throw new Error('MEDIA_TOO_LARGE');chunks.push(value);}
      if(expectedLength!==undefined&&size!==expectedLength)throw new Error('UNSUPPORTED_MEDIA');
      const blob=new Blob(chunks,{type:'video/mp4'}),header=new TextDecoder('latin1').decode(await blob.slice(4,12).arrayBuffer());
      if(!header.startsWith('ftyp')||/avif|avis/.test(header))throw new Error('UNSUPPORTED_MEDIA');
      if(disposed||controller.signal.aborted)throw new Error('CANCELLED');
      blobUrl=window.URL.createObjectURL(blob);const timer=window.setTimeout(()=>release(operationId),300000);
      leases.set(operationId,{blobUrl,timer});reply(request,{blobUrl,byteLength:size});blobUrl=null;
    }catch(error){await reader?.cancel().catch(()=>{});if(blobUrl)window.URL.revokeObjectURL(blobUrl);reply(request,null,controller.signal.aborted?'CANCELLED':error.name==='TimeoutError'?'FETCH_TIMEOUT':error instanceof TypeError?'NETWORK_ERROR':error.message);}
    finally{reader?.releaseLock();pending.delete(operationId);}
  }
  function onMessage(event){
    const request=event.data;if(event.source!==window||event.origin!==window.location.origin||request?.channel!=='linklift.media.v1')return;
    if(request.type==='tiktok-download')void prepare(request);
    if(request.type==='tiktok-download-release'&&isUuid(request.operationId)){pending.get(request.operationId)?.abort();release(request.operationId);}
  }
  function stop(){for(const controller of pending.values())controller.abort();for(const id of leases.keys())release(id);}
  function pagehide(event){stop();if(!event.persisted)dispose();}
  function dispose(){disposed=true;stop();window.removeEventListener('message',onMessage);window.removeEventListener('pagehide',pagehide);}
  window.addEventListener('message',onMessage);window.addEventListener('pagehide',pagehide);
  return {dispose};
}
