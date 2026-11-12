export function gifPlan(width,height,duration,preset='best'){
  const settings={best:{edge:Infinity,fps:15},small:{edge:720,fps:10},compact:{edge:480,fps:8}}[preset];
  if(!settings||!Number.isFinite(duration)||duration<=0||duration>60||!width||!height)throw new Error('GIF_LIMIT');
  const scale=Math.min(1,settings.edge/Math.max(width,height));width=Math.max(1,Math.round(width*scale));height=Math.max(1,Math.round(height*scale));
  const frames=Math.ceil(duration*settings.fps);
  if(frames>900||width*height*frames>100000000)throw new Error('GIF_LIMIT');
  return {width,height,frames,fps:settings.fps};
}
function waitEvent(target,event,signal,trigger){
  return new Promise((resolve,reject)=>{
    let timer;
    const clear=()=>{clearTimeout(timer);target.removeEventListener(event,done);target.removeEventListener('error',fail);signal?.removeEventListener('abort',abort);};
    const done=()=>{clear();resolve();},fail=()=>{clear();reject(new Error('GIF_DECODE_FAILED'));},abort=()=>{clear();reject(signal.reason||new Error('CANCELLED'));};
    if(signal?.aborted){abort();return;}
    target.addEventListener(event,done,{once:true});target.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(fail,20000);
    try{trigger();}catch(error){clear();reject(error);}
  });
}
export async function convertVideoToGif(blob,{signal,preset='best',progress=()=>{},document:doc=globalThis.document,workerUrl,Worker:WorkerClass=globalThis.Worker,urls=URL}={}){
  const video=doc.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;
  const url=urls.createObjectURL(blob);let worker,canvas,pending;
  try{
    await waitEvent(video,'loadeddata',signal,()=>{video.src=url;video.load();});
    const plan=gifPlan(video.videoWidth,video.videoHeight,video.duration,preset);
    canvas=doc.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('GIF_FAILED');
    worker=new WorkerClass(workerUrl);worker.onmessage=({data})=>{const current=pending;pending=null;if(!current)return;clearTimeout(current.timer);data.error?current.reject(new Error(data.error)):current.resolve(data);};
    worker.onerror=()=>{if(pending){clearTimeout(pending.timer);pending.reject(new Error('GIF_FAILED'));pending=null;}};
    const ask=(data,transfer=[])=>new Promise((resolve,reject)=>{pending={resolve,reject,timer:setTimeout(()=>{pending=null;reject(new Error('GIF_FAILED'));},30000)};worker.postMessage(data,transfer);});
    const abort=()=>{if(pending){clearTimeout(pending.timer);pending.reject(signal.reason||new Error('CANCELLED'));pending=null;}};
    signal?.addEventListener('abort',abort,{once:true});
    try{
      for(let i=0;i<plan.frames;i++){
        signal?.throwIfAborted();const time=Math.min(i/plan.fps,Math.max(0,video.duration-.001));
        if(Math.abs(video.currentTime-time)>.0001)await waitEvent(video,'seeked',signal,()=>{video.currentTime=time;});
        context.drawImage(video,0,0,plan.width,plan.height);
        const rgba=context.getImageData(0,0,plan.width,plan.height).data;
        await ask({rgba:rgba.buffer,width:plan.width,height:plan.height,delay:Math.max(10,Math.round((Math.min(video.duration,(i+1)/plan.fps)-i/plan.fps)*1000))},[rgba.buffer]);
        progress({stage:'Converting GIF',fraction:(i+1)/plan.frames});
      }
      signal?.throwIfAborted();const result=await ask({finish:true});return new Blob([result.bytes],{type:'image/gif'});
    }finally{signal?.removeEventListener('abort',abort);}
  }finally{
    if(pending)clearTimeout(pending.timer);worker?.terminate();video.pause();video.removeAttribute('src');video.load();video.remove();if(canvas){canvas.width=0;canvas.height=0;}urls.revokeObjectURL(url);
  }
}
