import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {browserContext} from './helpers/browser-context.js';
const ui=await import('../src/popup/index.js').catch(()=>({}));
const urls=await import('../src/shared/social.js').catch(()=>({}));
const adapter=await import('../src/content/social-page.js').catch(()=>({}));
const bridge=await import('../src/content/social-bridge.js').catch(()=>({}));
const appearance=await import('../src/content/appearance.js').catch(()=>({}));

test('cleans supported social post URLs and preserves content identifiers',()=>{
  assert.equal(typeof urls.transformSocialUrl,'function');
  for(const [original,domain,expected] of [
    ['https://www.instagram.com/reel/Ab_-123/?igsh=tracking#x','zzinstagram.com','/reel/Ab_-123/'],
    ['https://instagram.com/p/ABC/?img_index=3&igsh=tracking','custom.example','/p/ABC/?img_index=3'],
    ['https://www.reddit.com/r/cats/comments/abc123/title/def456/?utm_source=share','vxreddit.com','/r/cats/comments/abc123/title/def456/'],
    ['https://old.reddit.com/comments/abc123?share_id=tracking','vxreddit.com','/comments/abc123'],
    ['https://www.tiktok.com/@user.name/video/7111111111111111111?is_from_webapp=1','tfxktok.com','/@user.name/video/7111111111111111111'],
    ['https://www.tiktok.com/@user/photo/7111111111111111111?x=1','tfxktok.com','/@user/photo/7111111111111111111']
  ])assert.equal(urls.transformSocialUrl(original,domain),`https://${domain}${expected}`);
});

test('rejects unrelated origins, profiles, unsafe services and opaque short links',()=>{
  assert.equal(typeof urls.transformSocialUrl,'function');
  for(const value of ['https://instagram.com.evil.test/p/ABC/','http://instagram.com/p/ABC/','https://instagram.com/user/','https://reddit.com/r/cats/','https://www.reddit.com/r/cats/s/opaque','https://vm.tiktok.com/opaque/','https://tiktok.com/@user','https://user:pass@instagram.com/p/ABC/'])assert.throws(()=>urls.transformSocialUrl(value,'proxy.example'));
  assert.throws(()=>urls.transformSocialUrl('https://instagram.com/p/ABC/','proxy.example/path'));
});

test('repairs per-platform preferences independently and preserves custom services',()=>{
  assert.equal(typeof urls.socialSettings,'function');
  const settings=urls.socialSettings({instagram:{services:['custom.example'],activeDomain:'custom.example'},reddit:{services:['bad/path'],activeDomain:'bad/path'}});
  assert.deepEqual(settings.instagram,{services:['custom.example'],activeDomain:'custom.example'});
  assert.equal(settings.reddit.activeDomain,'vxreddit.com');
  assert.equal(settings.tiktok.activeDomain,'tfxktok.com');
});

function setup(url='https://www.instagram.com/'){
  const dom=new JSDOM('<button id="share">Share</button><button id="copy"><span>Copy link</span></button><button id="other">Send</button>',{url});
  const copied=[],clipboard={writeText:async text=>{copied.push(text);return 'native-result';}};
  Object.defineProperty(dom.window.navigator,'clipboard',{value:clipboard});
  let time=100;
  const controller=adapter.installSocialClipboard({window:dom.window,isTrusted:()=>true,now:()=>time});
  controller.configure({services:['custom.example'],activeDomain:'custom.example'});
  return {dom,copied,clipboard,controller,advance:()=>{time+=4000;},click:id=>dom.window.document.getElementById(id).click()};
}

test('only Copy link arms rewriting; native return values, text and unrelated URLs survive',async()=>{
  assert.equal(typeof adapter.installSocialClipboard,'function');
  const ctx=setup(),link='https://instagram.com/p/ABC/?igsh=tracking';
  ctx.click('share');assert.deepEqual(ctx.copied,[]);
  await ctx.clipboard.writeText(link);assert.equal(ctx.copied.at(-1),link);
  ctx.click('copy');assert.equal(await ctx.clipboard.writeText(link),'native-result');assert.equal(ctx.copied.at(-1),'https://custom.example/p/ABC/');
  await ctx.clipboard.writeText(link);assert.equal(ctx.copied.at(-1),link);
  ctx.click('copy');await ctx.clipboard.writeText('hello');assert.equal(ctx.copied.at(-1),'hello');
  ctx.click('copy');ctx.advance();await ctx.clipboard.writeText(link);assert.equal(ctx.copied.at(-1),link);
  ctx.click('copy');ctx.click('other');await ctx.clipboard.writeText(link);assert.equal(ctx.copied.at(-1),link);
  ctx.controller.dispose();ctx.dom.window.close();
});

test('shadow DOM Copy link actions work and cross-platform URL writes stay untouched',async()=>{
  assert.equal(typeof adapter.installSocialClipboard,'function');
  const ctx=setup('https://www.reddit.com/r/cats/');
  const host=ctx.dom.window.document.createElement('div'),shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML='<button aria-label="Copy link"><span>Icon</span></button>';ctx.dom.window.document.body.append(host);
  shadow.querySelector('span').dispatchEvent(new ctx.dom.window.MouseEvent('click',{bubbles:true,composed:true}));
  await ctx.clipboard.writeText('https://reddit.com/r/cats/comments/abc123/cat/?share_id=x');
  assert.equal(ctx.copied.at(-1),'https://custom.example/r/cats/comments/abc123/cat/');
  ctx.click('copy');await ctx.clipboard.writeText('https://instagram.com/p/ABC/');assert.equal(ctx.copied.at(-1),'https://instagram.com/p/ABC/');
  ctx.controller.dispose();ctx.dom.window.close();
});

test('Reddit short shares use only the originating post permalink and expire with its share context',async()=>{
  const ctx=setup('https://www.reddit.com/r/cats/');
  const post=ctx.dom.window.document.createElement('shreddit-post');post.setAttribute('permalink','/r/cats/comments/abc123/cat/');post.innerHTML='<button>Share</button>';ctx.dom.window.document.body.append(post);
  post.querySelector('button').click();ctx.click('copy');await ctx.clipboard.writeText('https://www.reddit.com/r/cats/s/opaque?utm_source=share');
  assert.equal(ctx.copied.at(-1),'https://custom.example/r/cats/comments/abc123/cat/');
  ctx.click('other');ctx.click('copy');const short='https://www.reddit.com/r/cats/s/opaque';await ctx.clipboard.writeText(short);assert.equal(ctx.copied.at(-1),short);
  ctx.controller.dispose();ctx.dom.window.close();
});

test('legacy copy event rewrites selected URLs without reading the clipboard',()=>{
  assert.equal(typeof adapter.installSocialClipboard,'function');
  const ctx=setup();ctx.click('copy');
  const input=ctx.dom.window.document.createElement('textarea');input.value='https://www.instagram.com/p/ABC/?igsh=x';ctx.dom.window.document.body.append(input);input.focus();input.select();
  const event=new ctx.dom.window.Event('copy',{bubbles:true,cancelable:true}),data={};
  Object.defineProperty(event,'clipboardData',{value:{setData:(type,value)=>{data[type]=value;}}});
  input.dispatchEvent(event);assert.equal(data['text/plain'],'https://custom.example/p/ABC/');assert.equal(event.defaultPrevented,true);
  ctx.controller.dispose();ctx.dom.window.close();
});

test('clipboard rejection propagates and disposal restores the original API',async()=>{
  assert.equal(typeof adapter.installSocialClipboard,'function');
  const dom=new JSDOM('<button>Copy link</button>',{url:'https://www.tiktok.com/'}),original=async()=>{throw new Error('denied');};
  const clipboard={writeText:original};Object.defineProperty(dom.window.navigator,'clipboard',{value:clipboard});
  const controller=adapter.installSocialClipboard({window:dom.window,isTrusted:()=>true});controller.configure({services:['tfxktok.com'],activeDomain:'tfxktok.com'});
  dom.window.document.querySelector('button').click();await assert.rejects(clipboard.writeText('https://tiktok.com/@user/video/123'),/denied/);
  controller.dispose();assert.equal(clipboard.writeText,original);dom.window.close();
});

test('popup selects the active platform and saves independent proxy choices; dashboard shows all platforms',async()=>{
  assert.equal(typeof ui.createSettingsView,'function');
  const dom=new JSDOM('<nav id="platforms"></nav><main id="cards"></main><p id="status"></p><a id="dashboard"></a>',{url:'https://extension.test/popup/index.html'});
  const {api,local}=browserContext();api.runtime.sendMessage=async m=>({v:1,requestId:m.requestId,ok:true,result:{version:1,services:['fixupx.com'],activeDomain:'fixupx.com'}});
  api.tabs.query=async()=>[{id:1,url:'https://www.reddit.com/r/cats/'}];api.tabs.sendMessage=async()=>({mode:'light'});
  const controller=ui.createSettingsView({document:dom.window.document,api});await controller.ready;
  assert.equal(dom.window.document.body.dataset.platform,'reddit');assert.equal(dom.window.document.body.dataset.mode,'light');
  assert.equal(dom.window.document.querySelectorAll('.platform-card:not([hidden])').length,1);
  const card=dom.window.document.querySelector('[data-site="reddit"]'),input=card.querySelector('input[type="text"]');input.value='custom.example';
  card.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
  const radio=dom.window.document.querySelector('[data-site="reddit"] input[value="custom.example"]');assert.ok(radio);radio.checked=true;radio.dispatchEvent(new dom.window.Event('change'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(local['tweetx.social'].reddit.activeDomain,'custom.example');assert.equal(local['tweetx.social'].instagram.activeDomain,'zzinstagram.com');
  controller.dispose();dom.window.close();
  const dashboard=new JSDOM('<nav id="platforms"></nav><main id="cards"></main><p id="status"></p><a id="dashboard"></a>');dashboard.window.document.body.dataset.dashboard='true';
  const all=ui.createSettingsView({document:dashboard.window.document,api});await all.ready;
  assert.equal(dashboard.window.document.querySelectorAll('.platform-card:not([hidden])').length,4);all.dispose();dashboard.window.close();
});

test('new preferences win over a delayed initial bridge read and bridge exposes only current-site configuration',async()=>{
  const dom=new JSDOM('',{url:'https://www.instagram.com/'}),ctx=browserContext();let release;const sent=[];
  ctx.api.storage.local.get=()=>new Promise(resolve=>{release=resolve;});dom.window.postMessage=value=>sent.push(value);
  const controller=bridge.createSocialBridge({window:dom.window,api:ctx.api});
  ctx.api.storage.onChanged.emit({'tweetx.social':{newValue:{instagram:{services:['custom.example'],activeDomain:'custom.example'}}}},'local');
  release({'tweetx.social':{}});await controller.ready;
  assert.equal(sent.at(-1).value.activeDomain,'custom.example');assert.equal(sent.at(-1).value.reddit,undefined);
  controller.dispose();dom.window.close();
});

test('restoring a cached page retains clipboard integration and untrusted actions cannot arm it',async()=>{
  const ctx=setup(),url='https://instagram.com/p/ABC/?igsh=tracking';
  ctx.dom.window.dispatchEvent(new ctx.dom.window.PageTransitionEvent('pagehide',{persisted:true}));ctx.click('copy');await ctx.clipboard.writeText(url);
  assert.equal(ctx.copied.at(-1),'https://custom.example/p/ABC/');ctx.controller.dispose();ctx.dom.window.close();
  const dom=new JSDOM('<button>Copy link</button>',{url:'https://instagram.com/'}),copied=[];const clipboard={writeText:async text=>copied.push(text)};Object.defineProperty(dom.window.navigator,'clipboard',{value:clipboard});
  const controller=adapter.installSocialClipboard({window:dom.window});controller.configure({activeDomain:'custom.example'});dom.window.document.querySelector('button').click();await clipboard.writeText(url);assert.equal(copied[0],url);controller.dispose();dom.window.close();
});

test('detects the page app background and keeps X preferences live in the dashboard',async()=>{
  const dom=new JSDOM('<main style="background-color:rgb(14,17,19)"></main>');assert.deepEqual(appearance.pageAppearance(dom.window),{mode:'dark'});dom.window.document.querySelector('main').style.backgroundColor='white';assert.deepEqual(appearance.pageAppearance(dom.window),{mode:'light'});dom.window.close();
  const dashboard=new JSDOM('<nav id="platforms"></nav><main id="cards"></main><p id="status"></p>'),ctx=browserContext();dashboard.window.document.body.dataset.dashboard='true';
  ctx.api.runtime.sendMessage=async m=>({v:1,requestId:m.requestId,ok:true,result:{version:1,services:['fixupx.com'],activeDomain:'fixupx.com'}});ctx.api.tabs.query=async()=>[];
  const controller=ui.createSettingsView({document:dashboard.window.document,api:ctx.api});await controller.ready;
  ctx.api.storage.onChanged.emit({'tweetx.settings':{newValue:{version:1,services:['new.example'],activeDomain:'new.example'}}},'local');
  assert.ok(dashboard.window.document.querySelector('[data-site="x"] input[value="new.example"]'));controller.dispose();dashboard.window.close();
});

test('changing one dashboard service preserves cards, focus and drafts without disabling unrelated controls',async()=>{
  const dom=new JSDOM('<main id="cards"></main><p id="status"></p>'),ctx=browserContext();dom.window.document.body.dataset.dashboard='true';
  ctx.api.runtime.sendMessage=async m=>({v:1,requestId:m.requestId,ok:true,result:{version:1,services:['fixupx.com'],activeDomain:'fixupx.com'}});ctx.api.tabs.query=async()=>[];
  const controller=ui.createSettingsView({document:dom.window.document,api:ctx.api});await controller.ready;
  const cards=[...dom.window.document.querySelectorAll('.platform-card')],draft=cards[1].querySelector('input[type="text"]');draft.value='unfinished.example';
  const radio=cards[2].querySelector('input[value="rxddit.com"]');radio.focus();
  let release;const originalSet=ctx.api.storage.local.set;
  ctx.api.storage.local.set=async value=>{await new Promise(resolve=>{release=resolve;});await originalSet(value);ctx.api.storage.onChanged.emit({['tweetx.social']:{newValue:value['tweetx.social']}},'local');};
  radio.checked=true;radio.dispatchEvent(new dom.window.Event('change'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(draft.disabled,false,'other cards must remain enabled during saving');release();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual([...dom.window.document.querySelectorAll('.platform-card')],cards,'existing card nodes must be retained');
  assert.equal(dom.window.document.activeElement,radio);assert.equal(draft.value,'unfinished.example');assert.equal(cards[2].querySelector('.card-note').textContent,'Copy link → rxddit.com');
  // A structural change may replace its own card, but must retain other drafts.
  ctx.api.storage.onChanged.emit({'tweetx.social':{newValue:{...ctx.local['tweetx.social'],reddit:{services:['custom.example'],activeDomain:'custom.example'}}}},'local');
  assert.equal(dom.window.document.querySelector('[data-site="instagram"]'),cards[1]);assert.equal(draft.value,'unfinished.example');
  controller.dispose();dom.window.close();
});

test('quick choices save the latest selection and concurrent platform saves retain both preferences',async()=>{
  const dom=new JSDOM('<main id="cards"></main><p id="status"></p>'),ctx=browserContext();dom.window.document.body.dataset.dashboard='true';
  ctx.api.runtime.sendMessage=async m=>({v:1,requestId:m.requestId,ok:true,result:{version:1,services:['fixupx.com'],activeDomain:'fixupx.com'}});ctx.api.tabs.query=async()=>[];
  const controller=ui.createSettingsView({document:dom.window.document,api:ctx.api});await controller.ready;
  let release,first=true;const originalSet=ctx.api.storage.local.set;
  ctx.api.storage.local.set=async value=>{if(first){first=false;await new Promise(resolve=>{release=resolve;});}await originalSet(value);};
  function select(site,domain){const radio=dom.window.document.querySelector(`[data-site="${site}"] input[value="${domain}"]`);radio.checked=true;radio.dispatchEvent(new dom.window.Event('change'));}
  select('reddit','rxddit.com');await new Promise(resolve=>setImmediate(resolve));
  select('reddit','vxreddit.com');select('tiktok','tnktok.com');release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ctx.local['tweetx.social'].reddit.activeDomain,'vxreddit.com');assert.equal(ctx.local['tweetx.social'].tiktok.activeDomain,'tnktok.com');
  controller.dispose();dom.window.close();
});
