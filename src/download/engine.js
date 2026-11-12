import {MAX_MEDIA_BYTES,normalizeItem,chooseVariant,safeMediaUrl,safeNativeVideoUrl,safePageVideoUrl} from './model.js';
import {convertVideoToGif} from './gif.js';
import {remuxMp4} from './remux.js';
function mediaType(bytes){
  const text=new TextDecoder('latin1').decode(bytes.slice(0,16));
  if(/^GIF8[79]a/.test(text))return 'image/gif';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes[0]===137&&text.slice(1,4)==='PNG')return 'image/png';
  if(text.startsWith('RIFF')&&text.slice(8,12)==='WEBP')return 'image/webp';
  if(text.slice(4,8)==='ftyp')return /avif|avis/.test(text)?'image/avif':'video/mp4';
  if(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)return 'video/webm';
  throw new Error('UNSUPPORTED_MEDIA');
}
export async function fetchMedia(platform,url,{fetch:fetcher=globalThis.fetch,signal,progress=()=>{},text=false,budget={used:0}}={}){
  signal?.throwIfAborted();url=safeMediaUrl(platform,url);
  let response;try{response=await fetcher(url,{credentials:'omit',redirect:'error',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(text?15000:120000)])});}
  catch(error){if(signal?.aborted)throw new Error('CANCELLED');throw new Error(error?.name==='TimeoutError'?'FETCH_TIMEOUT':'NETWORK_ERROR');}
  if(!response.ok||response.redirected){await response.body?.cancel().catch(()=>{});throw new Error(response.status===403?'SERVER_FORBIDDEN':response.status===401?'SERVER_UNAUTHORIZED':'FETCH_FAILED');}
  const max=text?2*1024*1024:MAX_MEDIA_BYTES;
  const length=Number(response.headers.get('content-length'))||0;if(length>max||budget.used+length>MAX_MEDIA_BYTES){await response.body?.cancel().catch(()=>{});throw new Error('MEDIA_TOO_LARGE');}
  const reader=response.body?.getReader();if(!reader)throw new Error('FETCH_FAILED');
  const chunks=[];let size=0;
  try{while(true){signal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.byteLength;budget.used+=value.byteLength;if(size>max||budget.used>MAX_MEDIA_BYTES)throw new Error('MEDIA_TOO_LARGE');chunks.push(value);progress({stage:'Downloading',fraction:length?size/length:null});}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const blob=new Blob(chunks);if(text)return blob.text();
  const type=mediaType(new Uint8Array(await blob.slice(0,32).arrayBuffer()));return blob.slice(0,blob.size,type);
}
export function dashSources(platform,xml,manifestUrl){
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.querySelector('parsererror,ContentProtection,SegmentTemplate,SegmentList')||doc.documentElement.getAttribute('type')==='dynamic')throw new Error('UNSUPPORTED_STREAM');
  const tracks=[];
  for(const rep of doc.querySelectorAll('Representation')){
    const adaptation=rep.parentElement,base=rep.querySelector('BaseURL');if(!base?.textContent)continue;
    const parentBase=adaptation.querySelector(':scope > BaseURL')?.textContent||'';
    const url=new URL(base.textContent.trim(),parentBase?new URL(parentBase,manifestUrl):manifestUrl).href;
    const type=rep.getAttribute('mimeType')||adaptation.getAttribute('mimeType')||adaptation.getAttribute('contentType')||'';
    tracks.push({url:safeMediaUrl(platform,url),type,width:Number(rep.getAttribute('width'))||0,height:Number(rep.getAttribute('height'))||0,bitrate:Number(rep.getAttribute('bandwidth'))||0});
  }
  const ranked=type=>tracks.filter(v=>v.type.includes(type)).sort((a,b)=>b.height*b.width-a.height*a.width||b.bitrate-a.bitrate);
  const videos=ranked('video'),video=videos[0],audio=ranked('audio')[0];
  const advertisesAudio=[...doc.querySelectorAll('AdaptationSet,Representation')].some(node=>/audio/i.test((node.getAttribute('mimeType')||'')+' '+(node.getAttribute('contentType')||'')));
  if(advertisesAudio&&!audio)throw new Error('AUDIO_UNAVAILABLE');
  if(!video)throw new Error('UNSUPPORTED_STREAM');return {video,audio,videos};
}
export async function resolveMediaVariants(spec,options={}){
  const item=normalizeItem(spec.platform,spec.item),first=item.variants[0];if(!first.manifestUrl)return item;
  const xml=await fetchMedia(spec.platform,first.manifestUrl,{...options,text:true}),{videos,audio}=dashSources(spec.platform,xml,first.manifestUrl);
  return normalizeItem(spec.platform,{...item,variants:videos.map(v=>({...v,...(audio?{audioUrl:audio.url}:{})}))});
}
export async function prepareMedia(spec,{fetch:fetcher=globalThis.fetch,signal,progress=()=>{},convertGif=convertVideoToGif,remux=remuxMp4,workerUrl}={}){
  if(!/^[-\w]{1,128}$/.test(spec.postId||''))throw new Error('INVALID_MEDIA');
  const item=normalizeItem(spec.platform,spec.item),variant=chooseVariant(item,spec.quality??0),budget={used:0};
  if(!['original','mp4',undefined].includes(spec.format)||!['best','small','compact',undefined].includes(spec.gifPreset))throw new Error('INVALID_QUALITY');
  if(spec.platform==='tiktok'&&item.kind==='video'&&(!spec.format||spec.format==='original')&&!variant.audioUrl&&!variant.manifestUrl){
    const source=spec.pageSource;if(!source)throw new Error('PAGE_CONTEXT_REQUIRED');
    if(!Number.isSafeInteger(source.byteLength)||source.byteLength<=0||source.byteLength>MAX_MEDIA_BYTES)throw new Error('INVALID_MEDIA');
    signal?.throwIfAborted();return {transfer:'page',platform:'tiktok',sourceOrigin:source.origin,directUrl:safePageVideoUrl(source.blobUrl,source.origin),byteLength:source.byteLength,filename:`linklift-tiktok-${spec.postId}-${item.id}.mp4`,rendition:'selected'};
  }
  // Original Instagram/TikTok MP4s need no decoding or conversion. Let the browser's
  // download manager transfer them, rather than reading the CDN response in an
  // extension document. GIFs and requests that need remuxing stay local jobs.
  const nativeMp4=spec.platform==='instagram'&&/\.mp4$/i.test(new URL(variant.url).pathname);
  if(nativeMp4&&item.kind==='video'&&(!spec.format||spec.format==='original')&&!variant.audioUrl&&!variant.manifestUrl){
    signal?.throwIfAborted();
    return {transfer:'native',platform:spec.platform,directUrl:safeNativeVideoUrl(spec.platform,variant.url),filename:`linklift-${spec.platform}-${spec.postId}-${item.id}.mp4`,rendition:'original'};
  }
  const options={fetch:fetcher,signal,progress,budget};let blob,audio;
  try{
    let videoUrl=variant.url,audioUrl=variant.audioUrl;
    if(variant.manifestUrl&&item.kind!=='gif'){
      const xml=await fetchMedia(spec.platform,variant.manifestUrl,{...options,text:true});const sources=dashSources(spec.platform,xml,variant.manifestUrl);
      videoUrl=sources.video.url;audioUrl=sources.audio?.url;
    }
    blob=await fetchMedia(spec.platform,videoUrl,options);
    if(item.kind==='image'&&!blob.type.startsWith('image/')||item.kind==='video'&&!blob.type.startsWith('video/'))throw new Error('UNSUPPORTED_MEDIA');
    if(item.kind==='gif'&&blob.type!=='image/gif'){
      if(!blob.type.startsWith('video/'))throw new Error('UNSUPPORTED_MEDIA');
      blob=await convertGif(blob,{signal,progress,preset:spec.gifPreset||'best',workerUrl});
      if(blob.type!=='image/gif'||!/^GIF8[79]a/.test(await blob.slice(0,6).text()))throw new Error('GIF_FAILED');
    }else if(item.kind==='video'&&(audioUrl||spec.format==='mp4')){
      if(audioUrl)audio=await fetchMedia(spec.platform,audioUrl,options);
      blob=await remux(blob,audio,{signal,progress});
    }
    signal?.throwIfAborted();if(blob.size>MAX_MEDIA_BYTES)throw new Error('MEDIA_TOO_LARGE');
    const ext={'image/gif':'gif','image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif','video/mp4':'mp4','video/webm':'webm'}[blob.type];if(!ext)throw new Error('UNSUPPORTED_MEDIA');
    return {blob,filename:`linklift-${spec.platform}-${spec.postId}-${item.id}.${ext}`,rendition:'selected'};
  }finally{audio=null;blob=null;}
}
