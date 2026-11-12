import {createGifEncoder} from './gif-encoder.js';
const encoder=createGifEncoder();
self.onmessage=({data})=>{
  try{
    if(data.finish){const bytes=encoder.finish();self.postMessage({bytes},[bytes.buffer]);}
    else{encoder.frame(new Uint8ClampedArray(data.rgba),data.width,data.height,data.delay);self.postMessage({ready:true});}
  }catch(error){self.postMessage({error:error.message});}
};
