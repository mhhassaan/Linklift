const CARDS='[data-e2e="recommend-list-item-container"],[data-e2e="browse-video"],article';
const PREVIEWS='[data-e2e="user-post-item"],[data-e2e="explore-item"],[data-e2e^="explore-hero-card-"]';
const playerId=node=>node?.id?.match(/^xgwrapper-.*-(\d{1,30})$/)?.[1];
const pathId=path=>path.match(/^\/@[\w.]+\/(?:video|photo)\/(\d{1,30})\/?$/)?.[1];

export function tiktokLink(root,id){
  return [root,...root.querySelectorAll('a[href]')].find(node=>{
    try{const url=new URL(node.href),post=pathId(url.pathname);return ['tiktok.com','www.tiktok.com'].includes(url.hostname)&&url.protocol==='https:'&&post&&(!id||post===id);}catch{return false;}
  });
}
export function tiktokPostId(root,location){
  const players=[...root.querySelectorAll('[id^="xgwrapper-"]')].map(playerId).filter(Boolean);
  if(root.matches('[role="dialog"]')){
    const current=pathId(location.pathname);return current?(players.includes(current)?current:null):players.length===1?players[0]:null;
  }
  return players[0]||pathId(tiktokLink(root)?.pathname||'')||pathId(location.pathname);
}
export function tiktokRoots(document){
  const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(root=>root.querySelector('[data-e2e="browse-video"]')&&!root.closest('[hidden],[aria-hidden="true"]'));
  // A modal owns the active post; ignore its preloaded player and background grid.
  if(dialogs.length)return dialogs;
  const roots=new Set(document.querySelectorAll(CARDS));
  for(const link of document.querySelectorAll('a[href*="/video/"]')){
    if(!tiktokLink(link)||!link.querySelector('img,video')||[...roots].some(root=>root.contains(link)))continue;
    roots.add(link.closest(PREVIEWS)||link);
  }
  for(const video of document.querySelectorAll('video')){
    if([...roots].some(root=>root.contains(video)))continue;
    const root=video.closest(PREVIEWS)||video.closest('a[href*="/video/"]');
    if(root)roots.add(root);
  }
  return [...roots].filter(root=>![...roots].some(other=>other!==root&&other.contains(root)));
}
export function tiktokMediaScope(root,location){
  if(!root.matches('[role="dialog"]'))return root;
  const id=tiktokPostId(root,location);
  return [...root.querySelectorAll('[data-e2e="browse-video"]')].find(node=>[...node.querySelectorAll('[id^="xgwrapper-"]')].some(player=>playerId(player)===id))||root;
}
function visibleArea(node){
  const rect=node.getBoundingClientRect(),window=node.ownerDocument.defaultView;
  if(node.closest('[hidden],[aria-hidden="true"]'))return 0;
  return Math.max(0,Math.min(window.innerWidth,rect.right)-Math.max(0,rect.left))*Math.max(0,Math.min(window.innerHeight,rect.bottom)-Math.max(0,rect.top));
}
export function tiktokSharedRail(root){
  if(!root.matches('[data-e2e="recommend-list-item-container"]'))return null;
  const scope=root.closest('[id^="main-content-"],main,[role="main"]');
  return scope?.querySelector('[data-e2e="anchoring-engagement-vertical"]')||null;
}
export function tiktokShare(root){
  const own=root.querySelector('[data-e2e="share-icon"],[data-e2e="browse-share-group"] button[aria-label="Share"]');if(own)return own;
  const rail=tiktokSharedRail(root);if(!rail)return null;
  const scope=root.closest('[id^="main-content-"],main,[role="main"]');
  const cards=[...scope.querySelectorAll('[data-e2e="recommend-list-item-container"]')];
  const current=cards.reduce((best,node)=>visibleArea(node)>visibleArea(best)?node:best,cards[0]);
  return current===root&&visibleArea(root)>0?rail.querySelector('[data-e2e="share-icon"]'):null;
}
