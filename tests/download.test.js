import test from 'node:test';
import assert from 'node:assert/strict';
const model=await import('../src/download/model.js').catch(()=>({}));
const metadata=await import('../src/download/metadata.js').catch(()=>({}));
const engine=await import('../src/download/engine.js').catch(()=>({}));
const gif=await import('../src/download/gif-encoder.js').catch(()=>({}));
import {createMediaHost} from '../src/media/host.js';
import {fakeClock} from './helpers/fake-clock.js';
import {browserContext,event} from './helpers/browser-context.js';
import {createBackground} from '../src/background/common.js';
import {message,success,failure,uuid} from '../src/shared/protocol.js';
import {JSDOM} from 'jsdom';
import {Input,BlobSource,MP4,Output,Mp4OutputFormat,BufferTarget,EncodedVideoPacketSource,EncodedAudioPacketSource,EncodedPacket,EncodedPacketSink} from 'mediabunny';
import {remuxMp4} from '../src/download/remux.js';
import {convertVideoToGif,gifPlan} from '../src/download/gif.js';
import {installPageTransfer} from '../src/download/page-transfer.js';
import {observeMedia} from '../src/download/page.js';
import {installDownloads} from '../src/download/content.js';

function pageTransferFixture(fetcher){
  const dom=new JSDOM('',{url:'https://www.tiktok.com/@artist/video/123'}),window=dom.window,out=[],blobs=new Map(),url='https://v16-webapp-prime.tiktok.com/video/tos/source/?mime_type=video_mp4';
  window.postMessage=data=>out.push(data);window.URL.createObjectURL=blob=>{const url='blob:https://www.tiktok.com/'+uuid();blobs.set(url,blob);return url;};window.URL.revokeObjectURL=url=>blobs.delete(url);
  const app=installPageTransfer(window,{fetch:fetcher,findPost:id=>id==='123'?{items:[{kind:'video',variants:[{url,type:'video/mp4'}]}]}:null});
  const payload={channel:'linklift.media.v1',type:'tiktok-download',operationId:uuid(),documentToken:uuid(),postId:'123',url};
  const send=data=>window.dispatchEvent(new window.MessageEvent('message',{source:window,origin:window.location.origin,data}));
  return {window,out,blobs,payload,send,close(){app.dispose();window.close();}};
}
const tinyMp4=()=>new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
test('TikTok page session fetch produces only a bounded MP4 Blob and releases it after saving',async()=>{
  let options;const s=pageTransferFixture(async(url,init)=>{options=init;return new Response(tinyMp4(),{headers:{'content-type':'video/mp4'}});});
  try{s.send(s.payload);await new Promise(r=>setTimeout(r,0));assert.equal(options.credentials,'include');assert.equal(options.mode,'cors');assert.equal(options.redirect,'error');assert.equal(s.out[0].result.byteLength,16);assert.equal(s.blobs.size,1);s.send({...s.payload,type:'tiktok-download-release'});assert.equal(s.blobs.size,0);}finally{s.close();}
});
test('TikTok page requests reject unrecognized sources, denied access and HTML without saving files',async()=>{
  for(const mode of ['unknown','denied','html','oversize']){
    let fetched=0;const s=pageTransferFixture(async()=>{fetched++;return mode==='denied'?new Response('Denied',{status:403}):mode==='oversize'?new Response('large',{headers:{'content-length':String(model.MAX_MEDIA_BYTES+1)}}):new Response('<html>Log in</html>');});
    try{s.send({...s.payload,...(mode==='unknown'?{url:'https://v16-webapp-prime.tiktok.com/another-video'}:{})});await new Promise(r=>setTimeout(r,0));assert.equal(s.out[0].error,{unknown:'MEDIA_UNAVAILABLE',denied:'SERVER_FORBIDDEN',html:'UNSUPPORTED_MEDIA',oversize:'MEDIA_TOO_LARGE'}[mode]);assert.equal(s.blobs.size,0);if(mode==='unknown')assert.equal(fetched,0);}finally{s.close();}
  }
});
test('cancelling the page session fetch aborts its request and creates no retained file',async()=>{
  let signal;const s=pageTransferFixture((url,init)=>new Promise((resolve,reject)=>{signal=init.signal;signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});}));
  try{s.send(s.payload);s.send({...s.payload,type:'tiktok-download-release'});await new Promise(r=>setTimeout(r,0));assert.equal(signal.aborted,true);assert.equal(s.out[0].error,'CANCELLED');assert.equal(s.blobs.size,0);}finally{s.close();}
});
test('TikTok download flows through page session, content bridge and background, then releases its page Blob',async()=>{
  const url='https://v16-webapp-prime.tiktok.com/video/tos/clip/?mime_type=video_mp4',record={id:'123',video:{width:1080,height:1920,playAddr:url}},dom=new JSDOM('<article><video src="blob:https://www.tiktok.com/player"></video><button data-e2e="share-icon">Share</button></article><script type="application/json">'+JSON.stringify(record)+'</script>',{url:'https://www.tiktok.com/@a/video/123'}),window=dom.window,ctx=browserContext(),blobs=new Map();let sessionFetches=0;
  window.postMessage=data=>queueMicrotask(()=>window.dispatchEvent(new window.MessageEvent('message',{source:window,origin:window.location.origin,data})));
  window.fetch=async(source,options)=>{assert.equal(source,url);assert.equal(options.credentials,'include');sessionFetches++;return new Response(tinyMp4());};
  window.URL.createObjectURL=blob=>{const url='blob:https://www.tiktok.com/'+uuid();blobs.set(url,blob);return url;};window.URL.revokeObjectURL=url=>blobs.delete(url);
  const host=createMediaHost({processDownload:spec=>engine.prepareMedia(spec,{fetch:async()=>{throw new Error('Background CDN request denied');}})}),sender={id:ctx.api.runtime.id,url:window.location.href,tab:{id:1},frameId:0};
  const bg=createBackground({api:ctx.api,media:host,browserKind:'chrome'});await bg.ready;
  ctx.api.runtime.connect=()=>({onDisconnect:event(),disconnect(){}});
  ctx.api.runtime.sendMessage=async m=>{try{return success(m,await bg.handle(m,sender));}catch(error){return failure(m,error);}};
  ctx.api.tabs.sendMessage=(id,m)=>new Promise(resolve=>ctx.api.runtime.onMessage.emit(m,{id:ctx.api.runtime.id},resolve));
  const page=observeMedia(window),app=installDownloads({window,api:ctx.api,isTrusted:()=>true});
  try{await app.ready;await new Promise(r=>setTimeout(r,0));app.scan();const control=window.document.querySelector('[data-linklift-download]');control.shadowRoot.querySelector('[data-action=download]').click();
    for(let i=0;i<30&&!ctx.downloads.size;i++)await new Promise(r=>setTimeout(r,0));
    assert.equal(ctx.downloads.size,1);assert.equal(sessionFetches,1);assert.equal(blobs.size,1);assert.match(ctx.downloads.get(1).url,/^blob:https:\/\/www.tiktok.com\//);
    ctx.downloads.get(1).state='complete';ctx.api.downloads.onChanged.emit({id:1,state:{current:'complete'}});for(let i=0;i<30&&blobs.size;i++)await new Promise(r=>setTimeout(r,0));assert.equal(blobs.size,0);assert.equal(control.shadowRoot.querySelector('.status').textContent,'Downloaded');
  }finally{app.dispose();page.dispose();await bg.dispose();host.dispose();window.close();}
});

test('media URLs are HTTPS, credential-free and restricted to the owning platform CDN',()=>{
  assert.equal(typeof model.safeMediaUrl,'function');
  for(const url of ['http://video.twimg.com/a.mp4','https://video.twimg.com.evil.test/a','https://u:p@video.twimg.com/a','https://127.0.0.1/a','https://video.twimg.com:444/a'])assert.throws(()=>model.safeMediaUrl('x',url));
  assert.equal(model.safeMediaUrl('x','https://video.twimg.com/a.mp4'),'https://video.twimg.com/a.mp4');
  assert.throws(()=>model.safeMediaUrl('reddit','https://video.twimg.com/a.mp4'));
  assert.equal(model.safeMediaUrl('tiktok','https://v16-webapp-prime.tiktok.com/a.mp4'),'https://v16-webapp-prime.tiktok.com/a.mp4');
  assert.throws(()=>model.safeMediaUrl('tiktok','https://evil.tiktok.com/a.mp4'));
});
test('best rendition uses pixel area then bitrate and preserves explicit choices',()=>{
  assert.equal(typeof model.normalizeItem,'function');
  const item=model.normalizeItem('x',{id:'photo1',kind:'video',variants:[{url:'https://video.twimg.com/low.mp4',width:640,height:360,bitrate:100},{url:'https://video.twimg.com/high.mp4',width:1280,height:720,bitrate:900}]});
  assert.match(model.chooseVariant(item).url,/high/);
  assert.match(model.chooseVariant(item,1).url,/low/);
  assert.throws(()=>model.chooseVariant(item,4));
});
test('X metadata associates quoted media with its own post and marks only animated_gif as GIF',()=>{
  assert.equal(typeof metadata.extractMedia,'function');
  const media=type=>({id_str:type,type,media_url_https:'https://pbs.twimg.com/media/img.jpg',video_info:{variants:[{content_type:'video/mp4',bitrate:800,url:'https://video.twimg.com/clip.mp4'}]}});
  const data={legacy:{id_str:'123',extended_entities:{media:[media('video')]}},quoted_status_result:{result:{legacy:{id_str:'456',extended_entities:{media:[media('animated_gif')]}}}}};
  const posts=metadata.extractMedia('x',data);
  assert.equal(posts.find(p=>p.postId==='123').items[0].kind,'video');
  assert.equal(posts.find(p=>p.postId==='456').items[0].kind,'gif');
  const modern=metadata.extractMedia('x',{rest_id:'789',legacy:{extended_entities:{media:[media('video')]}}});assert.equal(modern[0].postId,'789');
});
test('Instagram carousel and TikTok photo posts preserve media order',()=>{
  assert.equal(typeof metadata.extractMedia,'function');
  const image=(id)=>({pk:id,image_versions2:{candidates:[{url:`https://scontent.cdninstagram.com/${id}.jpg`,width:1080,height:1080}]}});
  const ig=metadata.extractMedia('instagram',{code:'ABC',carousel_media:[image('2'),image('1')]});
  assert.deepEqual(ig[0].items.map(i=>i.id),['2','1']);
  const tt=metadata.extractMedia('tiktok',{id:'987',imagePost:{images:[{imageURL:{urlList:['https://p16.tiktokcdn.com/a.jpeg']}},{imageURL:{urlList:['https://p16.tiktokcdn.com/b.jpeg']}}]}});
  assert.equal(tt[0].items.length,2);assert.match(tt[0].items[1].variants[0].url,/b.jpeg/);
});
test('Reddit GIF flags and separate audio requirements survive extraction',()=>{
  assert.equal(typeof metadata.extractMedia,'function');
  const data={id:'ab12',secure_media:{reddit_video:{fallback_url:'https://v.redd.it/abc/DASH_720.mp4',dash_url:'https://v.redd.it/abc/DASHPlaylist.mpd',height:720,width:1280,is_gif:false}}};
  const item=metadata.extractMedia('reddit',data)[0].items[0];
  assert.equal(item.kind,'video');assert.equal(item.variants[0].manifestUrl,'https://v.redd.it/abc/DASHPlaylist.mpd');
  data.secure_media.reddit_video.is_gif=true;assert.equal(metadata.extractMedia('reddit',data)[0].items[0].kind,'gif');
});
test('GIF encoder emits a genuine looping GIF with multiple frames',()=>{
  assert.equal(typeof gif.createGifEncoder,'function');
  const encoder=gif.createGifEncoder();
  encoder.frame(new Uint8ClampedArray([255,0,0,255,0,255,0,255]),2,1,100);
  encoder.frame(new Uint8ClampedArray([0,0,255,255,255,255,255,255]),2,1,100);
  const bytes=encoder.finish();
  assert.equal(new TextDecoder().decode(bytes.slice(0,6)),'GIF89a');assert.equal(bytes.at(-1),0x3b);
  assert.ok(new TextDecoder().decode(bytes).includes('NETSCAPE2.0'));
});
test('bounded media fetch rejects redirects, HTML and oversized streaming bodies',async()=>{
  assert.equal(typeof engine.fetchMedia,'function');
  const signal=new AbortController().signal;
  await assert.rejects(()=>engine.fetchMedia('tiktok','https://v16-webapp-prime.tiktok.com/a.mp4',{fetch:async()=>new Response('Denied',{status:403})}),/SERVER_FORBIDDEN/);
  await assert.rejects(()=>engine.fetchMedia('x','https://video.twimg.com/a.mp4',{signal,fetch:async()=>new Response('<html>',{headers:{'content-type':'text/html'}})}),/UNSUPPORTED_MEDIA/);
  await assert.rejects(()=>engine.fetchMedia('x','https://video.twimg.com/a.mp4',{signal,fetch:async()=>new Response('abc',{headers:{'content-length':String(model.MAX_MEDIA_BYTES+1)}})}),/MEDIA_TOO_LARGE/);
  let cancelled=false;await assert.rejects(()=>engine.fetchMedia('x','https://video.twimg.com/a.mp4',{signal,fetch:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-length':String(model.MAX_MEDIA_BYTES+1)}})}),/MEDIA_TOO_LARGE/);assert.equal(cancelled,true);
  const controller=new AbortController();controller.abort();let called=false;
  await assert.rejects(()=>engine.fetchMedia('x','https://video.twimg.com/a.mp4',{signal:controller.signal,fetch:async()=>{called=true;}}));assert.equal(called,false);
});
test('GIF jobs convert MP4 locally and never offer an MP4 fallback',async()=>{
  assert.equal(typeof engine.prepareMedia,'function');
  const item={id:'1',kind:'gif',variants:[{url:'https://video.twimg.com/a.mp4'}]},source=new Blob([new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109])],{type:'video/mp4'});
  let converted=false;
  const result=await engine.prepareMedia({platform:'x',postId:'123',item},{fetch:async()=>new Response(source),convertGif:async blob=>{assert.equal(blob.type,'video/mp4');converted=true;return new Blob(['GIF89a;'],{type:'image/gif'});}});
  assert.equal(converted,true);assert.match(result.filename,/\.gif$/);assert.equal(result.blob.type,'image/gif');
  await assert.rejects(()=>engine.prepareMedia({platform:'x',postId:'123',item},{fetch:async()=>new Response(source),convertGif:async()=>{throw new Error('GIF_LIMIT');}}),/GIF_LIMIT/);
});
test('Instagram original MP4 downloads use the browser transfer without fetching media into the helper',async()=>{
  let fetched=false;
  const result=await engine.prepareMedia({platform:'instagram',postId:'ABC',item:{id:'v',kind:'video',variants:[{url:'https://instagram.example.fna.fbcdn.net/reel.mp4?token=public'}]},format:'original'},{fetch:async()=>{fetched=true;throw new Error('Unexpected cross-origin fetch');}});
  assert.equal(fetched,false);assert.equal(result.transfer,'native');assert.match(result.directUrl,/reel.mp4/);assert.equal(result.filename,'linklift-instagram-ABC-v.mp4');
});
test('TikTok original MP4 requires a page-owned file instead of retrying the denied CDN transfer',async()=>{
  const url='https://v16-webapp-prime.tiktok.com/video/tos/alisg/tos-clip/?mime_type=video_mp4';
  const spec={platform:'tiktok',postId:'123',item:{id:'123',kind:'video',variants:[{url,type:'video/mp4'}]},format:'original'},pageSource={blobUrl:'blob:https://www.tiktok.com/video-file',origin:'https://www.tiktok.com',byteLength:100};
  await assert.rejects(()=>engine.prepareMedia(spec),/PAGE_CONTEXT_REQUIRED/);
  const result=await engine.prepareMedia({...spec,pageSource},{fetch:async()=>{throw new Error('CDN rejects helper fetch');}});
  assert.equal(result.transfer,'page');assert.equal(result.directUrl,pageSource.blobUrl);assert.equal(result.platform,'tiktok');assert.equal(result.filename,'linklift-tiktok-123-123.mp4');
  await assert.rejects(()=>engine.prepareMedia({...spec,pageSource:{...pageSource,blobUrl:'blob:https://evil.example/file'}}),/INVALID_MEDIA/);
});
test('TikTok page transfer is accepted, restored and released in its owning page after completion',async()=>{
  const ctx=browserContext(),token=uuid(),url='https://v16-webapp-prime.tiktok.com/video/tos/clip/?mime_type=video_mp4',host=createMediaHost({processDownload:spec=>engine.prepareMedia(spec,{fetch:async()=>{throw new Error('Unexpected helper fetch');}})});
  const sent=[],blobUrl='blob:https://www.tiktok.com/video-file';ctx.api.tabs.sendMessage=async(id,m)=>{sent.push(m);return success(m,m.command==='content.identify'?{documentToken:token}:m.command==='download.page.prepare'?{blobUrl,byteLength:100}:{});};
  let bg=createBackground({api:ctx.api,media:host,browserKind:'chrome'});
  try{await bg.ready;await bg.handle(message('download.start','background',{documentToken:token,spec:{platform:'tiktok',postId:'123',item:{id:'123',kind:'video',variants:[{url,type:'video/mp4'}]}}}),{id:ctx.api.runtime.id,url:'https://www.tiktok.com/@a/video/123',tab:{id:1},frameId:0});assert.equal(ctx.downloads.get(1).url,blobUrl);await bg.dispose();bg=createBackground({api:ctx.api,media:host,browserKind:'chrome'});await bg.ready;assert.equal(host.inventory().leases.length,1);assert.equal(host.inventory().leases[0].downloadId,1);ctx.downloads.get(1).state='complete';await Promise.all(ctx.api.downloads.onChanged.emit({id:1,state:{current:'complete'}}));await new Promise(r=>setTimeout(r,0));assert.ok(sent.some(m=>m.command==='download.page.release'));assert.equal(host.inventory().leases.length,0);}finally{await bg.dispose();host.dispose();}
});
test('native media leases retain transfer metadata without creating or revoking a Blob URL',async()=>{
  let created=0,revoked=0;const host=createMediaHost({processDownload:async()=>({transfer:'native',directUrl:'https://instagram.example.fna.fbcdn.net/reel.mp4',filename:'reel.mp4',platform:'instagram'}),createObjectURL:()=>{created++;},revokeObjectURL:()=>{revoked++;}});
  try{const result=await host.prepareDownload({documentToken:'owner'},{});assert.equal(result.transfer,'native');assert.equal(result.blobUrl,'https://instagram.example.fna.fbcdn.net/reel.mp4');assert.equal(created,0);await host.release(result.leaseId);assert.equal(revoked,0);}finally{host.dispose();}
});
test('a completed native Instagram URL can be downloaded again without stale URL cancellation',async()=>{
  const ctx=browserContext(),token=uuid(),url='https://instagram.example.fna.fbcdn.net/reel.mp4';
  const host=createMediaHost({processDownload:async()=>({transfer:'native',platform:'instagram',directUrl:url,filename:'reel.mp4'})});
  ctx.api.tabs.sendMessage=async(id,m)=>success(m,m.command==='content.identify'?{documentToken:token}:{});const download=ctx.api.downloads.download;
  ctx.api.downloads.download=async options=>{const id=await download(options);ctx.downloads.get(id).state='complete';ctx.api.downloads.onCreated.emit(ctx.downloads.get(id));return id;};
  const bg=createBackground({api:ctx.api,media:host,browserKind:'chrome'});await bg.ready;
  const sender={id:ctx.api.runtime.id,url:'https://www.instagram.com/reel/ABC/',tab:{id:1},frameId:0},payload={documentToken:token,spec:{platform:'instagram',postId:'ABC',item:{id:'v',kind:'video',variants:[{url}]}}};
  try{await bg.handle(message('download.start','background',payload),sender);await bg.handle(message('download.start','background',payload),sender);assert.equal(ctx.downloads.size,2);assert.equal([...ctx.downloads.values()].every(d=>d.state==='complete'),true);}finally{await bg.dispose();host.dispose();}
});
test('native Instagram transfers reconcile against retained metadata after a background restart',async()=>{
  const ctx=browserContext(),token=uuid(),host=createMediaHost({processDownload:async()=>({transfer:'native',platform:'instagram',directUrl:'https://instagram.example.fna.fbcdn.net/reel.mp4',filename:'reel.mp4'})});
  const lease=await host.prepareDownload({tabId:1,documentToken:token,operationId:uuid(),channel:'download-ui'},{});const id=await ctx.api.downloads.download({url:lease.blobUrl});await host.bind(lease.leaseId,id);ctx.session['tweetx.downloads']={version:1,records:[{...lease,downloadId:id,state:'BOUND'}]};
  const bg=createBackground({api:ctx.api,media:host,browserKind:'chrome'});try{await bg.ready;assert.equal(host.inventory().leases.length,1);assert.equal(ctx.downloads.get(id).state,'in_progress');}finally{await bg.dispose();host.dispose();}
});
test('native unacknowledged retry excludes the preceding same-URL download during reconciliation',async()=>{
  const ctx=browserContext(),url='https://instagram.example.fna.fbcdn.net/reel.mp4',host=createMediaHost({processDownload:async()=>({transfer:'native',platform:'instagram',directUrl:url,filename:'reel.mp4'})});
  const old=await ctx.api.downloads.download({url});ctx.downloads.get(old).state='complete';
  const lease=await host.prepareDownload({tabId:1,documentToken:uuid(),operationId:uuid(),channel:'download-ui'},{}),id=await ctx.api.downloads.download({url});
  ctx.session['tweetx.downloads']={version:1,records:[{...lease,priorDownloadIds:[old],downloadId:null,state:'STARTING'}]};
  const bg=createBackground({api:ctx.api,media:host,browserKind:'chrome'});try{await bg.ready;assert.equal(ctx.downloads.get(id).state,'in_progress');assert.equal(host.inventory().leases[0].downloadId,id);}finally{await bg.dispose();host.dispose();}
});
test('a completed restored download sends the terminal notification awaited by gallery batches',async()=>{
  const ctx=browserContext(),sent=[],token=uuid(),operationId=uuid(),host=createMediaHost({processDownload:async()=>({blob:new Blob(['GIF89a;'],{type:'image/gif'}),filename:'a.gif'}),createObjectURL:()=> 'blob:moz-extension://test/a',revokeObjectURL(){}});
  const lease=await host.prepareDownload({tabId:1,documentToken:token,operationId,channel:'download-ui'},{}),id=await ctx.api.downloads.download({url:lease.blobUrl});await host.bind(lease.leaseId,id);ctx.downloads.get(id).state='complete';ctx.session['tweetx.downloads']={version:1,records:[{...lease,downloadId:id,state:'BOUND'}]};
  ctx.api.tabs.sendMessage=async(tab,m)=>{sent.push(m);return success(m,{});};const bg=createBackground({api:ctx.api,media:host,browserKind:'chrome'});try{await bg.ready;assert.ok(sent.some(m=>m.command==='action.result'&&m.payload.operationId===operationId&&m.payload.outcome==='download-complete'));}finally{await bg.dispose();host.dispose();}
});
test('already encoded GIF is saved directly and filenames cannot escape Downloads',async()=>{
  const item={id:'a',kind:'gif',variants:[{url:'https://preview.redd.it/a.gif'}]};
  const result=await engine.prepareMedia({platform:'reddit',postId:'abc',item},{fetch:async()=>new Response('GIF89a;',{headers:{'content-type':'image/gif'}}),convertGif:()=>{throw new Error('Should not convert');}});
  assert.equal(result.filename,'linklift-reddit-abc-a.gif');
  await assert.rejects(()=>engine.prepareMedia({platform:'reddit',postId:'../../file',item}),/INVALID_MEDIA/);
});
test('generic media leases retain only final GIF output and release it on terminal cleanup',async()=>{
  const blobs=new Map(),clock=fakeClock(),host=createMediaHost({clock,processDownload:async()=>({blob:new Blob(['GIF89a;'],{type:'image/gif'}),filename:'clip.gif'}),createObjectURL:blob=>{const id='blob:test/'+blobs.size;blobs.set(id,blob);return id;},revokeObjectURL:url=>blobs.delete(url)});
  assert.equal(typeof host.prepareDownload,'function');
  const result=await host.prepareDownload({documentToken:'token'},{});
  assert.equal(result.filename,'clip.gif');assert.equal(blobs.size,1);assert.equal([...blobs.values()][0].type,'image/gif');
  await host.release(result.leaseId);assert.equal(blobs.size,0);host.dispose();assert.equal(clock.timerCount,0);
});
test('cancelling a conversion never creates a Blob lease',async()=>{
  let begin;const begun=new Promise(r=>{begin=r;});let abortSignal;
  const host=createMediaHost({processDownload:async(_,options)=>{abortSignal=options.signal;begin();await new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('CANCELLED')),{once:true}));}});
  assert.equal(typeof host.prepareDownload,'function');
  const pending=host.prepareDownload({documentToken:'owner'},{});await begun;host.cancelOwner('owner');await assert.rejects(()=>pending,/CANCELLED/);assert.equal(abortSignal.aborted,true);assert.equal(host.inventory().leases.length,0);host.dispose();
});
test('inline downloads validate the sender platform and retain the existing download lifecycle',async()=>{
  const ctx=browserContext(),token=uuid(),blobs=new Map();let prepared;
  const host=createMediaHost({processDownload:async spec=>{prepared=spec;return {blob:new Blob(['GIF89a;'],{type:'image/gif'}),filename:'clip.gif'};},createObjectURL:blob=>{blobs.set('blob:moz-extension://test/file',blob);return 'blob:moz-extension://test/file';},revokeObjectURL:url=>blobs.delete(url)});
  ctx.api.tabs.sendMessage=async(id,m)=>success(m,m.command==='content.identify'?{documentToken:token}:m.command==='download.page.prepare'?{blobUrl:'blob:https://www.tiktok.com/source',byteLength:100}:{});
  const bg=createBackground({api:ctx.api,media:host,browserKind:'chrome'});await bg.ready;
  const sender={id:ctx.api.runtime.id,url:'https://www.tiktok.com/@a/video/123',tab:{id:1},frameId:0};
  const spec={platform:'tiktok',postId:'123',item:{id:'123',kind:'video',variants:[{url:'https://v16.tiktokcdn.com/a.mp4'}]}};
  await assert.rejects(()=>bg.handle(message('download.start','background',{documentToken:token,spec:{...spec,platform:'x'}}),sender),/INVALID_MESSAGE/);
  await assert.rejects(()=>bg.handle(message('download.start','background',{documentToken:token,spec}),{...sender,frameId:1}),/INVALID_MESSAGE/);
  const result=await bg.handle(message('download.start','background',{documentToken:token,spec}),sender);
  assert.equal(result.started,true);assert.equal(prepared.platform,'tiktok');assert.equal(ctx.downloads.size,1);
  ctx.downloads.get(1).state='complete';await Promise.all(ctx.api.downloads.onChanged.emit({id:1,state:{current:'complete'}}));
  await new Promise(r=>setTimeout(r,20));assert.equal(blobs.size,0);await bg.dispose();host.dispose();
});
test('a download that finishes before acknowledgement still sends its matching completion event',async()=>{
  const ctx=browserContext(),token=uuid(),operationId=uuid(),sent=[];
  const host=createMediaHost({processDownload:async()=>({blob:new Blob(['GIF89a;'],{type:'image/gif'}),filename:'a.gif'}),createObjectURL:()=> 'blob:moz-extension://test/a',revokeObjectURL(){}});
  ctx.api.tabs.sendMessage=async(id,m)=>{sent.push(m);return success(m,m.command==='content.identify'?{documentToken:token}:{});};const original=ctx.api.downloads.download;
  ctx.api.downloads.download=async options=>{const id=await original(options);ctx.downloads.get(id).state='complete';return id;};
  const bg=createBackground({api:ctx.api,media:host,browserKind:'chrome'});await bg.ready;
  try{await bg.handle(message('download.start','background',{documentToken:token,operationId,spec:{platform:'x',postId:'123',item:{id:'a',kind:'gif',variants:[{url:'https://video.twimg.com/a.mp4'}]}}}),{id:ctx.api.runtime.id,url:'https://x.com/home',tab:{id:1},frameId:0});assert.ok(sent.some(m=>m.command==='action.result'&&m.payload.operationId===operationId&&m.payload.outcome==='download-complete'));}finally{await bg.dispose();host.dispose();}
});
test('DASH discovery exposes all video qualities with audio rather than overriding a selected quality',async()=>{
  assert.equal(typeof engine.resolveMediaVariants,'function');
  const dom=new JSDOM();const previous=globalThis.DOMParser;globalThis.DOMParser=dom.window.DOMParser;
  try{
    const xml='<MPD><Period><AdaptationSet mimeType="video/mp4"><Representation height="360" width="640"><BaseURL>DASH_360.mp4</BaseURL></Representation><Representation height="720" width="1280"><BaseURL>DASH_720.mp4</BaseURL></Representation></AdaptationSet><AdaptationSet mimeType="audio/mp4"><Representation><BaseURL>DASH_AUDIO_128.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>';
    const item={id:'ab',kind:'video',variants:[{url:'https://v.redd.it/abc/DASH_360.mp4',manifestUrl:'https://v.redd.it/abc/DASHPlaylist.mpd'}]};
    const resolved=await engine.resolveMediaVariants({platform:'reddit',item},{fetch:async()=>new Response(xml)});
    assert.equal(resolved.variants.length,2);assert.match(resolved.variants[1].url,/360/);assert.match(resolved.variants[1].audioUrl,/AUDIO/);assert.equal(resolved.variants[1].manifestUrl,undefined);
    const inherited='<MPD><Period><AdaptationSet mimeType="video/mp4"><Representation><BaseURL>DASH_720.mp4</BaseURL></Representation></AdaptationSet><AdaptationSet mimeType="audio/mp4"><Representation /></AdaptationSet></Period></MPD>';
    assert.throws(()=>engine.dashSources('reddit',inherited,'https://v.redd.it/abc/DASHPlaylist.mpd'),/AUDIO_UNAVAILABLE/);
  }finally{globalThis.DOMParser=previous;dom.window.close();}
});
test('cancel during background identification prevents media preparation',async()=>{
  const ctx=browserContext(),token=uuid();let identify,prepared=false;const gate=new Promise(r=>{identify=r;});
  const host=createMediaHost({processDownload:async()=>{prepared=true;throw new Error('UNEXPECTED');}});ctx.api.tabs.sendMessage=async(id,m)=>{if(m.command==='content.identify'){await gate;return success(m,{documentToken:token});}return success(m,{});};
  const bg=createBackground({api:ctx.api,media:host,browserKind:'chrome'});await bg.ready;const sender={id:ctx.api.runtime.id,url:'https://x.com/home',tab:{id:1},frameId:0};
  const pending=bg.handle(message('download.start','background',{documentToken:token,spec:{platform:'x',postId:'123',item:{id:'a',kind:'video',variants:[{url:'https://video.twimg.com/a.mp4'}]}}}),sender);
  await new Promise(r=>setTimeout(r,0));await bg.handle(message('download.cancel','background',{documentToken:token}),sender);identify();await assert.rejects(()=>pending,/CANCELLED/);assert.equal(prepared,false);await bg.dispose();host.dispose();
});
test('local remux retains both tracks and their packet bytes in a real MP4 container',async()=>{
  async function file(video){
    const output=new Output({format:new Mp4OutputFormat(),target:new BufferTarget()}),source=video?new EncodedVideoPacketSource('avc'):new EncodedAudioPacketSource('aac');
    if(video)output.addVideoTrack(source);else output.addAudioTrack(source);await output.start();
    const data=new Uint8Array(video?[0,0,0,2,0x65,0x88]:[0x21,0x10,0x04,0x60]);
    const decoderConfig=video?{codec:'avc1.42001e',codedWidth:16,codedHeight:16,description:new Uint8Array([1,66,0,30,255,225,0,0,0])}:{codec:'mp4a.40.2',sampleRate:44100,numberOfChannels:1,description:new Uint8Array([0x12,0x08])};
    await source.add(new EncodedPacket(data,'key',0,.1),{decoderConfig});source.close();await output.finalize();return new Blob([output.target.buffer],{type:'video/mp4'});
  }
  const video=await file(true),audio=await file(false),joined=await remuxMp4(video,audio),input=new Input({source:new BlobSource(joined),formats:[MP4]});
  try{
    const v=await input.getPrimaryVideoTrack(),a=await input.getPrimaryAudioTrack();assert.ok(v);assert.ok(a);assert.equal(await v.getCodec(),'avc');assert.equal(await a.getCodec(),'aac');
    assert.deepEqual((await new EncodedPacketSink(v).getFirstPacket()).data,new Uint8Array([0,0,0,2,0x65,0x88]));
    assert.deepEqual((await new EncodedPacketSink(a).getFirstPacket()).data,new Uint8Array([0x21,0x10,0x04,0x60]));
  }finally{input.dispose();}
});
test('GIF conversion releases decoder URLs and workers after success, failure and cancellation',async()=>{
  for(const mode of ['success','failure','cancel']){
    const held=new Set(),workers=[],abort=new AbortController();let paused=false,removed=false;
    class Video extends EventTarget{
      videoWidth=2;videoHeight=1;duration=.14;time=0;
      load(){if(this.src)queueMicrotask(()=>this.dispatchEvent(new Event('loadeddata')));}
      get currentTime(){return this.time;}set currentTime(t){this.time=t;queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}
      pause(){paused=true;}removeAttribute(){this.src='';}remove(){removed=true;}
    }
    class Worker{
      constructor(){workers.push(this);this.encoder=gif.createGifEncoder();}
      postMessage(data){queueMicrotask(()=>{
        if(mode==='failure'){this.onmessage({data:{error:'GIF_FAILED'}});return;}
        if(data.finish)this.onmessage({data:{bytes:this.encoder.finish()}});
        else{this.encoder.frame(new Uint8ClampedArray(data.rgba),data.width,data.height,data.delay);this.onmessage({data:{ready:true}});}
      });}terminate(){this.terminated=true;}
    }
    const video=new Video(),document={createElement:tag=>tag==='video'?video:{width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray([255,0,0,255,0,255,0,255])})})}};
    const options={document,Worker,signal:abort.signal,urls:{createObjectURL:()=>{held.add('source');return 'source';},revokeObjectURL:()=>held.delete('source')},progress:()=>{if(mode==='cancel')abort.abort(new Error('CANCELLED'));}};
    if(mode==='success')assert.equal((await convertVideoToGif(new Blob(),options)).type,'image/gif');
    else await assert.rejects(()=>convertVideoToGif(new Blob(),options),mode==='cancel'?/CANCELLED/:/GIF_FAILED/);
    assert.equal(held.size,0);assert.equal(paused,true);assert.equal(removed,true);assert.equal(workers.every(w=>w.terminated),true);
  }
  assert.throws(()=>gifPlan(1920,1080,60),/GIF_LIMIT/);assert.equal(gifPlan(1920,1080,2,'compact').width,480);
});
