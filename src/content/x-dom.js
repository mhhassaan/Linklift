import {canonicalPostUrl} from '../shared/url.js';
import {mediaCandidates} from '../shared/media.js';

export function shareControl(target) {
  const button=target?.closest?.('button,[role="button"]');
  if(!button) return null;
  if(button.matches('[data-testid="share"],[data-testid="shareButton"]'))return button;
  // X has shipped this share-arrow SVG without a stable test ID.
  if([...button.querySelectorAll('svg path')].some(path=>/^M17\.53 7\.47|^M13 3\.414/.test(path.getAttribute('d')||'')))return button;
  const label=button.getAttribute('aria-label')||'';
  return /^(share(?: post| tweet)?|مشاركة|شیئر|compartir(?: publicación)?|partager(?: le post)?)$/i.test(label)?button:null;
}
export const COPY_LINK_SELECTOR='[role="menuitem"],[role="button"],button,a[href],[tabindex],[data-testid="copyLink"],[data-testid="copyLinkToTweet"]';
export function copyLinkControl(target) {
  const item=target?.closest?.(COPY_LINK_SELECTOR);
  if(!item)return null;
  const testId=item.getAttribute('data-testid');
  if(['copyLink','copyLinkToTweet'].includes(testId))return item;
  // A popup container may itself be clickable; its children's labels do not
  // make the whole popup the Copy link control.
  if(item.querySelector('[role="menuitem"],[role="button"],button,a[href]'))return null;
  const labels=[item.getAttribute('aria-label'),item.textContent,...[...item.querySelectorAll('span')].map(span=>span.textContent)].filter(Boolean);
  const matches=labels.some(value=>/^copy link(?: to (?:post|tweet))?$/i.test(value.replace(/[\u200b-\u200f\u2066-\u2069\ufeff]/g,'').replace(/\s+/g,' ').trim()));
  return matches?item:null;
}
export function copyLinkMenu(item){return item?.closest?.('[role="menu"],[data-testid="Dropdown"],[data-testid="dropdown"],[data-testid="sheetDialog"],[role="dialog"]')||item?.parentElement||null;}
export function resolvePost(control) {
  const root=control?.closest?.('[data-testid="tweet"],article');
  if(root) {
    const links=[...root.querySelectorAll('a[href]')].filter(link=>link.querySelector('time') && link.closest('[data-testid="tweet"],article')===root && !link.closest('[data-testid="quoteTweet"]'));
    const urls=new Set();
    for(const link of links) {try {urls.add(canonicalPostUrl(new URL(link.getAttribute('href'),control.ownerDocument.location.href).href));} catch { /* unrelated link */ }}
    if(urls.size===1)return [...urls][0];
  }
  // A viewer route alone does not prove which post owns this control.
  // Without an unambiguous local permalink, preserve X's native Share action.
  return null;
}
export function resolvePhoto(target) {
  if(!target?.closest)return null;
  const container=target.closest('[data-testid="tweetPhoto"]');
  const image=target.tagName==='IMG'?target:container?.querySelector('img');
  if(!image || (container && container.querySelectorAll('img').length!==1))return null;
  const mediaUrl=image.currentSrc||image.src;
  try {mediaCandidates(mediaUrl);} catch{return null;}
  const path=new URL(mediaUrl).pathname;
  const mediaId=path.split('/').at(-1).replace(/\.(jpg|jpeg|png|webp)$/,'');
  const quote=image.closest('[data-testid="quoteTweet"]');
  let postId=null;
  if(quote) {for(const link of quote.querySelectorAll('a[href]')) {try{postId=new URL(canonicalPostUrl(link.href)).pathname.split('/')[3];break;}catch{}}}
  else {const post=resolvePost(image);if(post)postId=new URL(post).pathname.split('/')[3];}
  return {mediaUrl,mediaId,postId};
}
