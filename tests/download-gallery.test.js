import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installDownloads} from '../src/download/content.js';
import {browserContext} from './helpers/browser-context.js';
import {success,message} from '../src/shared/protocol.js';
import {currentGalleryIndex} from '../src/download/dom.js';
function setup(html,url){const dom=new JSDOM(html,{url}),ctx=browserContext(),calls=[];ctx.api.runtime.sendMessage=async m=>{calls.push(m);return success(m,{started:true});};const app=installDownloads({window:dom.window,api:ctx.api,isTrusted:()=>true});return {dom,ctx,calls,app,close(){app.dispose();dom.window.close();}};}
test('five Reddit gallery photos with preview/background duplicates get one control and five media choices',async()=>{
  const photos=Array.from({length:5},(_,i)=>`<img width="500" height="500" src="https://preview.redd.it/title-v0-photo${i}.jpg?blur=40"><img width="500" height="500" src="https://i.redd.it/photo${i}.jpg">`).join('');
  const s=setup(`<shreddit-post post-id="t3_ab12">${photos}<div><button aria-label="Share">Share</button></div></shreddit-post>`,'https://www.reddit.com/');
  try{await s.app.ready;assert.equal(s.dom.window.document.querySelectorAll('[data-linklift-download]').length,1);const host=s.dom.window.document.querySelector('[data-linklift-download]'),media=host.shadowRoot.querySelector('select[aria-label="Media"]');assert.ok(media);assert.equal(media.options.length,5);media.value=media.options[3].value;media.dispatchEvent(new s.dom.window.Event('change'));host.shadowRoot.querySelector('form').dispatchEvent(new s.dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.match(s.calls.at(-1).payload.spec.item.variants[0].url,/photo3/);}finally{s.close();}
});
test('Reddit places its single control after Share inside an open shadow action row',async()=>{
  const s=setup('<shreddit-post post-id="t3_ab12"><img width="500" height="500" src="https://i.redd.it/photo.jpg"></shreddit-post>','https://www.reddit.com/');
  const root=s.dom.window.document.querySelector('shreddit-post'),shadow=root.attachShadow({mode:'open'});shadow.innerHTML='<div id="actions"><button>Vote</button><button>Comment</button><button>Share</button></div>';
  try{await s.app.ready;const share=[...shadow.querySelectorAll('button')].find(b=>b.textContent==='Share');assert.equal(share.nextElementSibling?.hasAttribute('data-linklift-download'),true);assert.equal(root.querySelector('[data-linklift-download]'),null);}finally{s.close();}
});
test('a late-rendered Reddit Share row receives the existing control instead of leaving a media footer',async()=>{
  const s=setup('<shreddit-post post-id="t3_ab12"><img width="500" height="500" src="https://i.redd.it/photo.jpg"></shreddit-post>','https://www.reddit.com/');
  try{await s.app.ready;const root=s.dom.window.document.querySelector('shreddit-post'),host=root.querySelector('[data-linklift-download]');const row=s.dom.window.document.createElement('div');row.innerHTML='<button aria-label="Share">Share</button>';root.append(row);s.app.scan();assert.equal(row.querySelector('button').nextElementSibling,host);assert.equal(root.querySelectorAll('[data-linklift-download]').length,1);}finally{s.close();}
});
test('Instagram ignores comment media, keeps one control, and anchors immediately after Send',async()=>{
  const s=setup('<main><article><div><video src="https://scontent.cdninstagram.com/post.mp4"></video></div><div><ul><li><a href="/p/ABC/c/123/">Comment</a><video src="https://scontent.cdninstagram.com/comment.mp4"></video></li></ul><div><button aria-label="Like">Like</button><button aria-label="Comment">Comment</button><button aria-label="Share">Share</button><button aria-label="Save">Save</button></div><a href="/artist/reel/ABC/"><time>Now</time></a></div></article></main>','https://www.instagram.com/artist/reel/ABC/');
  const share=s.dom.window.document.querySelector('button[aria-label=Share]'),save=s.dom.window.document.querySelector('button[aria-label=Save]');share.getBoundingClientRect=()=>({left:100,right:124,top:300,bottom:324,width:24,height:24});save.getBoundingClientRect=()=>({left:400,right:424,top:300,bottom:324,width:24,height:24});
  try{await s.app.ready;const hosts=s.dom.window.document.querySelectorAll('[data-linklift-download]');assert.equal(hosts.length,1);assert.equal(Number.parseFloat(hosts[0].style.left),128);hosts[0].shadowRoot.querySelector('[data-action=download]').click();await new Promise(r=>setTimeout(r,0));assert.match(s.calls.at(-1).payload.spec.item.variants[0].url,/\/post.mp4/);}finally{s.close();}
});
test('an opened Instagram dialog wins over a background copy of the same post',async()=>{
  const card=url=>`<article><video src="https://scontent.cdninstagram.com/${url}.mp4"></video><button aria-label="Save">Save</button><a href="/p/ABC/">Post</a></article>`;
  const s=setup('<main>'+card('background')+'<div role="dialog">'+card('opened')+'</div></main>','https://www.instagram.com/p/ABC/');
  try{await s.app.ready;const controls=s.dom.window.document.querySelectorAll('[data-linklift-download]');assert.equal(controls.length,1);controls[0].shadowRoot.querySelector('[data-action=download]').click();await new Promise(r=>setTimeout(r,0));assert.match(s.calls.at(-1).payload.spec.item.variants[0].url,/opened.mp4/);}finally{s.close();}
});
test('Reddit gallery main action prompts for the current slide or all images',async()=>{
  const photos=Array.from({length:3},(_,i)=>`<img width="500" height="500" src="https://i.redd.it/photo${i}.jpg">`).join('');
  const s=setup(`<shreddit-post post-id="t3_ab12"><gallery-carousel current-index="2">${photos}</gallery-carousel><button aria-label="Share">Share</button></shreddit-post>`,'https://www.reddit.com/');
  try{await s.app.ready;const host=s.dom.window.document.querySelector('[data-linklift-download]');host.shadowRoot.querySelector('[data-action=download]').click();assert.equal(s.calls.length,0);const current=host.shadowRoot.querySelector('[data-action=download-current]'),all=host.shadowRoot.querySelector('[data-action=download-all]');assert.equal(current.textContent,'Download this image');assert.equal(all.textContent,'Download all images');current.click();await new Promise(r=>setTimeout(r,0));assert.match(s.calls.at(-1).payload.spec.item.variants[0].url,/photo2/);}finally{s.close();}
});
test('download all waits for each actual completion and saves every gallery image once',async()=>{
  const photos=Array.from({length:3},(_,i)=>`<img width="500" height="500" src="https://i.redd.it/photo${i}.jpg">`).join('');
  const s=setup(`<shreddit-post post-id="t3_ab12">${photos}<button aria-label="Share">Share</button></shreddit-post>`,'https://www.reddit.com/');
  function complete(m){s.ctx.api.runtime.onMessage.emit(message('action.result','download-ui',{documentToken:m.payload.documentToken,operationId:m.payload.operationId,outcome:'download-complete'}),{id:s.ctx.api.runtime.id},()=>{});}
  try{await s.app.ready;const host=s.dom.window.document.querySelector('[data-linklift-download]');host.shadowRoot.querySelector('[data-action=download]').click();host.shadowRoot.querySelector('[data-action=download-all]').click();await new Promise(r=>setTimeout(r,0));assert.equal(s.calls.length,1);complete(s.calls[0]);await new Promise(r=>setTimeout(r,0));assert.equal(s.calls.length,2);complete(s.calls[1]);await new Promise(r=>setTimeout(r,0));assert.equal(s.calls.length,3);complete(s.calls[2]);await new Promise(r=>setTimeout(r,0));assert.deepEqual(s.calls.map(m=>m.payload.spec.item.variants[0].url),['https://i.redd.it/photo0.jpg','https://i.redd.it/photo1.jpg','https://i.redd.it/photo2.jpg']);assert.equal(host.shadowRoot.querySelector('.status').textContent,'Downloaded 3 images');}finally{s.close();}
});
test('gallery current-image detection respects the actual clipping viewport across a slot',()=>{
  const dom=new JSDOM('<shreddit-post>'+Array.from({length:4},()=>'<img>').join('')+'</shreddit-post>',{url:'https://www.reddit.com/'}),root=dom.window.document.querySelector('shreddit-post');const shadow=root.attachShadow({mode:'open'});shadow.innerHTML='<div style="overflow:hidden"><slot></slot></div>';shadow.querySelector('div').getBoundingClientRect=()=>({left:350,right:650,top:0,bottom:300,width:300,height:300});
  const entries=[...root.querySelectorAll('img')].map((node,i)=>{node.getBoundingClientRect=()=>({left:350+(i-2)*300,right:650+(i-2)*300,top:0,bottom:300,width:300,height:300});return {node,nodes:[node],item:{id:String(i)}};});
  try{assert.equal(currentGalleryIndex(root,entries,dom.window),2);}finally{dom.window.close();}
});
test('gallery cancellation or a failed file stops before downloading the remaining images',async()=>{
  for(const mode of ['cancel','failure']){
    const photos=Array.from({length:3},(_,i)=>`<img width="500" height="500" src="https://i.redd.it/photo${i}.jpg">`).join(''),s=setup(`<shreddit-post post-id="t3_ab12">${photos}<button aria-label="Share">Share</button></shreddit-post>`,'https://www.reddit.com/');
    function terminal(m,outcome,code){s.ctx.api.runtime.onMessage.emit(message('action.result','download-ui',{documentToken:m.payload.documentToken,operationId:m.payload.operationId,outcome,code}),{id:s.ctx.api.runtime.id},()=>{});}
    try{await s.app.ready;const host=s.dom.window.document.querySelector('[data-linklift-download]');host.shadowRoot.querySelector('[data-action=download]').click();host.shadowRoot.querySelector('[data-action=download-all]').click();await new Promise(r=>setTimeout(r,0));terminal(s.calls[0],'download-complete');await new Promise(r=>setTimeout(r,0));const second=s.calls.filter(m=>m.command==='download.start')[1];if(mode==='cancel')host.shadowRoot.querySelector('.cancel').click();terminal(second,'failed',mode==='cancel'?'CANCELLED':'FETCH_FAILED');await new Promise(r=>setTimeout(r,0));assert.equal(s.calls.filter(m=>m.command==='download.start').length,2);assert.match(host.shadowRoot.querySelector('.status').textContent,/1 of 3/);}finally{s.close();}
  }
});
