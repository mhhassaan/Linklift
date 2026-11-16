import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installDownloads} from '../src/download/content.js';
import {browserContext} from './helpers/browser-context.js';
import {success} from '../src/shared/protocol.js';
import {installSocialClipboard} from '../src/content/social-page.js';

const A='7704331717493951746',B='7708105362322312470';
const player=id=>`<div id="xgwrapper-0-${id}"><video src="blob:https://www.tiktok.com/${id}"></video></div>`;
const rail='<section id="rail" style="display:flex;flex-direction:column"><div role="button" data-e2e="like-icon">Like</div><div id="share"><div role="button" data-e2e="share-icon"><button>Share</button><strong>43</strong></div></div></section>';
function setup(html,path='/',cached=true){
  const dom=new JSDOM(html,{url:'https://www.tiktok.com'+path}),ctx=browserContext(),calls=[];
  ctx.api.runtime.sendMessage=async m=>{calls.push(m);return success(m,{started:true});};
  const app=installDownloads({window:dom.window,api:ctx.api,isTrusted:()=>true});
  if(cached)app.receive([A,B].map(id=>({platform:'tiktok',postId:id,items:[{id,kind:'video',variants:[{url:`https://v16-webapp-prime.tiktok.com/${id}.mp4`,width:1080,height:1920}]}]})));
  return {dom,app,calls,close(){app.dispose();dom.window.close();}};
}
const rect=(top=0,left=0,width=400,height=700)=>({top,left,width,height,right:left+width,bottom:top+height});
const tick=()=>new Promise(r=>setTimeout(r,0));

test('TikTok modal uses the current video and its sibling share actions, not the preloaded next player',async()=>{
  const s=setup(`<div role="dialog"><div data-e2e="browse-video">${player(A)}</div><div data-e2e="browse-video">${player(B)}</div><aside><div data-e2e="browse-share-group" style="display:flex"><a aria-label="Embed">Embed</a><button aria-label="Share"></button></div><button data-e2e="browse-copy">Copy link</button></aside></div>`, `/@artist/video/${B}`);
  try{
    await s.app.ready;const hosts=s.dom.window.document.querySelectorAll('[data-linklift-download]');assert.equal(hosts.length,1);
    assert.equal(hosts[0].parentElement.getAttribute('data-e2e'),'browse-share-group');
    hosts[0].shadowRoot.querySelector('[data-action=download]').click();await tick();
    assert.equal(s.calls.at(-1)?.payload.spec.postId,B);assert.equal(s.calls.at(-1).payload.spec.item.kind,'video');
    assert.equal(s.calls.at(-1).payload.spec.item.variants[0].url,`https://v16-webapp-prime.tiktok.com/${B}.mp4`);
    s.dom.window.history.pushState({},'',`/@artist/video/${A}`);s.app.scan();
    const next=s.dom.window.document.querySelector('[data-linklift-download]');next.shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.at(-1).payload.spec.postId,A);
  }finally{s.close();}
});

test('TikTok shared feed rail offers exactly one download for the visible video and switches on scroll',async()=>{
  const s=setup(`<main id="main-content-homepage_hot"><div id="column-list-container"><article data-e2e="recommend-list-item-container">${player(A)}</article><article data-e2e="recommend-list-item-container">${player(B)}</article></div><div data-e2e="anchoring-engagement-vertical">${rail}</div></main>`);
  try{
    const cards=s.dom.window.document.querySelectorAll('article');let first=true;
    cards[0].getBoundingClientRect=()=>rect(first?0:-900);cards[1].getBoundingClientRect=()=>rect(first?680:0);
    cards.forEach(card=>{card.querySelector('video').getBoundingClientRect=()=>card.getBoundingClientRect();});
    await s.app.ready;assert.equal(s.dom.window.document.querySelector('#rail').querySelectorAll('[data-linklift-download]').length,1);
    for(const host of s.dom.window.document.querySelectorAll('[data-linklift-download]'))if(!host.closest('#rail'))assert.equal(host.hidden,true,'preloaded feed cards must not show stray floating controls');
    let host=s.dom.window.document.querySelector('#share').nextElementSibling;assert.ok(host?.hasAttribute('data-linklift-download'));
    host.shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.at(-1)?.payload.spec.postId,A);
    first=false;s.dom.window.dispatchEvent(new s.dom.window.Event('scroll'));await new Promise(r=>setTimeout(r,250));assert.equal(s.dom.window.document.querySelector('#rail').querySelectorAll('[data-linklift-download]').length,1);
    host=s.dom.window.document.querySelector('#share').nextElementSibling;host.shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.at(-1)?.payload.spec.postId,B);
  }finally{s.close();}
});

test('TikTok profile and Explore playing previews download videos without saving their poster or altering card children',async()=>{
  for(const e2e of ['user-post-item','explore-item','explore-hero-card-0']){
    const s=setup(`<div data-e2e="${e2e}"><a href="/@artist/video/${A}"><img width="300" height="400" src="https://p16.tiktokcdn.com/poster.jpg">${player(A)}</a></div>`,'/@artist');
    try{await s.app.ready;const card=s.dom.window.document.querySelector('[data-e2e]'),host=s.dom.window.document.querySelector('[data-linklift-download]');assert.ok(host,e2e);assert.equal(host.parentElement,card,'keep the pointer inside the preview card so its hover player remains mounted');assert.equal(host.closest('[id^=xgwrapper]'),null);host.shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.at(-1)?.payload.spec.item.kind,'video');assert.equal(s.calls.at(-1).payload.spec.postId,A);}finally{s.close();}
  }
});

test('TikTok modal suppresses duplicate background-grid controls for the same post',async()=>{
  const s=setup(`<div data-e2e="user-post-item"><a href="/@artist/video/${A}">${player(A)}</a></div><div role="dialog"><div data-e2e="browse-video">${player(A)}</div><div data-e2e="browse-share-group" style="display:flex"><button aria-label="Share"></button></div></div>`,`/@artist/video/${A}`);
  try{await s.app.ready;assert.equal(s.dom.window.document.querySelectorAll('[data-linklift-download]').length,1);assert.ok(s.dom.window.document.querySelector('[role=dialog] [data-linklift-download]'));}finally{s.close();}
});

test('TikTok recycled player IDs replace stale download identity even when the video src does not change',async()=>{
  const s=setup(`<article data-e2e="recommend-list-item-container">${player(A)}${rail}</article>`,`/@artist/video/${A}`);
  try{await s.app.ready;await new Promise(r=>setTimeout(r,400));s.dom.window.document.querySelector('[id^=xgwrapper]').id='xgwrapper-0-'+B;await new Promise(r=>setTimeout(r,250));s.dom.window.document.querySelector('[data-linklift-download]').shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.at(-1)?.payload.spec.postId,B);}finally{s.close();}
});

test('TikTok preview button stays inside its card',async()=>{
  const s=setup(`<div data-e2e="user-post-item"><a href="/@artist/video/${A}">${player(A)}</a></div>`,'/@artist');
  try{
    const card=s.dom.window.document.querySelector('[data-e2e]');card.getBoundingClientRect=()=>rect(100,100,300,400);
    await s.app.ready;const host=s.dom.window.document.querySelector('[data-linklift-download]');assert.ok(host);assert.equal(host.hidden,false);
    assert.equal(host.dataset.layout,'preview');assert.equal(host.parentElement,card);assert.equal(card.style.position,'relative');
    s.app.dispose();assert.equal(card.style.position,'');
  }finally{s.close();}
});

test('TikTok search previews with the player inside a permalink use the video rather than a result cover',async()=>{
  const s=setup(`<div data-e2e="search_top-item"><div><a href="/@artist/video/${A}"><div>${player(A)}</div></a></div></div>`,'/search?q=artist');
  try{await s.app.ready;const host=s.dom.window.document.querySelector('[data-linklift-download]');assert.equal(host?.parentElement.tagName,'A');host.shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.at(-1)?.payload.spec.postId,A);assert.equal(s.calls.at(-1).payload.spec.item.kind,'video');}finally{s.close();}
});

test('TikTok video-link covers in profile, Explore and search offer downloads before hover playback',async()=>{
  for(const e2e of ['user-post-item','explore-item','search_top-item']){
    const s=setup(`<div data-e2e="${e2e}"><a href="/@artist/video/${A}"><img src="https://p16.tiktokcdn.com/cover.jpg" width="300" height="400"></a></div>`,'/explore');
    try{await s.app.ready;const host=s.dom.window.document.querySelector('[data-linklift-download]');assert.ok(host,e2e);host.shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.at(-1)?.payload.spec.item.kind,'video');assert.equal(s.calls.at(-1).payload.spec.postId,A);}finally{s.close();}
  }
});

test('TikTok switching a cover to its hover player during source resolution still downloads that same video',async()=>{
  const s=setup(`<div data-e2e="user-post-item"><a href="/@artist/video/${A}"><img src="https://p16.tiktokcdn.com/cover.jpg" width="300" height="400"></a></div>`,'/@artist',false);
  try{await s.app.ready;const doc=s.dom.window.document;doc.querySelector('[data-linklift-download]').shadowRoot.querySelector('[data-action=download]').click();doc.querySelector('a').innerHTML=player(A);s.app.receive([{platform:'tiktok',postId:A,items:[{id:A,kind:'video',variants:[{url:`https://v16-webapp-prime.tiktok.com/${A}.mp4`}]}]}]);await tick();assert.equal(s.calls.at(-1)?.payload.spec.postId,A);assert.equal(s.calls.at(-1).payload.spec.item.kind,'video');}finally{s.close();}
});

test('TikTok modal navigation never offers a stale single preloaded player as the current post',async()=>{
  const s=setup(`<div role="dialog"><div data-e2e="browse-video">${player(A)}</div><div data-e2e="browse-share-group" style="display:flex"><button aria-label="Share"></button></div></div>`,`/@artist/video/${B}`);
  try{await s.app.ready;assert.equal(s.dom.window.document.querySelectorAll('[data-linklift-download]').length,0);}finally{s.close();}
});

test('TikTok uncached modal resolves the selected permalink even with another post link first',async()=>{
  const s=setup(`<div role="dialog"><a href="/@artist/video/${A}">Preload</a><div data-e2e="browse-video">${player(A)}</div><div data-e2e="browse-video">${player(B)}</div><a href="/@artist/video/${B}">Current</a><div data-e2e="browse-share-group" style="display:flex"><button aria-label="Share"></button></div></div>`,`/@artist/video/${B}`,false),requests=[];
  s.dom.window.postMessage=m=>{if(m.type==='tiktok-post'){requests.push(m);s.app.receive([{platform:'tiktok',postId:B,items:[{id:B,kind:'video',variants:[{url:`https://v16-webapp-prime.tiktok.com/${B}.mp4`}]}]}]);}};
  try{await s.app.ready;s.dom.window.document.querySelector('[data-linklift-download]').shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(requests[0].path,`/@artist/video/${B}`);assert.equal(requests[0].postId,B);assert.equal(s.calls.at(-1)?.payload.spec.postId,B);}finally{s.close();}
});

test('TikTok leaving an unresolved modal releases the old preparation so the next post can download immediately',async()=>{
  const s=setup(`<div role="dialog"><div data-e2e="browse-video">${player(A)}</div><div data-e2e="browse-share-group" style="display:flex"><button aria-label="Share"></button></div></div>`,`/@artist/video/${A}`,false);
  try{
    await s.app.ready;s.dom.window.document.querySelector('[data-linklift-download]').shadowRoot.querySelector('[data-action=download]').click();
    s.dom.window.history.pushState({},'',`/@artist/video/${B}`);s.dom.window.document.querySelector('[id^=xgwrapper]').id='xgwrapper-0-'+B;
    s.app.receive([{platform:'tiktok',postId:B,items:[{id:B,kind:'video',variants:[{url:`https://v16-webapp-prime.tiktok.com/${B}.mp4`}]}]}]);s.app.scan();
    s.dom.window.document.querySelector('[data-linklift-download]').shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.at(-1)?.payload.spec.postId,B);assert.equal(s.calls.filter(m=>m.command==='download.start').length,1);
  }finally{s.close();}
});

test('TikTok feed Share -> Copy and modal Copy link rewrite once and honor the site switch',async()=>{
  for(const control of ['<div data-e2e="share-copy"><div tabindex="0"><svg><title>Copy</title></svg><p>Copy</p></div></div>','<button data-e2e="browse-copy">Copy link </button>']){
    const dom=new JSDOM(`<div role="button" data-e2e="share-icon" aria-label="Share video 43 shares"><button>Share</button></div>${control}`,{url:'https://www.tiktok.com/'}),writes=[];
    const clipboard={writeText:async text=>{writes.push(text);return 'native';}};Object.defineProperty(dom.window.navigator,'clipboard',{value:clipboard});
    const app=installSocialClipboard({window:dom.window,isTrusted:()=>true}),link=`https://www.tiktok.com/@artist/video/${A}?is_from_webapp=1&sender_device=pc&web_id=123`;
    try{
      app.configure({activeDomain:'tnktok.com'});dom.window.document.querySelector('[data-e2e=share-icon] button').click();assert.equal(writes.length,0);
      await clipboard.writeText(link);assert.equal(writes.at(-1),link);
      const copy=dom.window.document.querySelector('[data-e2e=share-copy] p,[data-e2e=browse-copy]');copy.click();assert.equal(await clipboard.writeText(link),'native');assert.equal(writes.at(-1),`https://tnktok.com/@artist/video/${A}`);
      await clipboard.writeText(link);assert.equal(writes.at(-1),link);
      app.configure({enabled:false,activeDomain:'tnktok.com'});copy.click();await clipboard.writeText(link);assert.equal(writes.at(-1),link);
      app.configure({activeDomain:'tnktok.com'});copy.click();await clipboard.writeText('https://www.tiktok.com/@artist?tracking=1');assert.equal(writes.at(-1),'https://www.tiktok.com/@artist?tracking=1');
    }finally{app.dispose();dom.window.close();}
  }
});
