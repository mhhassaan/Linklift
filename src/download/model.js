import {isXUrl} from '../shared/url.js';
import {socialPlatform} from '../shared/social.js';
export const DOWNLOAD_KEY='linklift.downloads';
export const MEDIA_CHANNEL='linklift.media.v1';
export const MAX_MEDIA_BYTES=256*1024*1024;
export const CDN_HOSTS={x:['pbs.twimg.com','video.twimg.com'],instagram:['cdninstagram.com','fbcdn.net'],reddit:['i.redd.it','preview.redd.it','external-preview.redd.it','v.redd.it','packaged-media.redd.it'],tiktok:['tiktokcdn.com','tiktokcdn-us.com','tiktokcdn-eu.com','tiktokv.com','tiktokv.us','byteoversea.com','ibytedtos.com','v16-webapp-prime.tiktok.com','v19-webapp-prime.tiktok.com']};
export const platformFor=url=>isXUrl(url)?'x':socialPlatform(url);
export function safeMediaUrl(platform,input){
  if(typeof input!=='string'||input.length>4096)throw new Error('INVALID_MEDIA');
  const url=new URL(input.replaceAll('&amp;','&'));
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!CDN_HOSTS[platform]?.some(host=>url.hostname===host||!host.endsWith('.tiktok.com')&&url.hostname.endsWith('.'+host)))throw new Error('INVALID_MEDIA');
  return url.href;
}
export function safeNativeVideoUrl(platform,input){
  const url=safeMediaUrl(platform,input);
  if(platform!=='tiktok'&&(platform!=='instagram'||!/\.mp4$/i.test(new URL(url).pathname)))throw new Error('INVALID_MEDIA');
  return url;
}
export function safePageVideoUrl(input,origin){
  if(!['https://www.tiktok.com','https://tiktok.com'].includes(origin)||typeof input!=='string'||!input.startsWith('blob:'+origin+'/')||!/^[-\w]{1,128}$/.test(input.slice(('blob:'+origin+'/').length)))throw new Error('INVALID_MEDIA');
  return input;
}
const size=n=>Number.isFinite(Number(n))&&Number(n)>0?Math.min(Number(n),100000):0;
export function normalizeItem(platform,item){
  if(!item||!['image','video','gif'].includes(item.kind)||typeof item.id!=='string'||!/^[-\w]{1,128}$/.test(item.id)||!Array.isArray(item.variants))throw new Error('INVALID_MEDIA');
  const variants=[];
  for(const v of item.variants.slice(0,32)){
    try{
      const url=safeMediaUrl(platform,v.url);
      if(variants.some(x=>x.url===url))continue;
      const type=/^[\w.+-]+\/[\w.+-]+$/.test(v.type||'')?v.type:'';
      variants.push({url,width:size(v.width),height:size(v.height),bitrate:Math.max(0,Math.min(Number(v.bitrate)||0,1e10)),type,
        ...(v.manifestUrl?{manifestUrl:safeMediaUrl(platform,v.manifestUrl)}:{}),...(v.audioUrl?{audioUrl:safeMediaUrl(platform,v.audioUrl)}:{})});
    }catch{/* A page cannot broaden CDN access through its metadata. */}
  }
  variants.sort((a,b)=>b.width*b.height-a.width*a.height||b.bitrate-a.bitrate);
  if(!variants.length)throw new Error('MEDIA_UNAVAILABLE');
  return {id:item.id,kind:item.kind,variants};
}
export function chooseVariant(item,index=0){if(!Number.isInteger(index)||!item.variants[index])throw new Error('INVALID_QUALITY');return item.variants[index];}
export const downloadEnabled=(settings,platform)=>settings?.[platform]!==false;
export function variantLabel(v,index){return (v.height>=100000?'Original size':v.height?`${v.height}p`:v.bitrate?`${Math.round(v.bitrate/1000)} kbps`:`Source ${index+1}`)+(index===0?' · Best':'');}
