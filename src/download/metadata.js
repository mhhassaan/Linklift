import {normalizeItem} from './model.js';
const imageVariants=candidates=>(candidates||[]).map(c=>({url:c.url,width:c.width,height:c.height}));
const stringUrl=value=>typeof value==='string'?value:value?.UrlList?.[0]||value?.urlList?.[0];
export function extractMedia(platform,data){
  const posts=new Map(),seen=new WeakSet();let visited=0;
  function add(postId,items){
    if(!/^[-\w]{1,128}$/.test(String(postId||'')))return;
    const clean=[];for(const item of items)try{clean.push(normalizeItem(platform,item));}catch{}
    if(clean.length)posts.set(String(postId),{platform,postId:String(postId),items:clean.slice(0,32)});
  }
  function walk(node,depth=0){
    if(!node||typeof node!=='object'||depth>45||++visited>25000||seen.has(node))return;seen.add(node);
    if(platform==='x'){
      const x=node.legacy||node,postId=x.id_str||(node.legacy&&node.rest_id);
      if(postId&&x.extended_entities?.media)add(postId,x.extended_entities.media.map(m=>({id:String(m.id_str||m.media_key||'image').replaceAll(':','_'),kind:m.type==='animated_gif'?'gif':m.type==='video'?'video':'image',variants:m.type==='photo'?['orig','large'].map(name=>({url:`${m.media_url_https}?name=${name}`,width:m.original_info?.width,height:m.original_info?.height})):m.video_info?.variants?.filter(v=>v.content_type==='video/mp4').map(v=>({...v,type:v.content_type}))||[]})));
    }else if(platform==='instagram'&&(node.code||node.shortcode)){
      const items=node.carousel_media||node.edge_sidecar_to_children?.edges?.map(e=>e.node)||[node];
      add(node.code||node.shortcode,items.map((m,i)=>({id:String(m.pk||m.id||i),kind:m.is_video||m.video_versions||m.video_url?'video':'image',variants:m.video_versions?m.video_versions.map(v=>({...v,type:'video/mp4'})):m.video_url?[{url:m.video_url,width:m.dimensions?.width,height:m.dimensions?.height,type:'video/mp4'}]:m.image_versions2?imageVariants(m.image_versions2.candidates):m.display_resources?m.display_resources.map(v=>({url:v.src,width:v.config_width,height:v.config_height})):[{url:m.display_url}]})));
    }else if(platform==='tiktok'&&node.id&&(node.video||node.imagePost)){
      if(node.imagePost?.images)add(node.id,node.imagePost.images.map((m,i)=>({id:String(i),kind:'image',variants:[{url:stringUrl(m.imageURL||m.displayImage),width:m.imageWidth,height:m.imageHeight}]})));
      else{
        const v=node.video,variants=(v.bitrateInfo||[]).map(b=>({url:stringUrl(b.PlayAddr),bitrate:b.Bitrate,width:b.PlayAddr?.Width,height:b.PlayAddr?.Height,type:'video/mp4'}));
        const direct=stringUrl(v.playAddr)||stringUrl(v.downloadAddr);if(direct)variants.push({url:direct,width:v.width,height:v.height,type:'video/mp4'});
        add(node.id,[{id:String(node.id),kind:'video',variants}]);
      }
    }else if(platform==='reddit'&&node.id){
      const v=node.secure_media?.reddit_video||node.media?.reddit_video;
      if(v?.fallback_url)add(node.id,[{id:node.id,kind:v.is_gif?'gif':'video',variants:[{url:v.fallback_url,width:v.width,height:v.height,type:'video/mp4',...(!v.is_gif&&v.dash_url?{manifestUrl:v.dash_url}:{})}]}]);
      else if(node.gallery_data?.items&&node.media_metadata)add(node.id,node.gallery_data.items.map(g=>{const m=node.media_metadata[g.media_id];return {id:g.media_id,kind:m?.e==='AnimatedImage'?'gif':'image',variants:[{url:m?.s?.gif||m?.s?.u,width:m?.s?.x,height:m?.s?.y}]};}));
      else if(node.preview?.images){const m=node.preview.images[0],gif=m.variants?.gif||m.variants?.mp4;add(node.id,[{id:node.id,kind:gif?'gif':'image',variants:[gif?.source||m.source,...(gif?.resolutions||m.resolutions||[])].map(v=>({url:v.url,width:v.width,height:v.height}))}]);}
      else if(/^https:\/\/i\.redd\.it\//.test(node.url||''))add(node.id,[{id:node.id,kind:/\.gif(?:\?|$)/.test(node.url)?'gif':'image',variants:[{url:node.url}]}]);
    }
    for(const value of Object.values(node))if(value&&typeof value==='object')walk(value,depth+1);
  }
  walk(data);return [...posts.values()];
}
