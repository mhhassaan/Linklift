import {createMediaHost,pngPhoto} from './host.js';
export function firefoxMedia(api,onExpire) {
  return createMediaHost({onExpire,validation:__VALIDATION__,writeImage:async photo=>{
    try {const blob=await pngPhoto(photo);await api.clipboard.setImageData(await blob.arrayBuffer(),'png');}
    catch(error){if(error.message==='IMAGE_TOO_LARGE')throw error;throw new Error('CLIPBOARD_DENIED');}
  }});
}
