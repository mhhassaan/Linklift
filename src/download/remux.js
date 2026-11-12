import {Input,BlobSource,MP4,WEBM,Output,Mp4OutputFormat,BufferTarget,EncodedVideoPacketSource,EncodedAudioPacketSource,EncodedPacketSink} from 'mediabunny';
import {MAX_MEDIA_BYTES} from './model.js';
export async function remuxMp4(video,audio,{signal,progress=()=>{}}={}){
  const inputs=[new Input({source:new BlobSource(video),formats:[MP4,WEBM]})];
  if(audio)inputs.push(new Input({source:new BlobSource(audio),formats:[MP4,WEBM]}));
  const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target:new BufferTarget()});
  try{
    const v=await inputs[0].getPrimaryVideoTrack(),a=await inputs[audio?1:0].getPrimaryAudioTrack();
    if(!v||audio&&!a)throw new Error('AUDIO_UNAVAILABLE');
    const tracks=[[v,new EncodedVideoPacketSource(await v.getCodec())]];
    output.addVideoTrack(tracks[0][1],{rotation:await v.getRotation()});
    if(a){const source=new EncodedAudioPacketSource(await a.getCodec());output.addAudioTrack(source);tracks.push([a,source]);}
    await output.start();
    let encodedBytes=0,finishedTracks=0;
    await Promise.all(tracks.map(async([track,source])=>{
      const config=await track.getDecoderConfig();if(!config)throw new Error('UNSUPPORTED_MEDIA');
      for await(const packet of new EncodedPacketSink(track).packets()){
        signal?.throwIfAborted();await source.add(packet,{decoderConfig:config});
        encodedBytes+=packet.data.byteLength;if(encodedBytes>MAX_MEDIA_BYTES-1024*1024)throw new Error('MEDIA_TOO_LARGE');
      }
      source.close();progress({stage:'Joining video and audio',fraction:++finishedTracks/tracks.length});
    }));
    signal?.throwIfAborted();await output.finalize();if(output.target.buffer.byteLength>MAX_MEDIA_BYTES)throw new Error('MEDIA_TOO_LARGE');
    return new Blob([output.target.buffer],{type:'video/mp4'});
  }finally{if(output.state!=='finalized')await output.cancel().catch(()=>{});for(const input of inputs)input.dispose();}
}
