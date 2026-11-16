import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installDownloads} from '../src/download/content.js';
import {observeMedia} from '../src/download/page.js';
import {prepareMedia} from '../src/download/engine.js';
import {createBackground} from '../src/background/common.js';
import {createMediaHost} from '../src/media/host.js';
import {browserContext,event} from './helpers/browser-context.js';
import {success,failure,uuid} from '../src/shared/protocol.js';

const actions='<section style="display:flex"><button aria-label="Like">Like</button><button aria-label="Send">Send</button><button aria-label="Save">Save</button></section>';
const photo='<img width="500" height="500" src="https://scontent.cdninstagram.com/photo.png">',clip='<video src="blob:https://www.instagram.com/playback"></video>';
const photoData={pk:'photo',image_versions2:{candidates:[{url:'https://scontent.cdninstagram.com/photo.png',width:1080,height:1350}]}},videoData={pk:'video',video_versions:[{url:'https://scontent.cdninstagram.com/video.mp4',width:1080,height:1920},{url:'https://scontent.cdninstagram.com/low.mp4',width:360,height:640}]};
const fixtures=[
  {name:'feed photo',html:`<article>${photo}${actions}<a href="/p/ABC/"><time>Now</time></a></article>`,data:photoData,path:'/',kind:'image'},
  {name:'standalone reel',html:`<main><div>${clip}${actions}</div></main>`,data:videoData,path:'/artist/reel/ABC/',kind:'video'},
  {name:'opened post modal',html:`<div role="dialog"><article>${clip}${actions}<a href="/reel/ABC/"><time>Now</time></a></article></div>`,data:videoData,path:'/reel/ABC/',kind:'video'},
  {name:'profile reel cover',html:'<main><a href="/artist/reel/ABC/"><img width="300" height="400" src="https://scontent.cdninstagram.com/cover.jpg"></a></main>',data:videoData,path:'/artist/',kind:'video'},
  {name:'Explore photo cover',html:'<main><a href="/p/ABC/"><img width="300" height="400" src="https://scontent.cdninstagram.com/thumb.jpg"></a></main>',data:photoData,path:'/explore/',kind:'image'},
  {name:'mixed carousel selected video',html:`<article><ul><li>${photo}</li><li>${clip}</li></ul>${actions}<a href="/p/ABC/"><time>Now</time></a></article>`,data:{carousel_media:[photoData,videoData]},path:'/p/ABC/?img_index=2',kind:'video'}
];
test('Instagram layout downloads reach saving and completion through the production content/background pipeline',async t=>{
  for(const fixture of fixtures)await t.test(fixture.name,async()=>{
    const dom=new JSDOM(fixture.html+'<script type="application/json">'+JSON.stringify({code:'ABC',...fixture.data})+'</script>',{url:'https://www.instagram.com'+fixture.path}),window=dom.window,ctx=browserContext(),blobs=new Map();let fetched=0;
    window.postMessage=data=>queueMicrotask(()=>window.dispatchEvent(new window.MessageEvent('message',{source:window,origin:window.location.origin,data})));
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ7sAAAAASUVORK5CYII=','base64');
    const host=createMediaHost({processDownload:spec=>prepareMedia(spec,{fetch:async url=>{fetched++;assert.equal(url,'https://scontent.cdninstagram.com/photo.png');return new Response(png);}}),createObjectURL:blob=>{const url='blob:moz-extension://test/'+uuid();blobs.set(url,blob);return url;},revokeObjectURL:url=>blobs.delete(url)});
    const bg=createBackground({api:ctx.api,media:host,browserKind:'chrome'});await bg.ready;
    const sender={id:ctx.api.runtime.id,url:window.location.href,tab:{id:1},frameId:0};ctx.api.runtime.connect=()=>({onDisconnect:event(),disconnect(){}});
    ctx.api.runtime.sendMessage=async m=>{try{return success(m,await bg.handle(m,sender));}catch(error){return failure(m,error);}};
    ctx.api.tabs.sendMessage=(id,m)=>new Promise(resolve=>ctx.api.runtime.onMessage.emit(m,{id:ctx.api.runtime.id},resolve));
    const page=observeMedia(window),app=installDownloads({window,api:ctx.api,isTrusted:()=>true});
    try{
      await app.ready;await new Promise(r=>setTimeout(r,0));app.scan();const control=window.document.querySelector('[data-linklift-download]');assert.ok(control);control.shadowRoot.querySelector('[data-action=download]').click();
      for(let i=0;i<40&&!ctx.downloads.size;i++)await new Promise(r=>setTimeout(r,0));assert.equal(ctx.downloads.size,1,fixture.name);
      const file=ctx.downloads.get(1);if(fixture.kind==='video'){assert.equal(file.url,'https://scontent.cdninstagram.com/video.mp4');assert.equal(fetched,0);}else{assert.equal(fetched,1);assert.equal(blobs.get(file.url)?.size,png.length);}
      file.state='complete';ctx.api.downloads.onChanged.emit({id:1,state:{current:'complete'}});for(let i=0;i<40&&control.shadowRoot.querySelector('.status').textContent!=='Downloaded';i++)await new Promise(r=>setTimeout(r,0));assert.equal(control.shadowRoot.querySelector('.status').textContent,'Downloaded');assert.equal(blobs.size,0);
    }finally{app.dispose();page.dispose();await bg.dispose();host.dispose();window.close();}
  });
});
