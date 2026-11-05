import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {defaults} from '../src/shared/settings.js';
const domRules=await import('../src/content/x-dom.js').catch(()=>({}));
const content=await import('../src/content/index.js').catch(()=>({}));
const fixture=async name=>new JSDOM(await readFile(new URL(`fixtures/${name}.html`,import.meta.url),'utf8'),{url:'https://x.com/user/status/333/photo/1'});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function apiFake() {
  const listeners=new Set();
  return {runtime:{onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},sendMessage:async m=>({v:1,requestId:m.requestId,ok:true,result:m.command==='settings.get'?defaults():{}})},storage:{onChanged:{addListener(){},removeListener(){}}},listeners};
}
test('selects the outer permalink without accidentally sharing a quote',async()=>{
  assert.equal(typeof domRules.resolvePost,'function','Post resolver must exist');
  const dom=await fixture('quoted-post');
  assert.equal(domRules.resolvePost(dom.window.document.querySelector('#share')),'https://x.com/outer/status/111');
  dom.window.close();
});
test('binds each clicked photo to its own source rather than the first photo',async()=>{
  const dom=await fixture('timeline');
  assert.equal(domRules.resolvePhoto(dom.window.document.querySelector('#second')).mediaId,'Second');
  dom.window.close();
});
test('ambiguous dialog permalinks never fall back to an unrelated viewer route',()=>{
  const dom=new JSDOM('<div role="dialog"><article data-testid="tweet"><a href="/a/status/111"><time>A</time></a><a href="/b/status/222"><time>B</time></a><button id="share">Share</button></article></div>',{url:'https://x.com/unrelated/status/333/photo/1'});
  assert.equal(domRules.resolvePost(dom.window.document.querySelector('#share')),null);dom.window.close();
});
function openShareMenu(dom,{onNativeCopy=()=>{},onOther=()=>{}}={}) {
  const menu=dom.window.document.createElement('div');menu.setAttribute('role','menu');
  const copy=dom.window.document.createElement('div');copy.setAttribute('role','menuitem');copy.innerHTML='<span>Copy link</span>';copy.addEventListener('click',onNativeCopy);
  const other=dom.window.document.createElement('div');other.setAttribute('role','menuitem');other.textContent='Send via Direct Message';other.addEventListener('click',onOther);
  menu.append(copy,other);menu.addEventListener('keydown',event=>{if(event.key==='Escape')menu.remove();});dom.window.document.body.append(menu);
  return {menu,copy,other};
}

test('disabled X rewriting leaves its native Copy link action untouched',async()=>{
  const dom=await fixture('timeline'),api=apiFake(),copied=[];let native=0;
  api.runtime.sendMessage=async m=>({v:1,requestId:m.requestId,ok:true,result:m.command==='settings.get'?{...defaults(),enabled:false}:{}});
  const controller=content.createContent({window:dom.window,api,isTrusted:()=>true,clipboard:{writeText:async text=>copied.push(text)}});await controller.ready;
  dom.window.document.querySelector('#share').click();const menu=openShareMenu(dom,{onNativeCopy:()=>native++});await tick();menu.copy.click();await tick();
  assert.equal(native,1);assert.deepEqual(copied,[]);assert.equal(dom.window.document.body.textContent.includes('Link copied'),false);controller.dispose();dom.window.close();
});
test('opening Share only opens the native menu without copying or notifying',async()=>{
  assert.equal(typeof content.createContent,'function','Content controller must exist');
  const dom=await fixture('timeline');const api=apiFake();const copied=[];
  const controller=content.createContent({window:dom.window,api,isTrusted:()=>true,clipboard:{writeText:async text=>{copied.push(text);}}});
  await controller.ready;
  dom.window.document.querySelector('#share').addEventListener('click',()=>openShareMenu(dom));
  const click=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true});
  dom.window.document.querySelector('#share').dispatchEvent(click);await tick();
  assert.deepEqual(copied,[]);
  assert.equal(click.defaultPrevented,false);
  assert.ok(dom.window.document.querySelector('[role="menu"]'));
  assert.equal(dom.window.document.querySelector('#tweetx-feedback'),null);
  controller.dispose();assert.equal(api.listeners.size,0);dom.window.close();
});
test('Copy link copies the proxy URL once and prevents the native original-link overwrite',async()=>{
  const dom=await fixture('timeline'),api=apiFake(),copied=[];let nativeCopies=0;
  const controller=content.createContent({window:dom.window,api,isTrusted:()=>true,clipboard:{writeText:async text=>copied.push(text)}});await controller.ready;
  dom.window.document.querySelector('#share').click();
  const {copy,menu}=openShareMenu(dom,{onNativeCopy:()=>nativeCopies++});
  copy.querySelector('span').click();await tick();
  assert.deepEqual(copied,['https://fixupx.com/alice/status/123']);assert.equal(nativeCopies,0);
  assert.equal(menu.isConnected,false);assert.match(dom.window.document.querySelector('#tweetx-feedback').textContent,/Link copied/);
  controller.dispose();dom.window.close();
});
test('Copy link works in a button-based dropdown without a role=menu wrapper',async()=>{
  const dom=await fixture('timeline'),copied=[];let nativeCopies=0;
  const controller=content.createContent({window:dom.window,api:apiFake(),isTrusted:()=>true,clipboard:{writeText:async text=>copied.push(text)}});await controller.ready;
  dom.window.document.querySelector('#share').click();
  const sheet=dom.window.document.createElement('div');sheet.innerHTML='<div role="button" tabindex="0"><span>Copy link</span></div>';dom.window.document.body.append(sheet);
  const item=sheet.firstElementChild;item.addEventListener('click',()=>nativeCopies++);
  item.querySelector('span').click();await tick();
  assert.deepEqual(copied,['https://fixupx.com/alice/status/123']);assert.equal(nativeCopies,0);
  controller.dispose();dom.window.close();
});
test('a pre-rendered dropdown can be reused when Share makes it visible',async()=>{
  const dom=await fixture('timeline'),copied=[];let nativeCopies=0;
  const existing=openShareMenu(dom,{onNativeCopy:()=>nativeCopies++});existing.menu.hidden=true;
  const controller=content.createContent({window:dom.window,api:apiFake(),isTrusted:()=>true,clipboard:{writeText:async text=>copied.push(text)}});await controller.ready;
  dom.window.document.querySelector('#share').addEventListener('click',()=>{existing.menu.hidden=false;});
  dom.window.document.querySelector('#share').click();await tick();existing.copy.click();await tick();
  assert.deepEqual(copied,['https://fixupx.com/alice/status/123']);assert.equal(nativeCopies,0);
  controller.dispose();dom.window.close();
});
test('a clickable popup wrapper is not mistaken for its nested Copy link action',async()=>{
  const dom=await fixture('timeline'),copied=[];
  const controller=content.createContent({window:dom.window,api:apiFake(),isTrusted:()=>true,clipboard:{writeText:async text=>copied.push(text)}});await controller.ready;
  dom.window.document.querySelector('#share').click();const {menu,copy}=openShareMenu(dom);
  const wrapper=dom.window.document.createElement('div');wrapper.setAttribute('role','button');wrapper.append(menu);dom.window.document.body.append(wrapper);await tick();
  copy.click();await tick();assert.deepEqual(copied,['https://fixupx.com/alice/status/123']);
  controller.dispose();dom.window.close();
});
test('other share-menu options and unrelated Copy link controls retain native behavior',async()=>{
  const dom=await fixture('timeline'),copied=[];let other=0,nativeCopies=0;
  const controller=content.createContent({window:dom.window,api:apiFake(),isTrusted:()=>true,clipboard:{writeText:async text=>copied.push(text)}});await controller.ready;
  dom.window.document.querySelector('#share').click();
  const menu=openShareMenu(dom,{onOther:()=>other++,onNativeCopy:()=>nativeCopies++});menu.other.click();menu.copy.click();await tick();
  assert.deepEqual(copied,[]);assert.equal(other,1);assert.equal(nativeCopies,1);
  controller.dispose();dom.window.close();
});
test('Copy link does not reuse a post after navigation or menu dismissal',async()=>{
  const dom=await fixture('timeline'),copied=[];let nativeCopies=0;
  const controller=content.createContent({window:dom.window,api:apiFake(),isTrusted:()=>true,clipboard:{writeText:async text=>copied.push(text)}});await controller.ready;
  dom.window.document.querySelector('#share').click();const first=openShareMenu(dom,{onNativeCopy:()=>nativeCopies++});await tick();first.menu.remove();await tick();
  const unrelated=openShareMenu(dom,{onNativeCopy:()=>nativeCopies++});unrelated.copy.click();
  dom.window.document.querySelector('#share').click();const second=openShareMenu(dom,{onNativeCopy:()=>nativeCopies++});
  dom.window.history.pushState({},'', '/different/status/999');second.copy.click();await tick();
  assert.deepEqual(copied,[]);assert.equal(nativeCopies,2);
  controller.dispose();dom.window.close();
});
test('reopening Share on another post binds Copy link to that post',async()=>{
  const dom=await fixture('timeline'),copied=[];
  dom.window.document.body.insertAdjacentHTML('beforeend','<article data-testid="tweet"><a href="/bob/status/456"><time>Now</time></a><button id="share-bob" data-testid="share">Share</button></article>');
  const controller=content.createContent({window:dom.window,api:apiFake(),isTrusted:()=>true,clipboard:{writeText:async text=>copied.push(text)}});await controller.ready;
  dom.window.document.querySelector('#share').click();const first=openShareMenu(dom);await tick();first.menu.remove();await tick();
  dom.window.document.querySelector('#share-bob').click();openShareMenu(dom).copy.click();await tick();
  assert.deepEqual(copied,['https://fixupx.com/bob/status/456']);controller.dispose();dom.window.close();
});
test('clipboard denial exposes original link and bypasses one subsequent native Copy link',async()=>{
  const dom=await fixture('timeline');const api=apiFake();let native=0,attempts=0;
  const controller=content.createContent({window:dom.window,api,isTrusted:()=>true,clipboard:{writeText:async()=>{attempts++;throw new Error('denied');}}});
  await controller.ready;
  const button=dom.window.document.querySelector('#share');
  button.click();openShareMenu(dom).copy.click();await tick();
  const recovery=dom.window.document.querySelector('#tweetx-feedback');
  assert.equal(recovery.querySelector('input').value,'https://x.com/alice/status/123');
  recovery.querySelector('[data-action="original"]').click();
  button.click();openShareMenu(dom,{onNativeCopy:()=>native++}).copy.click();await tick();assert.equal(native,1);assert.equal(attempts,1);
  controller.dispose();dom.window.close();
});
test('suppresses only X photo menu without cancelling native context menu',async()=>{
  const dom=await fixture('timeline');const controller=content.createContent({window:dom.window,api:apiFake(),isTrusted:()=>true,clipboard:{writeText:async()=>{}}});
  await controller.ready;let pageMenu=0;
  dom.window.document.addEventListener('contextmenu',()=>pageMenu++);
  const event=new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true});
  dom.window.document.querySelector('#second').dispatchEvent(event);
  assert.equal(event.defaultPrevented,false);assert.equal(pageMenu,0);
  assert.equal(controller.snapshot().mediaId,'Second');
  dom.window.document.body.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true}));
  assert.equal(controller.snapshot(),null);assert.equal(pageMenu,1);
  controller.dispose();dom.window.close();
});
