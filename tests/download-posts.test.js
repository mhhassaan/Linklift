import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installDownloads} from '../src/download/content.js';
import {browserContext} from './helpers/browser-context.js';
import {message,success} from '../src/shared/protocol.js';
function setup(html,url){const dom=new JSDOM(html,{url}),ctx=browserContext(),calls=[];ctx.api.runtime.sendMessage=async m=>{calls.push(m);return success(m,{started:true});};const app=installDownloads({window:dom.window,api:ctx.api,isTrusted:()=>true});return {dom,ctx,calls,app,close(){app.dispose();dom.window.close();}};}
test('Instagram horizontal post actions insert Download after Send without moving the player',async()=>{
  const s=setup('<article><video src="https://scontent.cdninstagram.com/a.mp4"></video><div id="actions" style="display:flex"><button aria-label="Like">Like</button><button aria-label="Comment">Comment</button><span><button aria-label="Share">Send</button></span><button aria-label="Save" style="margin-left:auto">Save</button></div><a href="/p/ABC/">Post</a></article>','https://www.instagram.com/p/ABC/');
  try{await s.app.ready;const doc=s.dom.window.document,host=doc.querySelector('[data-linklift-download]');assert.equal(host.dataset.layout,'native-row');assert.equal(doc.querySelector('[aria-label=Share]').parentElement.nextElementSibling,host);assert.equal(host.nextElementSibling.getAttribute('aria-label'),'Save');assert.equal(host.shadowRoot.querySelector('.cancel').parentElement.className,'feedback');assert.equal(doc.querySelector('video').parentElement.tagName,'ARTICLE');}finally{s.close();}
});
test('Instagram reels and TikTok use their vertical action rail, never the player container',async()=>{
  for(const platform of ['instagram','tiktok']){
    const instagram=platform==='instagram',attrs=instagram?'aria-label="Share"':'data-e2e="share-icon"',like=instagram?'aria-label="Like"':'data-e2e="like-icon"',url=instagram?'https://www.instagram.com/reels/ABC/':'https://www.tiktok.com/@a/video/123';
    const s=setup(`<article><video src="https://${instagram?'scontent.cdninstagram.com':'v16-webapp-prime.tiktok.com'}/a.mp4"></video><section id="rail" style="display:flex;flex-direction:column"><div><button ${like}>Like</button></div><div id="share"><button ${attrs}>Send</button><span>43</span></div><div id="next">More</div></section></article>`,url);
    try{await s.app.ready;const doc=s.dom.window.document,host=doc.querySelector('[data-linklift-download]');assert.equal(host.dataset.layout,'native-rail');assert.equal(host.parentElement.id,'rail');assert.equal(doc.querySelector('#share').nextElementSibling,host);assert.equal(host.nextElementSibling.id,'next');assert.equal(doc.querySelector('video').parentElement.children.length,2);assert.equal(host.shadowRoot.querySelector('.cancel').parentElement.className,'feedback');}finally{s.close();}
  }
});
test('TikTok blob video takes precedence over poster and controls never become a native player flex child',async()=>{
  const s=setup('<article data-e2e="recommend-list-item-container" style="display:flex"><div id="xgwrapper-0-7702391713679133974"><img src="https://p16.tiktokcdn.com/poster.jpg" width="500" height="700"><video src="blob:https://www.tiktok.com/a"></video></div><section><button data-e2e="share-icon">Share</button></section></article>','https://www.tiktok.com/@a/video/7702391713679133974');
  try{await s.app.ready;const hosts=s.dom.window.document.querySelectorAll('[data-linklift-download]');assert.equal(hosts.length,1);assert.equal(hosts[0].parentElement,s.dom.window.document.body);assert.equal(s.dom.window.document.querySelector('article').children.length,2);s.app.receive([{platform:'tiktok',postId:'7702391713679133974',items:[{id:'video',kind:'video',variants:[{url:'https://v16-webapp-prime.tiktok.com/clip.mp4'}]}]}]);hosts[0].shadowRoot.querySelector('[data-action=download]').click();await new Promise(r=>setTimeout(r,0));assert.equal(s.calls.at(-1).payload.spec.item.kind,'video');}finally{s.close();}
});
test('TikTok native rail accepts CSS-sized author avatars and nested Share availability wrappers',async()=>{
  const s=setup('<article><video src="https://v16-webapp-prime.tiktok.com/a.mp4"></video><section id="rail" style="display:flex;flex-direction:column"><a data-e2e="video-author-avatar" href="/@artist"><img style="width:48px;height:48px" src="https://p16.tiktokcdn.com/avatar.jpg"></a><div role="button" data-e2e="like-icon">Like</div><div id="availability"><div role="button" data-e2e="share-icon"><button>Share</button><strong>43</strong></div></div></section></article>','https://www.tiktok.com/@artist/video/123');
  try{await s.app.ready;const doc=s.dom.window.document,host=doc.querySelector('[data-linklift-download]');assert.equal(host.dataset.layout,'native-rail');assert.equal(host.parentElement.id,'rail');assert.equal(doc.querySelector('#availability').nextElementSibling,host);}finally{s.close();}
});
test('Reddit background and foreground renditions of one image create one download control',async()=>{
  const s=setup('<shreddit-post post-id="t3_ab12"><img src="https://preview.redd.it/photo.jpg?blur=40" width="700" height="500"><img src="https://preview.redd.it/photo.jpg?width=1080" width="700" height="500"><img src="https://i.redd.it/photo.jpg" width="700" height="500"></shreddit-post>','https://www.reddit.com/');
  try{await s.app.ready;assert.equal(s.dom.window.document.querySelectorAll('[data-linklift-download]').length,1);}finally{s.close();}
});
test('Reddit mounts the themed download pill immediately after the native Share control',async()=>{
  const s=setup('<shreddit-post post-id="t3_ab12"><img src="https://i.redd.it/a.jpg" width="600" height="400"><div class="actions"><button>Vote</button><button>Comments</button><shreddit-post-share-button style="background:rgb(42,50,54);color:rgb(242,244,245)">Share</shreddit-post-share-button><button>More</button></div></shreddit-post>','https://www.reddit.com/');
  try{await s.app.ready;const share=s.dom.window.document.querySelector('shreddit-post-share-button'),host=s.dom.window.document.querySelector('[data-linklift-download]');assert.equal(share.nextElementSibling,host);assert.equal(host.dataset.layout,'action');assert.equal(host.dataset.platform,'reddit');assert.equal(host.style.getPropertyValue('--ll-pill-bg'),'rgb(42, 50, 54)');}finally{s.close();}
});
test('Instagram profile grid thumbnails get no inserted rows or image download controls',async()=>{
  const s=setup('<main><div style="display:grid"><a href="/artist/reel/ABC/"><img src="https://scontent.cdninstagram.com/cover.jpg" width="300" height="400"></a><a href="/artist/p/DEF/"><img src="https://scontent.cdninstagram.com/photo.jpg" width="300" height="400"></a></div></main>','https://www.instagram.com/artist/');
  try{await s.app.ready;assert.equal(s.dom.window.document.querySelectorAll('[data-linklift-download]').length,0);}finally{s.close();}
});
test('TikTok profile covers are not offered as downloadable video images',async()=>{
  const s=setup('<div data-e2e="user-post-item"><a href="/@artist/video/123"><img src="https://p16.tiktokcdn.com/cover.jpg" width="300" height="400"></a></div>','https://www.tiktok.com/@artist');
  try{await s.app.ready;assert.equal(s.dom.window.document.querySelectorAll('[data-linklift-download]').length,0);}finally{s.close();}
});
test('username-prefixed Instagram reel post resolves its active video despite recommendations',async()=>{
  const s=setup('<main><div id="post"><div><img src="https://scontent.cdninstagram.com/poster.jpg" width="400" height="600"><video src="blob:https://www.instagram.com/a"></video></div><div><button aria-label="Share">Share</button><button aria-label="Save">Save</button><a href="/artist/reel/ABC/"><time>October 30</time></a></div></div><div><a href="/artist/reel/OTHER/"><img src="https://scontent.cdninstagram.com/other.jpg" width="300" height="400"></a></div></main>','https://www.instagram.com/artist/reel/ABC/');
  try{await s.app.ready;const hosts=s.dom.window.document.querySelectorAll('[data-linklift-download]');assert.equal(hosts.length,1);s.app.receive([{platform:'instagram',postId:'ABC',items:[{id:'v',kind:'video',variants:[{url:'https://scontent.cdninstagram.com/a.mp4'}]}]}]);hosts[0].shadowRoot.querySelector('[data-action=download]').click();await new Promise(r=>setTimeout(r,0));assert.equal(s.calls.at(-1).payload.spec.item.kind,'video');assert.equal(s.calls.at(-1).payload.spec.postId,'ABC');}finally{s.close();}
});
test('X completion notification replaces downloading and expires instead of leaving Download started',async()=>{
  const s=setup('<article data-testid="tweet"><a href="/a/status/123"><time></time></a><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a.jpg"></div><div role="group"><button data-testid="reply">Reply</button></div></article>','https://x.com/home');
  try{await s.app.ready;const host=s.dom.window.document.querySelector('[data-linklift-download]');host.shadowRoot.querySelector('[data-action=download]').click();await new Promise(r=>setTimeout(r,0));const payload=s.calls.at(-1).payload;assert.ok(payload.operationId);const m=message('action.result','download-ui',{documentToken:payload.documentToken,operationId:payload.operationId,outcome:'download-complete'});s.ctx.api.runtime.onMessage.emit(m,{id:s.ctx.api.runtime.id},()=>{});assert.equal(host.shadowRoot.querySelector('.status').textContent,'Downloaded');await new Promise(r=>setTimeout(r,1800));assert.equal(host.shadowRoot.querySelector('.status').textContent,'');}finally{s.close();}
});
test('a reel poster resolves to its video metadata rather than downloading the cover image',async()=>{
  const s=setup('<main><div><img alt="Video by Artist" src="https://scontent.cdninstagram.com/cover.jpg" width="400" height="600"><button aria-label="Save">Save</button></div></main>','https://www.instagram.com/artist/reel/ABC/');
  try{await s.app.ready;s.app.receive([{platform:'instagram',postId:'ABC',items:[{id:'v',kind:'video',variants:[{url:'https://scontent.cdninstagram.com/video.mp4'}]}]}]);s.dom.window.document.querySelector('[data-linklift-download]').shadowRoot.querySelector('[data-action=download]').click();await new Promise(r=>setTimeout(r,0));assert.equal(s.calls.at(-1).payload.spec.item.kind,'video');assert.match(s.calls.at(-1).payload.spec.item.variants[0].url,/video.mp4/);}finally{s.close();}
});
