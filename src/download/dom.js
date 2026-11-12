const POST_LINK='a[href*="/p/"],a[href*="/reel/"],a[href*="/reels/"],a[href*="/tv/"]';
export const REDDIT_PLAYERS='shreddit-player,shreddit-player-2';
export const isVideoNode=node=>node.tagName==='VIDEO'||node.matches?.(REDDIT_PLAYERS+', [data-e2e="feed-video"]');
export function instagramCode(input){try{return new URL(input,'https://www.instagram.com').pathname.match(/^\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([-\w]+)\/?$/)?.[1]||null;}catch{return null;}}
const ACTIONS='[aria-label="Share"],[aria-label="Save"]';
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
  // Start at native actions, not profile-grid cover images. Real post pages can
  // have more than fifteen wrapper divs between their video and action row.
  for(const action of document.querySelectorAll(ACTIONS)){
    for(let parent=action.parentElement,depth=0;parent&&depth<28;parent=parent.parentElement,depth++){
      if(parent.matches('main,[role="main"],body'))break;
      if(!postMedia(parent).length)continue;
      const ids=new Set([...parent.querySelectorAll(POST_LINK)].map(a=>instagramCode(a.href)).filter(Boolean));
      if(ids.size===1||!ids.size&&current){if(!parent.closest('article,[role="article"]'))roots.add(parent);break;}
    }
  }
  if(current){
    const main=document.querySelector('main,[role="main"]')||document.querySelector('[role="dialog"]');
    if(main){
      const candidates=postMedia(main).filter(node=>![...roots].some(root=>root.contains(node))&&!node.closest(POST_LINK));
      const node=candidates.find(n=>n.tagName==='VIDEO')||candidates[0];
      if(node){let root=node.parentElement;for(let i=0;i<3&&root.parentElement&&root.parentElement!==main;i++){const parent=root.parentElement;if([...parent.querySelectorAll(POST_LINK)].some(a=>instagramCode(a.href)&&instagramCode(a.href)!==current))break;root=parent;}roots.add(root);}
    }
  }
  return [...roots].filter(root=>![...roots].some(other=>other!==root&&root.contains(other)));
}
export function redditMedia(root,onShadow){
  const all=deepElements(root,'img,video,'+REDDIT_PLAYERS,onShadow),players=all.filter(n=>n.matches(REDDIT_PLAYERS));
  return all.filter(node=>{
    if(players.includes(node))return true;
    for(let parent=composedParent(node);parent&&parent!==root;parent=composedParent(parent))if(players.includes(parent))return false;
    return true;
  });
}
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
    const share=root.querySelector(platform==='instagram'?'[aria-label="Share"],[aria-label="Send"]':'[data-e2e="share-icon"]');
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
export function currentGalleryIndex(root,entries,window){
  const carousel=deepElements(root,'gallery-carousel,faceplate-carousel,[aria-roledescription="carousel"],[data-current-index]')[0];
  for(const name of ['current-index','selected-index','active-index','data-current-index']){
    const raw=carousel?.getAttribute(name);if(raw!==null&&raw!==undefined&&/^\d+$/.test(raw)&&Number(raw)<entries.length)return Number(raw);
  }
  let best=0,area=0;
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
