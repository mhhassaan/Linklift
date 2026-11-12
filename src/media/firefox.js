import {createMediaHost,pngPhoto} from './host.js';
import {prepareMedia,resolveMediaVariants} from '../download/engine.js';
export function firefoxMedia(api,onExpire,onProgress=()=>{}) {
  return createMediaHost({onExpire,onProgress,resolveDownload:resolveMediaVariants,processDownload:(spec,options)=>prepareMedia(spec,{...options,workerUrl:api.runtime.getURL('download/gif-worker.js')}),validation:__VALIDATION__,writeImage:async photo=>{
    try {const blob=await pngPhoto(photo);await api.clipboard.setImageData(await blob.arrayBuffer(),'png');}
    catch(error){if(error.message==='IMAGE_TOO_LARGE')throw error;throw new Error('CLIPBOARD_DENIED');}
  }});
}
