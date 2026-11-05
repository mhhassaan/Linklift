import {normalizeService} from './settings.js';

export const SOCIAL_KEY='tweetx.social';
export const SOCIAL_DEFAULTS=Object.freeze({instagram:'zzinstagram.com',reddit:'vxreddit.com',tiktok:'tfxktok.com'});
const ALTERNATIVES={instagram:'ddinstagram.com',reddit:'rxddit.com',tiktok:'tnktok.com'};
const HOSTS={
  instagram:new Set(['instagram.com','www.instagram.com']),
  reddit:new Set(['reddit.com','www.reddit.com','old.reddit.com','new.reddit.com','m.reddit.com','sh.reddit.com']),
  tiktok:new Set(['tiktok.com','www.tiktok.com'])
};
export function socialPlatform(input){
  try{
    const url=new URL(input);
    if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
    return Object.keys(HOSTS).find(platform=>HOSTS[platform].has(url.hostname))||null;
  }catch{return null;}
}
export function socialSettings(value){
  return Object.fromEntries(Object.entries(SOCIAL_DEFAULTS).map(([platform,fallback])=>{
    const stored=value?.[platform],services=[];
    for(const entry of Array.isArray(stored?.services)?stored.services:[]){
      try{const domain=normalizeService(entry);if(services.length<20&&!services.includes(domain))services.push(domain);}catch{/* Ignore invalid local entries. */}
    }
    if(!services.length)services.push(fallback,ALTERNATIVES[platform]);
    let activeDomain;try{activeDomain=normalizeService(stored?.activeDomain);}catch{}
    if(!services.includes(activeDomain)){
      activeDomain=fallback;
      if(!services.includes(fallback)){if(services.length===20)services.pop();services.push(fallback);}
    }
    return [platform,{services,activeDomain}];
  }));
}
export function transformSocialUrl(input,domain){
  const platform=socialPlatform(input);if(!platform)throw new Error('INVALID_POST');
  const url=new URL(input),path=url.pathname;
  const valid=platform==='instagram'?/^\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$/.test(path):
    platform==='reddit'?/^\/(?:r\/[A-Za-z0-9_]+\/|user\/[A-Za-z0-9_-]+\/)?comments\/[a-z0-9]+(?:\/[^/?#]*){0,3}\/?$/i.test(path):
    /^\/@[A-Za-z0-9_.]+\/(?:video|photo)\/\d{1,30}\/?$/.test(path);
  if(!valid)throw new Error('INVALID_POST');
  // Instagram's carousel index selects content rather than tracking the share.
  const index=platform==='instagram'?url.searchParams.get('img_index'):null;
  const query=index&&/^[1-9]\d{0,3}$/.test(index)?`?img_index=${index}`:'';
  return `https://${normalizeService(domain)}${path}${query}`;
}
