import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installDownloads} from '../src/download/content.js';
import {browserContext} from './helpers/browser-context.js';
import {observeMedia} from '../src/download/page.js';
import {success} from '../src/shared/protocol.js';

test('X download actions live beside native post actions rather than over media',async()=>{
  const dom=new JSDOM('<article data-testid="tweet"><a href="/a/status/123"><time></time></a><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a.jpg"></div><div role="group"><button data-testid="reply">Reply</button><button data-testid="like">Like</button><button>Share</button></div></article>',{url:'https://x.com/home'}),ctx=browserContext();
  const app=installDownloads({window:dom.window,api:ctx.api});try{await app.ready;const host=dom.window.document.querySelector('[data-linklift-download]');assert.equal(host.parentElement.getAttribute('role'),'group');assert.equal(host.closest('[data-testid="tweetPhoto"]'),null);assert.equal(host.shadowRoot.querySelector('form').hidden,true);}finally{app.dispose();dom.window.close();}
});
test('Reddit player-2 receives controls even when native video is in a closed shadow root',async()=>{
  const dom=new JSDOM('<shreddit-post post-id="t3_ab12" permalink="/r/test/comments/ab12/post/"><shreddit-player-2 src="https://v.redd.it/abc/HLSPlaylist.m3u8"></shreddit-player-2></shreddit-post>',{url:'https://www.reddit.com/'}),ctx=browserContext();
  dom.window.document.querySelector('shreddit-player-2').attachShadow({mode:'closed'}).innerHTML='<video src="blob:https://www.reddit.com/test"></video>';
  const app=installDownloads({window:dom.window,api:ctx.api});try{await app.ready;assert.ok(dom.window.document.querySelector('[data-linklift-download]'));assert.equal(dom.window.document.querySelector('shreddit-player-2').querySelector('[data-linklift-download]'),null);}finally{app.dispose();dom.window.close();}
});
test('Reddit discovers deeply nested open players without duplicating controls',async()=>{
  const dom=new JSDOM('<shreddit-post post-id="t3_ab12"><div id="outer"></div></shreddit-post>',{url:'https://www.reddit.com/'}),ctx=browserContext();
  const outer=dom.window.document.querySelector('#outer').attachShadow({mode:'open'});outer.innerHTML='<shreddit-player-2><div></div></shreddit-player-2>';outer.querySelector('shreddit-player-2').attachShadow({mode:'open'}).innerHTML='<video src="blob:https://www.reddit.com/a"></video>';
  const app=installDownloads({window:dom.window,api:ctx.api});try{await app.ready;assert.equal(dom.window.document.querySelectorAll('[data-linklift-download]').length,1);app.scan();assert.equal(dom.window.document.querySelectorAll('[data-linklift-download]').length,1);}finally{app.dispose();dom.window.close();}
});
test('Instagram post pages and picture-wrapped photos work without an article tag',async()=>{
  const dom=new JSDOM('<main><div><picture><source srcset="https://scontent.cdninstagram.com/a.jpg"><img src="https://scontent.cdninstagram.com/a.jpg" width="500" height="500"></picture></div></main>',{url:'https://www.instagram.com/p/ABC/'}),ctx=browserContext();
  const app=installDownloads({window:dom.window,api:ctx.api});try{await app.ready;assert.ok(dom.window.document.querySelector('[data-linklift-download]'));assert.equal(dom.window.document.querySelector('picture').querySelector('[data-linklift-download]'),null);}finally{app.dispose();dom.window.close();}
});
test('Instagram feed post links identify non-article cards without using another card media',async()=>{
  const dom=new JSDOM('<main><section><a href="/p/ONE/">Post</a><div><img src="https://scontent.cdninstagram.com/one.jpg" width="500" height="500"></div><button aria-label="Share">Share</button></section><section><a href="/reel/TWO/">Post</a><div><video src="https://scontent.cdninstagram.com/two.mp4"></video></div><button aria-label="Share">Share</button></section></main>',{url:'https://www.instagram.com/'}),ctx=browserContext();
  const app=installDownloads({window:dom.window,api:ctx.api});try{await app.ready;assert.equal(dom.window.document.querySelectorAll('[data-linklift-download]').length,2);}finally{app.dispose();dom.window.close();}
});
test('Reddit observer does not wrap fetch or XHR, leaving preload credentials and site requests untouched',()=>{
  const dom=new JSDOM('',{url:'https://www.reddit.com/'});const fetch=()=>Promise.resolve();dom.window.fetch=fetch;const open=dom.window.XMLHttpRequest.prototype.open;
  const app=observeMedia(dom.window);try{assert.equal(dom.window.fetch,fetch);assert.equal(dom.window.XMLHttpRequest.prototype.open,open);}finally{app?.dispose?.();dom.window.close();}
});
test('Reddit packaged GIF metadata resolves without requiring a visible native video or API lookup',async()=>{
  const dom=new JSDOM('<shreddit-post post-id="t3_ab12"><shreddit-player-2 gif></shreddit-player-2></shreddit-post>',{url:'https://www.reddit.com/'}),ctx=browserContext(),calls=[];
  dom.window.document.querySelector('shreddit-player-2').setAttribute('packaged-media-json',JSON.stringify({playbackMp4s:{permutations:[{source:{url:'https://packaged-media.redd.it/abc/clip.mp4',dimensions:{width:720,height:720}}}]}}));ctx.api.runtime.sendMessage=async m=>{calls.push(m);return success(m,{started:true});};
  const app=installDownloads({window:dom.window,api:ctx.api,isTrusted:()=>true});try{await app.ready;const host=dom.window.document.querySelector('[data-linklift-download]');host.shadowRoot.querySelector('[data-action="download"]').click();await new Promise(r=>setTimeout(r,0));assert.equal(calls[0]?.payload.spec.item.kind,'gif');assert.match(calls[0].payload.spec.item.variants[0].url,/packaged-media/);}finally{app.dispose();dom.window.close();}
});
test('Instagram blob reels offer a resolving control rather than silently disappearing',async()=>{
  const dom=new JSDOM('<main><div><video src="blob:https://www.instagram.com/abc"></video></div></main>',{url:'https://www.instagram.com/reel/ABC/'}),ctx=browserContext();
  const app=installDownloads({window:dom.window,api:ctx.api});try{await app.ready;assert.ok(dom.window.document.querySelector('[data-linklift-download]'));}finally{app.dispose();dom.window.close();}
});
test('Instagram feed permalink beside a profile picture resolves the full post rather than its header',async()=>{
  const dom=new JSDOM('<main><section><div><a href="/p/ABC/">Post</a><img src="https://scontent.cdninstagram.com/avatar.jpg" width="32" height="32"></div><div><img src="https://scontent.cdninstagram.com/post.jpg" width="500" height="500"></div><button aria-label="Share">Share</button></section></main>',{url:'https://www.instagram.com/'}),ctx=browserContext();
  const app=installDownloads({window:dom.window,api:ctx.api});try{await app.ready;assert.equal(dom.window.document.querySelectorAll('[data-linklift-download]').length,1);assert.equal(dom.window.document.querySelector('[data-linklift-download]').parentElement.tagName,'BODY');}finally{app.dispose();dom.window.close();}
});
test('TikTok embedded video variants are published for blob-backed playback',()=>{
  const data={__DEFAULT_SCOPE__:{'webapp.video-detail':{itemInfo:{itemStruct:{id:'7702391713679133974',video:{width:720,height:1280,playAddr:'https://v16-webapp-prime.tiktok.com/video/main.mp4',bitrateInfo:[{Bitrate:2000000,PlayAddr:{UrlList:['https://v16-webapp-prime.tiktok.com/video/high.mp4'],Width:720,Height:1280}}]}}}}}};
  const dom=new JSDOM('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">'+JSON.stringify(data)+'</script>',{url:'https://www.tiktok.com/@artist/video/7702391713679133974'}),records=[];dom.window.postMessage=m=>records.push(m);
  const observer=observeMedia(dom.window);try{assert.equal(records[0].posts[0].items[0].kind,'video');assert.match(records[0].posts[0].items[0].variants[0].url,/high.mp4/);}finally{observer.dispose();dom.window.close();}
});
test('Instagram guarded JSON responses still publish video sources without replacing native fetch results',async()=>{
  const dom=new JSDOM('',{url:'https://www.instagram.com/'}),records=[];dom.window.postMessage=m=>records.push(m);
  const response=new Response('for (;;);'+JSON.stringify({data:{media:{code:'ABC',pk:'123',video_versions:[{url:'https://instagram.example.fna.fbcdn.net/video.mp4',width:720,height:1280}]}}}),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:'https://www.instagram.com/graphql/query'});
  const promise=Promise.resolve(response);dom.window.fetch=()=>promise;
  const observer=observeMedia(dom.window);try{assert.equal(dom.window.fetch('/graphql/query'),promise);await new Promise(r=>setTimeout(r,30));assert.equal(records[0].posts[0].items[0].kind,'video');}finally{observer.dispose();dom.window.close();}
});
