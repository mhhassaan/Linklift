import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installDownloads} from '../src/download/content.js';
import {browserContext} from './helpers/browser-context.js';
import {success,message} from '../src/shared/protocol.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
const image=(id='photo')=>({id,kind:'image',variants:[{url:`https://scontent.cdninstagram.com/${id}.jpg`,width:1080,height:1350}]});
const video=(id='video')=>({id,kind:'video',variants:[{url:`https://scontent.cdninstagram.com/${id}.mp4`,width:1080,height:1920},{url:`https://scontent.cdninstagram.com/${id}-small.mp4`,width:360,height:640}]});
const actions=(send='Share',direction='row')=>`<section style="display:flex;flex-direction:${direction}"><button aria-label="Like">Like</button><button aria-label="Comment">Comment</button><div><button aria-label="${send}">${send}</button></div><button aria-label="Save">Save</button></section>`;
function setup(html,path='/'){
  const dom=new JSDOM(html,{url:'https://www.instagram.com'+path}),ctx=browserContext(),calls=[];
  ctx.api.runtime.sendMessage=async m=>{calls.push(m);return success(m,{started:true});};
  const app=installDownloads({window:dom.window,api:ctx.api,isTrusted:()=>true});
  return {dom,app,ctx,calls,receive(id,items){app.receive([{platform:'instagram',postId:id,items}]);},close(){app.dispose();dom.window.close();}};
}

test('Instagram non-article feed cards with Send actions get independently owned download controls',async()=>{
  const s=setup('<main><div><video src="https://scontent.cdninstagram.com/one.mp4"></video><div style="display:flex"><button aria-label="Like">Like</button><button aria-label="Send">Send</button></div><a href="/reel/ONE/"><time>Now</time></a></div><div><img width="500" height="500" src="https://scontent.cdninstagram.com/two.jpg"><div style="display:flex"><button aria-label="Like">Like</button><button aria-label="Send">Send</button></div><a href="/p/TWO/"><time>Now</time></a></div></main>');
  try{await s.app.ready;const hosts=s.dom.window.document.querySelectorAll('[data-linklift-download]');assert.equal(hosts.length,2);for(const host of hosts){assert.equal(host.dataset.layout,'native-row');host.shadowRoot.querySelector('[data-action=download]').click();await tick();}assert.deepEqual(s.calls.map(m=>m.payload.spec.postId),['ONE','TWO']);}finally{s.close();}
});

test('Instagram profile and Explore covers resolve original post media instead of saving thumbnail images',async()=>{
  const s=setup('<main><div style="display:grid"><a href="/artist/reel/ABC/"><img width="300" height="400" src="https://scontent.cdninstagram.com/cover.jpg"></a><a href="/artist/p/PHOTO/"><img width="300" height="400" src="https://scontent.cdninstagram.com/thumbnail.jpg"></a></div></main>','/artist/');
  try{
    await s.app.ready;const hosts=s.dom.window.document.querySelectorAll('[data-linklift-download]');assert.equal(hosts.length,2);
    hosts[0].shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.length,0);
    s.receive('ABC',[video()]);await tick();assert.equal(s.calls.at(-1)?.payload.spec.item.kind,'video');assert.match(s.calls.at(-1).payload.spec.item.variants[0].url,/video\.mp4$/);
    hosts[1].shadowRoot.querySelector('[data-action=download]').click();s.receive('PHOTO',[image('original')]);await tick();assert.match(s.calls.at(-1).payload.spec.item.variants[0].url,/original\.jpg$/);
    for(const host of hosts){assert.equal(host.dataset.layout,'preview');assert.equal(host.closest('main').querySelectorAll('a').length,2);}
  }finally{s.close();}
});

test('Instagram Reels vertical Send rail mounts beside native actions without changing player children',async()=>{
  const s=setup(`<main><div><div id="player"><video src="blob:https://www.instagram.com/current"></video></div>${actions('Send','column')}<a href="/reels/ABC/"><time>Now</time></a></div></main>`,'/reels/ABC/');
  try{await s.app.ready;const host=s.dom.window.document.querySelector('[data-linklift-download]');assert.ok(host);assert.equal(host.dataset.layout,'native-rail');assert.equal(host.previousElementSibling.querySelector('[aria-label=Send]')?.getAttribute('aria-label'),'Send');assert.equal(s.dom.window.document.querySelector('#player').children.length,1);s.receive('ABC',[video()]);host.shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.at(-1).payload.spec.postId,'ABC');}finally{s.close();}
});

test('Instagram captions linking another post never override the actual timestamp permalink',async()=>{
  const s=setup(`<article><video src="https://scontent.cdninstagram.com/current.mp4"></video><p><a href="/p/OTHER/">A mentioned post</a></p>${actions()}<a href="/artist/reel/ABC/"><time>Now</time></a></article>`,'/reel/ABC/');
  try{await s.app.ready;s.dom.window.document.querySelector('[data-linklift-download]').shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.at(-1)?.payload.spec.postId,'ABC');}finally{s.close();}
});

test('Instagram mixed carousel keeps every item and defaults to the currently visible slide',async()=>{
  const s=setup(`<article><ul id="slides" style="overflow:hidden"><li><img id="first" width="500" height="500" src="https://scontent.cdninstagram.com/first.jpg"></li><li><video id="clip" src="blob:https://www.instagram.com/clip"></video></li><li><img id="last" width="500" height="500" src="https://scontent.cdninstagram.com/last.jpg"></li></ul>${actions()}<a href="/p/ABC/"><time>Now</time></a></article>`,'/p/ABC/');
  let current=2;const rect=left=>({left,right:left+500,top:0,bottom:500,width:500,height:500});
  s.dom.window.document.querySelector('#slides').getBoundingClientRect=()=>rect(0);
  ['first','clip','last'].forEach((id,i)=>{s.dom.window.document.getElementById(id).getBoundingClientRect=()=>rect((i-current)*500);});
  try{await s.app.ready;s.receive('ABC',[image('first'),video('clip'),image('last')]);s.app.scan();const host=s.dom.window.document.querySelector('[data-linklift-download]');assert.equal(host.shadowRoot.querySelector('[aria-label=Media]').options.length,3);host.shadowRoot.querySelector('[data-action=download]').click();await tick();assert.match(s.calls.at(-1)?.payload.spec.item.variants[0].url,/last\.jpg$/);const payload=s.calls.at(-1).payload;s.ctx.api.runtime.onMessage.emit(message('action.result','download-ui',{documentToken:payload.documentToken,operationId:payload.operationId,outcome:'download-complete'}),{id:s.ctx.api.runtime.id},()=>{});current=1;host.shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.at(-1)?.payload.spec.item.kind,'video');assert.match(s.calls.at(-1).payload.spec.item.variants[0].url,/clip\.mp4$/);}finally{s.close();}
});

test('Instagram modal beats its background card and leaves unrelated grid controls hidden',async()=>{
  const s=setup(`<main><a href="/reel/ABC/"><img width="300" height="400" src="https://scontent.cdninstagram.com/cover.jpg"></a><a href="/reel/OTHER/"><img width="300" height="400" src="https://scontent.cdninstagram.com/other.jpg"></a></main><div role="dialog"><article><video src="https://scontent.cdninstagram.com/opened.mp4"></video>${actions()}<a href="/reel/ABC/"><time>Now</time></a></article></div>`,'/reel/ABC/');
  try{await s.app.ready;const hosts=s.dom.window.document.querySelectorAll('[data-linklift-download]');assert.equal(hosts.length,1);assert.ok(hosts[0].closest('[role=dialog]'));hosts[0].shadowRoot.querySelector('[data-action=download]').click();await tick();assert.match(s.calls.at(-1).payload.spec.item.variants[0].url,/opened.mp4$/);}finally{s.close();}
});

test('Instagram replacing a pending cover with the post player retains the current download',async()=>{
  const s=setup(`<article><div id="media"><img alt="Video by Artist" width="500" height="500" src="https://scontent.cdninstagram.com/cover.jpg"></div>${actions()}<a href="/reel/ABC/"><time>Now</time></a></article>`,'/reel/ABC/');
  try{await s.app.ready;s.dom.window.document.querySelector('[data-linklift-download]').shadowRoot.querySelector('[data-action=download]').click();s.dom.window.document.querySelector('#media').innerHTML='<video src="blob:https://www.instagram.com/loaded"></video>';s.receive('ABC',[video()]);await tick();assert.equal(s.calls.at(-1)?.payload.spec.postId,'ABC');assert.equal(s.calls.at(-1).payload.spec.item.kind,'video');}finally{s.close();}
});

test('Instagram direct carousel honors img_index even when adjacent slides remain partly onscreen',async()=>{
  const s=setup(`<article><ul><li><img width="500" height="500" src="https://scontent.cdninstagram.com/first.jpg"></li><li><img width="500" height="500" src="https://scontent.cdninstagram.com/second.jpg"></li></ul>${actions()}<a href="/p/ABC/"><time>Now</time></a></article>`,'/p/ABC/?img_index=2');
  try{await s.app.ready;s.receive('ABC',[image('first'),image('second')]);s.app.scan();s.dom.window.document.querySelector('[data-linklift-download]').shadowRoot.querySelector('[data-action=download]').click();await tick();assert.match(s.calls.at(-1)?.payload.spec.item.variants[0].url,/second\.jpg$/);}finally{s.close();}
});

test('Instagram nested recommendation actions wait for their own sibling permalink before choosing an identity',async()=>{
  const s=setup(`<main><div id="own"><video src="https://scontent.cdninstagram.com/own.mp4"></video>${actions()}<a href="/p/OWN/"><time>Now</time></a></div><div id="other"><div><video src="https://scontent.cdninstagram.com/other.mp4"></video>${actions()}</div><a href="/p/OTHER/"><time>Now</time></a></div></main>`,'/p/OWN/');
  try{await s.app.ready;const hosts=s.dom.window.document.querySelectorAll('[data-linklift-download]');assert.equal(hosts.length,2);for(const host of hosts){host.shadowRoot.querySelector('[data-action=download]').click();await tick();}assert.deepEqual(s.calls.map(m=>m.payload.spec.postId),['OWN','OTHER']);assert.match(s.calls[1].payload.spec.item.variants[0].url,/other\.mp4$/);}finally{s.close();}
});

test('Instagram standalone reel without its own permalink keeps a control beside independently identified recommendations',async()=>{
  const s=setup(`<main><div id="own"><video src="https://scontent.cdninstagram.com/own.mp4"></video>${actions('Send')}</div><article><video src="https://scontent.cdninstagram.com/other.mp4"></video>${actions('Send')}<a href="/p/OTHER/"><time>Now</time></a></article></main>`,'/reel/OWN/');
  try{await s.app.ready;const host=s.dom.window.document.querySelector('#own [data-linklift-download]');assert.ok(host);host.shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.at(-1)?.payload.spec.postId,'OWN');assert.match(s.calls.at(-1).payload.spec.item.variants[0].url,/own\.mp4$/);}finally{s.close();}
});

test('Instagram virtualized carousel maps a displayed rendition to its translated slide ordinal',async()=>{
  const s=setup(`<article><ul><li style="transform:translateX(500px)"><img width="500" height="500" src="https://scontent.cdninstagram.com/second-rendered.jpg"></li></ul>${actions()}<a href="/p/ABC/"><time>Now</time></a></article>`);
  const node=s.dom.window.document.querySelector('img');node.getBoundingClientRect=()=>({left:0,right:500,top:0,bottom:500,width:500,height:500});
  try{await s.app.ready;s.receive('ABC',[image('first-original'),image('second-original')]);s.app.scan();s.dom.window.document.querySelector('[data-linklift-download]').shadowRoot.querySelector('[data-action=download]').click();await tick();assert.match(s.calls.at(-1)?.payload.spec.item.variants[0].url,/second-original\.jpg$/);}finally{s.close();}
});

test('Instagram ambiguous virtualized carousel opens media choices rather than downloading an arbitrary first file',async()=>{
  const s=setup(`<article><ul><li><img width="500" height="500" src="https://scontent.cdninstagram.com/unknown-rendered.jpg"></li></ul>${actions()}<a href="/p/ABC/"><time>Now</time></a></article>`);
  try{await s.app.ready;s.receive('ABC',[image('first-original'),image('second-original')]);s.app.scan();const host=s.dom.window.document.querySelector('[data-linklift-download]');host.shadowRoot.querySelector('[data-action=download]').click();await tick();assert.equal(s.calls.length,0);assert.equal(host.shadowRoot.querySelector('form').hidden,false);assert.equal(host.shadowRoot.querySelector('[aria-label=Media]').options.length,2);}finally{s.close();}
});
