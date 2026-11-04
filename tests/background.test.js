import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeClock} from './helpers/fake-clock.js';
import {mediaDependencies,photoUrl} from './helpers/media-fixtures.js';
import {browserContext,event} from './helpers/browser-context.js';
import {message,uuid} from '../src/shared/protocol.js';
const hosts=await import('../src/media/host.js').catch(()=>({}));
const coordinators=await import('../src/background/common.js').catch(()=>({}));
const owner=()=>({tabId:1,frameId:0,documentToken:uuid(),operationId:uuid()});
const snapshot=()=>({mediaUrl:photoUrl,mediaId:'Fixture',postId:'123',snapshotId:uuid(),documentToken:uuid(),capturedAt:0});
test('media host holds at most two leases and releases encoded bytes after expiry',async()=>{
  assert.equal(typeof hosts.createMediaHost,'function','Media host must exist');
  const clock=fakeClock(),deps=mediaDependencies(clock);const expired=[];
  const host=hosts.createMediaHost({...deps,onExpire:async id=>expired.push(id)});
  const first=await host.prepare(owner(),snapshot());const second=await host.prepare(owner(),snapshot());
  await assert.rejects(()=>host.prepare(owner(),snapshot()),/BUSY/);
  assert.equal(deps.blobs.size,2);await host.bind(first.leaseId,8);
  assert.equal(host.inventory().leases.find(l=>l.leaseId===first.leaseId).downloadId,8);
  await clock.advance(300001);assert.equal(expired.length,2);assert.equal(deps.blobs.size,0);assert.equal(host.inventory().leases.length,0);
  host.dispose();assert.equal(clock.timerCount,0);
});
test('copy writes image data without retaining a Blob lease',async()=>{
  const clock=fakeClock(),deps=mediaDependencies(clock);const host=hosts.createMediaHost(deps);
  await host.copy(owner(),snapshot());assert.deepEqual(deps.copied,['original-candidate']);assert.equal(host.inventory().leases.length,0);host.dispose();
});
test('overlapping fetch/decode work is rejected instead of queued',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});const deps=mediaDependencies(fakeClock());
  const host=hosts.createMediaHost({...deps,fetch:async()=>{await gate;return deps.fetch();}});
  const pending=host.copy(owner(),snapshot());await assert.rejects(()=>host.copy(owner(),snapshot()),/BUSY/);release();await pending;host.dispose();
});
test('validation fault causes a displayed-image fallback through real host selection',async()=>{
  const deps=mediaDependencies(fakeClock()),o=owner();
  const host=hosts.createMediaHost({...deps,validation:true});
  assert.equal(typeof host.configure,'function','Validation host control must exist');
  host.configure({tabId:o.tabId,fault:'preferred-fetch-failed',barrier:'none'});
  const result=await host.copy(o,snapshot());assert.equal(result.rendition,'displayed-fallback');assert.deepEqual(deps.copied,['displayed-fallback']);host.dispose();
});
test('validation clipboard denial also affects image copying',async()=>{
  const deps=mediaDependencies(fakeClock()),o=owner(),host=hosts.createMediaHost({...deps,validation:true});
  host.configure({tabId:o.tabId,fault:'clipboard-denied',barrier:'none'});
  await assert.rejects(()=>host.copy(o,snapshot()),/CLIPBOARD_DENIED/);assert.equal(deps.copied.length,0);host.dispose();
});
test('background rejects page senders attempting to overwrite settings',async()=>{
  assert.equal(typeof coordinators.createBackground,'function','Background must exist');
  const ctx=browserContext();const host=hosts.createMediaHost(mediaDependencies(fakeClock()));
  const bg=coordinators.createBackground({api:ctx.api,media:host,browserKind:'firefox'});await bg.ready;
  const m=message('settings.replace','background',{settings:{version:1,services:['evil.example'],activeDomain:'evil.example'}});
  await assert.rejects(()=>bg.handle(m,{id:ctx.api.runtime.id,url:'https://x.com/home',tab:{id:1},frameId:0}),/INVALID_MESSAGE/);
  assert.notEqual(ctx.local['tweetx.settings'].activeDomain,'evil.example');await bg.dispose();host.dispose();
});
test('reconciliation binds an existing unacknowledged download without duplicating it',async()=>{
  const ctx=browserContext(),clock=fakeClock(1000),host=hosts.createMediaHost(mediaDependencies(clock));
  const lease=await host.prepare(owner(),snapshot());ctx.session['tweetx.downloads']={version:1,records:[{...lease,state:'STARTING'}]};
  await ctx.api.downloads.download({url:lease.blobUrl});
  const bg=coordinators.createBackground({api:ctx.api,media:host,browserKind:'chrome',clock});await bg.ready;
  assert.equal(host.inventory().leases[0].downloadId,1);assert.equal(ctx.downloads.size,1);
  await bg.dispose();host.dispose();
});

function menuContext(clock) {
  const ctx=browserContext(),token=uuid(),photo={...snapshot(),documentToken:token,capturedAt:clock.now()};
  let port;
  ctx.api.tabs.sendMessage=async(id,m)=>{
    let result={};
    if(m.command==='content.identify')result={documentToken:token};
    if(m.command==='photo.snapshot')result=photo;
    if(m.command==='media.owner'&&m.payload.hold){port={name:'tweetx.media-owner.v1',sender:{id:ctx.api.runtime.id,url:'https://x.com/home',tab:{id:1},frameId:0},onDisconnect:event()};ctx.api.runtime.onConnect.emit(port);}
    return {v:1,requestId:m.requestId,ok:true,result};
  };
  return {...ctx,get port(){return port;},info:{menuItemId:'tweetx-download',pageUrl:'https://x.com/home'},tab:{id:1,url:'https://x.com/home'}};
}
test('Firefox owner disconnect during preparation prevents a later download',async()=>{
  const clock=fakeClock(1000),ctx=menuContext(clock),deps=mediaDependencies(clock);let releaseFetch,entered;
  const gate=new Promise(resolve=>{releaseFetch=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  const host=hosts.createMediaHost({...deps,fetch:async()=>{entered();await gate;return deps.fetch();}});
  const bg=coordinators.createBackground({api:ctx.api,media:host,browserKind:'firefox',clock});await bg.ready;
  const pending=bg.performMenu(ctx.info,ctx.tab);await started;ctx.port.onDisconnect.emit();await new Promise(resolve=>setImmediate(resolve));releaseFetch();await pending;
  assert.equal(ctx.downloads.size,0);assert.equal(host.inventory().leases.length,0);await bg.dispose();host.dispose();
});
test('expiry before download-ID acknowledgement cancels the late download',async()=>{
  const clock=fakeClock(1000),ctx=menuContext(clock),deps=mediaDependencies(clock);let bg,acknowledge,created;
  const ack=new Promise(resolve=>{acknowledge=resolve;}),started=new Promise(resolve=>{created=resolve;});
  const download=ctx.api.downloads.download;
  ctx.api.downloads.download=async options=>{const id=await download(options);created();await ack;return id;};
  const host=hosts.createMediaHost({...deps,onExpire:id=>bg.expire(id)});bg=coordinators.createBackground({api:ctx.api,media:host,browserKind:'chrome',clock});await bg.ready;
  const pending=bg.performMenu(ctx.info,ctx.tab);await started;await clock.advance(300001);acknowledge();await pending;
  assert.equal(ctx.downloads.get(1).state,'interrupted');assert.equal(host.inventory().leases.length,0);await bg.dispose();host.dispose();
});
test('a rejected busy click cannot unlock another pending action in the same tab',async()=>{
  const clock=fakeClock(1000),ctx=menuContext(clock),deps=mediaDependencies(clock);let releaseNotice,noticeEntered;
  const gate=new Promise(resolve=>{releaseNotice=resolve;}),started=new Promise(resolve=>{noticeEntered=resolve;});let successes=0;
  const send=ctx.api.tabs.sendMessage;
  ctx.api.tabs.sendMessage=async(id,m)=>{if(m.command==='action.result'&&m.payload.outcome==='copied'&&++successes===1){noticeEntered();await gate;}return send(id,m);};
  const host=hosts.createMediaHost(deps),bg=coordinators.createBackground({api:ctx.api,media:host,browserKind:'chrome',clock});await bg.ready;
  const info={...ctx.info,menuItemId:'tweetx-copy'},first=bg.performMenu(info,ctx.tab);await started;
  await bg.performMenu(info,ctx.tab);await bg.performMenu(info,ctx.tab);
  const writes=deps.copied.length;releaseNotice();await first;
  assert.equal(writes,1);await bg.dispose();host.dispose();
});
test('Chrome validation configuration survives until its next photo action',async()=>{
  globalThis.__VALIDATION__=true;
  const mod=await import('../src/background/chrome.js').catch(()=>({}));
  assert.equal(typeof mod.createChromeMedia,'function','Chrome adapter factory must exist');
  let alive=false,fault=null,sequence=0;
  const api={offscreen:{async createDocument(){alive=true;fault=null;},async closeDocument(){alive=false;fault=null;}},runtime:{getURL:path=>`chrome-extension://test/${path}`,async getContexts(){return alive?[{}]:[];},async sendMessage(m){let result={};if(m.command==='validation.configure')fault=m.payload.fault;if(m.command==='lease.inventory')result={helperGeneration:'test',leases:[]};if(m.command==='media.copy')result={rendition:fault==='preferred-fetch-failed'?'displayed-fallback':'original-candidate'};return {v:1,requestId:m.requestId,ok:true,result};}}};
  const remote=mod.createChromeMedia(api);await remote.configure({tabId:1,fault:'preferred-fetch-failed',barrier:'none'});const result=await remote.copy(owner(),snapshot());
  assert.equal(result.rendition,'displayed-fallback');assert.equal(alive,false);delete globalThis.__VALIDATION__;
});
