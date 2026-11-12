import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {browserContext} from './helpers/browser-context.js';
import {success,message} from '../src/shared/protocol.js';
const ui=await import('../src/download/content.js').catch(()=>({}));
import {createSettingsView} from '../src/popup/index.js';
test('per-media split buttons select best by default, expose quality and never trigger post navigation',async()=>{
  assert.equal(typeof ui.installDownloads,'function');
  const dom=new JSDOM('<article data-testid="tweet"><a href="/a/status/123"><time></time></a><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a.jpg"></div></article>',{url:'https://x.com/home'}),ctx=browserContext(),calls=[];
  ctx.api.runtime.sendMessage=async m=>{calls.push(m);return success(m,{started:true});};
  const app=ui.installDownloads({window:dom.window,api:ctx.api,isTrusted:()=>true});await app.ready;
  app.receive([{platform:'x',postId:'123',items:[{id:'a',kind:'image',variants:[{url:'https://pbs.twimg.com/media/a.jpg',width:1000,height:1000},{url:'https://pbs.twimg.com/media/a.jpg?name=small',width:200,height:200}]}]}]);app.scan();
  let host=dom.window.document.querySelector('[data-linklift-download]');assert.ok(host);let navigation=0;dom.window.document.querySelector('article').addEventListener('click',()=>navigation++);
  host.shadowRoot.querySelector('[data-action="download"]').click();await new Promise(r=>setTimeout(r,0));
  assert.equal(calls[0].payload.spec.quality,0);assert.equal(navigation,0);
  ctx.api.runtime.onMessage.emit(message('action.result','download-ui',{documentToken:calls[0].payload.documentToken,operationId:calls[0].payload.operationId,outcome:'download-complete'}),{id:ctx.api.runtime.id},()=>{});
  host.shadowRoot.querySelector('[data-action="options"]').click();assert.equal(host.shadowRoot.querySelector('form').hidden,false);
  app.scan();assert.equal(dom.window.document.querySelectorAll('[data-linklift-download]').length,1);
  dom.window.document.querySelector('a').href='/a/status/456';app.scan();
  assert.equal(dom.window.document.querySelectorAll('[data-linklift-download]').length,1);
  host=dom.window.document.querySelector('[data-linklift-download]');host.shadowRoot.querySelector('[data-action="download"]').click();await new Promise(r=>setTimeout(r,0));assert.equal(calls.at(-1).payload.spec.postId,'456');
  app.dispose();assert.equal(dom.window.document.querySelectorAll('[data-linklift-download]').length,0);dom.window.close();
});
test('download setting is independent from link rewriting and removes inline buttons',async()=>{
  assert.equal(typeof ui.installDownloads,'function');
  const dom=new JSDOM('<article data-testid="tweet"><a href="/a/status/123"><time></time></a><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a.jpg"></div></article>',{url:'https://x.com/home'}),ctx=browserContext();ctx.local['linklift.downloads']={x:false};
  const app=ui.installDownloads({window:dom.window,api:ctx.api});await app.ready;app.scan();assert.equal(dom.window.document.querySelector('[data-linklift-download]'),null);app.dispose();dom.window.close();
});
test('dashboard download switches save independently without modifying proxy settings',async()=>{
  const dom=new JSDOM('<main id="cards"></main><p id="status"></p>'),ctx=browserContext();dom.window.document.body.dataset.dashboard='true';
  ctx.api.runtime.sendMessage=async m=>success(m,{version:1,services:['fixupx.com'],activeDomain:'fixupx.com'});ctx.api.tabs.query=async()=>[];
  const app=createSettingsView({document:dom.window.document,api:ctx.api});await app.ready;
  const control=dom.window.document.querySelector('[data-site="reddit"] [data-download-toggle]');assert.ok(control);assert.equal(control.checked,true);
  control.checked=false;control.dispatchEvent(new dom.window.Event('change'));await new Promise(r=>setTimeout(r,0));
  assert.equal(ctx.local['linklift.downloads'].reddit,false);assert.equal(ctx.local['tweetx.social'],undefined);app.dispose();dom.window.close();
});
test('X dialogs keep a single stable control when they contain a nested article',async()=>{
  const dom=new JSDOM('<div role="dialog"><article data-testid="tweet"><a href="/a/status/123"><time></time></a><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a.jpg"></div></article></div>',{url:'https://x.com/a/status/123'}),ctx=browserContext();
  const app=ui.installDownloads({window:dom.window,api:ctx.api});await app.ready;const before=dom.window.document.querySelector('[data-linklift-download]');app.scan();assert.equal(dom.window.document.querySelector('[data-linklift-download]'),before);app.dispose();dom.window.close();
});
test('unresolved Reddit blob videos expose a control and cancelling resolution cannot start a download',async()=>{
  const dom=new JSDOM('<shreddit-post post-id="t3_ab12" permalink="/r/test/comments/ab12/post/"><div><video src="blob:https://www.reddit.com/test"></video></div></shreddit-post>',{url:'https://www.reddit.com'}),ctx=browserContext(),calls=[];
  ctx.api.runtime.sendMessage=async m=>{calls.push(m.command);return success(m,{});};
  const app=ui.installDownloads({window:dom.window,api:ctx.api,isTrusted:()=>true});await app.ready;const host=dom.window.document.querySelector('[data-linklift-download]');assert.ok(host);
  host.shadowRoot.querySelector('[data-action="download"]').click();host.shadowRoot.querySelector('.cancel').click();
  app.receive([{platform:'reddit',postId:'ab12',items:[{id:'ab12',kind:'gif',variants:[{url:'https://v.redd.it/a/DASH_720.mp4'}]}]}]);
  await new Promise(r=>setTimeout(r,20));assert.equal(calls.includes('download.start'),false);app.dispose();dom.window.close();
});
