import gifenc from 'gifenc/dist/gifenc.js';
const {GIFEncoder,quantize,applyPalette}=gifenc;
import {MAX_MEDIA_BYTES} from './model.js';
export function createGifEncoder(){
  const encoder=GIFEncoder();let frames=0;
  return {
    frame(rgba,width,height,delay){
      if(++frames>900||rgba.length!==width*height*4)throw new Error('GIF_LIMIT');
      const palette=quantize(rgba,256,{format:'rgb565'}),index=applyPalette(rgba,palette,'rgb565');
      encoder.writeFrame(index,width,height,{palette,delay,repeat:0});
      if(encoder.bytesView().length>MAX_MEDIA_BYTES)throw new Error('MEDIA_TOO_LARGE');
    },
    finish(){if(!frames)throw new Error('GIF_FAILED');encoder.finish();return encoder.bytes();}
  };
}
