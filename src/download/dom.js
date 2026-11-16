const POST_LINK='a[href*="/p/"],a[href*="/reel/"],a[href*="/reels/"],a[href*="/tv/"]';
export const REDDIT_PLAYERS='shreddit-player,shreddit-player-2';
export const isVideoNode=node=>node.tagName==='VIDEO'||node.matches?.(REDDIT_PLAYERS+', [data-e2e="feed-video"]');
export function instagramCode(input){try{return new URL(input,'https://www.instagram.com').pathname.match(/^\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([-\w]+)\/?$/)?.[1]||null;}catch{return null;}}
const ACTIONS='[aria-label="Share"],[aria-label="Send"],[aria-label="Save"]';
export function instagramPostId(root,location){
  if(root.matches(POST_LINK))return instagramCode(root.href);
  const links=[...root.querySelectorAll(POST_LINK)].filter(link=>instagramCode(link.href));
  return instagramCode((links.find(link=>link.querySelector('time'))||links[0])?.href)||instagramCode(location.href);
}
export function isCommentMedia(node,root){
  for(let parent=node.parentElement;parent&&parent!==root;parent=parent.parentElement){
    if(parent.matches('[data-testid*="comment" i],[data-e2e="comment-list"],shreddit-comment'))return true;
    if(parent.querySelector('a[href*="/c/"]')&&!parent.querySelector(ACTIONS))return true;
  }
  return false;
}
function postMedia(element){return [...element.querySelectorAll('video,img')].filter(node=>!isCommentMedia(node,element)&&(node.tagName==='VIDEO'||!node.closest('header,nav')&&!/profile picture/i.test(node.alt||'')&&!(node.width>0&&node.width<100||node.height>0&&node.height<70)));}
export function composedParent(node){return node.assignedSlot||node.parentElement||node.getRootNode()?.host||null;}
export function deepElements(root,selector,onShadow=()=>{}){
  const found=[];let visited=0;
  function walk(scope,depth){
    if(depth>10||visited>12000)return;
    if(scope.shadowRoot&&!scope.hasAttribute('data-linklift-download')){onShadow(scope.shadowRoot);walk(scope.shadowRoot,depth+1);}
    found.push(...scope.querySelectorAll(selector));
    for(const element of scope.querySelectorAll('*')){
      if(++visited>12000)break;
      if(element.shadowRoot&&!element.hasAttribute('data-linklift-download')){onShadow(element.shadowRoot);walk(element.shadowRoot,depth+1);}
    }
  }
  walk(root,0);return found;
}
export function instagramRoots(document,location){
  const roots=new Set([...document.querySelectorAll('article,[role="article"]')].filter(root=>postMedia(root).length&&!(root.querySelector('a[href*="/c/"]')&&!root.querySelector(ACTIONS)))),current=instagramCode(location.href);
  const fallbacks=new Set();
  // Start at native actions, not profile-grid cover images. Real post pages can
  // have more than fifteen wrapper divs between their video and action row.
  for(const action of document.querySelectorAll(ACTIONS)){
    let fallback=null;
    for(let parent=action.parentElement,depth=0;parent&&depth<28;parent=parent.parentElement,depth++){
      if(parent.matches('main,[role="main"],body'))break;
      if(!postMedia(parent).length)continue;
      const ids=new Set([...parent.querySelectorAll(POST_LINK)].map(a=>instagramCode(a.href)).filter(Boolean));
      if(ids.size===1){if(!parent.closest('article,[role="article"]'))roots.add(parent);fallback=null;break;}
      if(ids.size>1){fallback=null;break;}
      fallback||=parent;
    }
    if(fallback)fallbacks.add(fallback);
  }
  if(current&&fallbacks.size===1&&![...roots].some(root=>instagramPostId(root,location)===current)){
    const fallback=[...fallbacks][0];if(![...roots].some(root=>root.contains(fallback)||fallback.contains(root)))roots.add(fallback);
  }
  if(current&&![...roots].some(root=>instagramPostId(root,location)===current)){
    const main=document.querySelector('main,[role="main"]')||document.querySelector('[role="dialog"]');
    if(main){
      const candidates=postMedia(main).filter(node=>![...roots].some(root=>root.contains(node))&&!node.closest(POST_LINK));
      const node=candidates.find(n=>n.tagName==='VIDEO')||candidates[0];
      if(node){let root=node.parentElement;for(let i=0;i<3&&root.parentElement&&root.parentElement!==main;i++){const parent=root.parentElement;if([...parent.querySelectorAll(POST_LINK)].some(a=>instagramCode(a.href)&&instagramCode(a.href)!==current))break;root=parent;}roots.add(root);}
    }
  }
  const opened=[...roots].filter(root=>root.closest('[role="dialog"]')&&!root.closest('[hidden],[aria-hidden="true"]'));
  if(opened.length)return opened.filter(root=>!opened.some(other=>other!==root&&root.contains(other)));
  for(const link of document.querySelectorAll(POST_LINK)){
    if(!instagramCode(link.href)||!postMedia(link).length||[...roots].some(root=>root.contains(link)))continue;
    roots.add(link);
  }
  return [...roots].filter(root=>![...roots].some(other=>other!==root&&root.contains(other)));
}
export function instagramSlideIndex(node,total){
  const slide=node.closest('li,[aria-roledescription="slide"]');if(!slide)return null;
  const position=slide.getAttribute('aria-posinset');if(/^[1-9]\d*$/.test(position||'')){const index=Number(position)-1;if(index<total)return index;}
  const transform=slide.style.transform||node.ownerDocument.defaultView.getComputedStyle(slide).transform;
  const offset=transform.match(/^translateX\((-?[\d.]+)px\)$/)?.[1]??transform.match(/^matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*(-?[\d.]+),[^)]+\)$/)?.[1];
  const width=slide.getBoundingClientRect().width||node.getBoundingClientRect().width||node.width;
  if(offset!==undefined&&width>1){const raw=Number(offset)/width,index=Math.round(raw);if(index>=0&&index<total&&Math.abs(raw-index)<.03)return index;}
  const siblings=[...slide.parentElement.children].filter(element=>element.matches('li,[aria-roledescription="slide"]')&&element.querySelector('img,video'));
  return siblings.length===total?siblings.indexOf(slide):null;
}
export function redditMedia(root,onShadow){
  const all=deepElements(root,'img,video,'+REDDIT_PLAYERS,onShadow),players=all.filter(n=>n.matches(REDDIT_PLAYERS));
  return all.filter(node=>{
    if(players.includes(node))return true;
    for(let parent=composedParent(node);parent&&parent!==root;parent=composedParent(parent))if(players.includes(parent))return false;
    return true;
  });
}
import {tiktokShare,tiktokSharedRail} from './tiktok-dom.js';
export function actionMount(root,platform){
  if(platform==='x'){
    const group=[...root.querySelectorAll('[role="group"]')].find(g=>g.querySelector('[data-testid="reply"],[data-testid="retweet"],[data-testid="like"]')&&!g.closest('[data-testid="quoteTweet"]'));
    if(group)return {parent:group,layout:'action'};
  }
  if(platform==='reddit'){
    const share=deepElements(root,'shreddit-post-share-button,[data-post-click-location="share"],button[aria-label="Share"],[data-testid="share"],[slot="share-button"],button').find(node=>!node.closest('shreddit-comment')&&(node.matches('shreddit-post-share-button,[data-post-click-location="share"],button[aria-label="Share"],[data-testid="share"],[slot="share-button"]')||node.textContent.trim()==='Share'));
    if(share?.parentElement)return {parent:share.parentElement,after:share,layout:'action',native:share};
  }
  if(platform==='instagram'||platform==='tiktok'){
    if(platform==='instagram'&&root.matches(POST_LINK))return {parent:root,layout:'preview'};
    const share=platform==='tiktok'?tiktokShare(root):root.querySelector('[aria-label="Share"],[aria-label="Send"]');
    if(platform==='tiktok'&&share?.closest('[data-e2e="browse-share-group"]'))return {parent:share.parentElement,after:share,native:share,layout:'native-row'};
    if(platform==='tiktok'&&!share&&tiktokSharedRail(root))return {parent:root.ownerDocument.body,layout:'inactive'};
    if(platform==='tiktok'&&!share&&root.matches('[data-e2e="user-post-item"],[data-e2e="explore-item"],[data-e2e^="explore-hero-card-"],a[href*="/video/"]'))return {parent:root,layout:'preview'};
    const action=share?.closest('button,[role="button"]')||share;
    for(let parent=action?.parentElement,depth=0;parent&&parent!==root&&depth<6;parent=parent.parentElement,depth++){
      // Only join an action-only flex group. Never insert into player/media
      // wrappers: their flex children determine video sizing on both sites.
      const window=root.ownerDocument.defaultView;
      if(parent.querySelector('video,picture')||[...parent.querySelectorAll('img')].some(img=>{
        const rect=img.getBoundingClientRect(),css=window.getComputedStyle(img),width=rect.width||img.width||parseFloat(css.width)||0,height=rect.height||img.height||parseFloat(css.height)||0;
        return width>96||height>96||!width&&!height&&!img.closest('[data-e2e*="avatar"],a[href^="/@"]');
      }))break;
      const css=root.ownerDocument.defaultView.getComputedStyle(parent);
      if(!/^(inline-)?flex$/.test(css.display))continue;
      const peer=parent.querySelector(platform==='instagram'?'[aria-label="Like"],[aria-label="Unlike"],[aria-label="Comment"],[aria-label="Save"]':'[data-e2e="like-icon"],[data-e2e="comment-icon"]');
      if(!peer)continue;
      let after=action;while(after.parentElement!==parent)after=after.parentElement;
      return {parent,after,native:action,layout:css.flexDirection.startsWith('column')?'native-rail':'native-row'};
    }
    return {parent:root.ownerDocument.body,layout:'floating'};
  }
  return {parent:root,layout:'row'};
}
import {normalizeItem} from './model.js';
export function redditEmbeddedItem(node,id){
  try{
    const raw=node.getAttribute('packaged-media-json');if(!raw||raw.length>200000)return null;
    const data=JSON.parse(raw),gif=node.hasAttribute('gif')||data.isGif===true||node.closest('shreddit-post')?.getAttribute('post-type')==='gif';
    const variants=(data.playbackMp4s?.permutations||[]).slice(0,32).map(p=>{
      const url=p.source?.url,parsed=new URL(url),variant={url,width:p.source?.dimensions?.width,height:p.source?.dimensions?.height,type:'video/mp4'};
      if(!gif&&parsed.hostname==='v.redd.it')variant.manifestUrl=new URL('/'+parsed.pathname.split('/').filter(Boolean)[0]+'/DASHPlaylist.mpd',parsed.origin).href;
      return variant;
    });
    return normalizeItem('reddit',{id,kind:gif?'gif':'video',variants});
  }catch{return null;}
}
export function currentGalleryIndex(root,entries,window,fallback=0){
  const carousel=deepElements(root,'gallery-carousel,faceplate-carousel,[aria-roledescription="carousel"],[data-current-index]')[0];
  for(const name of ['current-index','selected-index','active-index','data-current-index']){
    const raw=carousel?.getAttribute(name);if(raw!==null&&raw!==undefined&&/^\d+$/.test(raw)&&Number(raw)<entries.length)return Number(raw);
  }
  let best=fallback,area=0;
  entries.forEach((entry,index)=>{
    for(const node of entry.nodes||[entry.node]){
      if(!node?.isConnected||node.closest('[hidden],[aria-hidden="true"]'))continue;
      const rect=node.getBoundingClientRect();let left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(window.innerWidth,rect.right),bottom=Math.min(window.innerHeight,rect.bottom),hidden=false;
      for(let parent=node;parent;parent=composedParent(parent)){
        const css=window.getComputedStyle(parent);if(css.display==='none'||css.visibility==='hidden'||css.opacity==='0'){hidden=true;break;}
        if(/hidden|clip|scroll|auto/.test(css.overflow+' '+css.overflowX+' '+css.overflowY)){const clip=parent.getBoundingClientRect();left=Math.max(left,clip.left);top=Math.max(top,clip.top);right=Math.min(right,clip.right);bottom=Math.min(bottom,clip.bottom);}
        if(parent===root)break;
      }
      const visible=hidden?0:Math.max(0,right-left)*Math.max(0,bottom-top);if(visible>area){area=visible;best=index;}
    }
  });
  return best;
}
