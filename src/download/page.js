import {extractMedia} from './metadata.js';
import {platformFor,MEDIA_CHANNEL,normalizeItem} from './model.js';
import {instagramCode} from './dom.js';
import {installPageTransfer} from './page-transfer.js';

// This observer has no extension privileges. Only normalized media URLs leave
// the page world; response bodies, request headers and account data do not.
export function observeMedia(window){
  const platform=platformFor(window.location.href);if(!platform)return;
  const cache=new Map(),seenScripts=new WeakSet();let scheduled=false;
  function publish(posts){
    for(const post of posts){cache.delete(post.postId);cache.set(post.postId,post);if(cache.size>120)cache.delete(cache.keys().next().value);window.postMessage({channel:MEDIA_CHANNEL,type:'records',posts:[post]},window.location.origin);}
  }
  const ingest=data=>publish(extractMedia(platform,data));
  function ingestText(text){
    const clean=text.replace(/^\s*for\s*\(;;\);\s*/,'');
    try{ingest(JSON.parse(clean));}catch{for(const line of clean.split('\n').slice(0,1000))try{ingest(JSON.parse(line));}catch{}}
  }
  function embedded(doc,path){
    for(const script of doc.querySelectorAll('script[type="application/json"],script[type="application/ld+json"],script#SIGI_STATE,script#__UNIVERSAL_DATA_FOR_REHYDRATION__'))if(script.textContent.length<=4*1024*1024)ingestText(script.textContent);
    if(platform==='instagram'){
      const postId=instagramCode(doc.querySelector('link[rel="canonical"]')?.href||path||window.location.href),video=doc.querySelector('meta[property="og:video:secure_url"],meta[property="og:video"]')?.content;
      if(postId&&video)try{publish([{platform,postId,items:[normalizeItem(platform,{id:'video',kind:'video',variants:[{url:video,type:'video/mp4'}]})]}]);}catch{}
    }
  }
  async function loadPost(path){
    try{
      const response=await nativeFetch.call(window,path,{credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok||Number(response.headers.get('content-length'))>4*1024*1024){await response.body?.cancel();return;}
      const reader=response.body.getReader(),parts=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;if((size+=value.byteLength)>4*1024*1024){await reader.cancel();return;}parts.push(value);}}finally{reader.releaseLock();}
      embedded(new window.DOMParser().parseFromString(await new Blob(parts).text(),'text/html'),path);
    }catch{/* The page's normal access restrictions remain in effect. */}
  }
  async function inspect(response){
    try{
      const type=response.headers.get('content-type')||'';
      if(!type.includes('json')||Number(response.headers.get('content-length'))>4*1024*1024)return;
      const reader=response.clone().body.getReader(),parts=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;if((size+=value.byteLength)>4*1024*1024){await reader.cancel();return;}parts.push(value);}}finally{reader.releaseLock();}
      ingestText(await new Blob(parts).text());
    }catch{/* The site's own response is never changed. */}
  }
  const nativeFetch=window.fetch;
  const transfer=platform==='tiktok'&&nativeFetch?installPageTransfer(window,{fetch:nativeFetch.bind(window),findPost:id=>cache.get(id)}):null;
  const watched=url=>(url.origin===window.location.origin||platform==='instagram'&&url.origin==='https://i.instagram.com')&&/api|graphql|\.json|aweme/.test(url.pathname);
  if(nativeFetch&&platform!=='reddit')window.fetch=function(...args){const result=Reflect.apply(nativeFetch,this,args);result.then(response=>{try{if(watched(new URL(response.url)))void inspect(response);}catch{}}).catch(()=>{});return result;};
  const xhrOpen=window.XMLHttpRequest.prototype.open;
  if(platform!=='reddit')window.XMLHttpRequest.prototype.open=function(method,url,...args){
    try{const target=new URL(url,window.location.href);if(watched(target))this.addEventListener('load',()=>{try{if(this.responseType==='json')ingest(this.response);else if((this.responseType===''||this.responseType==='text')&&this.responseText.length<4*1024*1024)ingest(JSON.parse(this.responseText));}catch{}},{once:true});}catch{}
    return Reflect.apply(xhrOpen,this,[method,url,...args]);
  };
  function scripts(){scheduled=false;for(const script of window.document.querySelectorAll('script[type="application/json"],script[type="application/ld+json"],script#SIGI_STATE,script#__NEXT_DATA__,script#__UNIVERSAL_DATA_FOR_REHYDRATION__')){
    if(seenScripts.has(script)||!script.textContent||script.textContent.length>4*1024*1024)continue;seenScripts.add(script);ingestText(script.textContent);
  }}
  const observer=new window.MutationObserver(()=>{if(!scheduled){scheduled=true;window.setTimeout(scripts,100);}});observer.observe(window.document,{childList:true,subtree:true});scripts();
  const onMessage=event=>{if(event.source!==window||event.origin!==window.location.origin||event.data?.channel!==MEDIA_CHANNEL)return;if(event.data.type==='ready')publish([...cache.values()]);
    if(event.data.type==='instagram-post'&&platform==='instagram'&&/^[-\w]{1,128}$/.test(event.data.postId||'')){
      void loadPost('/p/'+event.data.postId+'/');
    }
    if(event.data.type==='tiktok-post'&&platform==='tiktok'&&/^\d{1,30}$/.test(event.data.postId||'')){
      try{const url=new URL(event.data.path,window.location.origin),match=url.pathname.match(/^\/@[\w.]+\/(?:video|photo)\/(\d{1,30})\/?$/);if(url.origin===window.location.origin&&match?.[1]===event.data.postId)void loadPost(url.pathname);}catch{}
    }
    if(event.data.type==='reddit-post'&&platform==='reddit'&&typeof event.data.path==='string'&&event.data.path.length<512){
      try{const url=new URL(event.data.path,window.location.origin);if(url.origin===window.location.origin&&!url.search&&!url.hash&&/^\/(?:r\/[\w]+\/|user\/[-\w]+\/)?comments\/[a-z0-9]+(?:\/[^?#]*)?\/?$/i.test(url.pathname))void nativeFetch.call(window,url.pathname.replace(/\/$/,'')+'.json?raw_json=1',{credentials:'same-origin'}).then(inspect).catch(()=>{});}catch{}
    }
  };
  window.addEventListener('message',onMessage);
  return {dispose(){transfer?.dispose();observer.disconnect();window.removeEventListener('message',onMessage);}};
}
if(typeof window!=='undefined')observeMedia(window);
