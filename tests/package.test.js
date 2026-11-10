import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access,readdir} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

test('Manifest V3 source and release manifests omit the unsupported persistent background setting',async()=>{
  for(const browser of ['chrome','firefox']){
    for(const file of [`manifests/${browser}.json`,`dist/${browser}/manifest.json`]){
      const manifest=JSON.parse(await readFile(file,'utf8'));
      assert.equal(manifest.manifest_version,3);
      assert.equal(Object.hasOwn(manifest.background,'persistent'),false,`${file} must not declare background.persistent`);
      if(browser==='firefox')assert.deepEqual(manifest.background.scripts,['background.js']);
      else assert.equal(manifest.background.service_worker,'background.js');
    }
  }
});
test('both release packages reference present valid scripts and minimal browser-specific permissions',async()=>{
  for(const browser of ['chrome','firefox']) {
    const root=path.resolve('dist',browser),manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
    const files=[manifest.action.default_popup,...manifest.content_scripts.flatMap(s=>[...s.js,...(s.css||[])]),...(browser==='chrome'?[manifest.background.service_worker]:manifest.background.scripts)];
    for(const file of files)await access(path.join(root,file));
    assert.equal(manifest.manifest_version,3);assert.equal(manifest.permissions.includes('offscreen'),browser==='chrome');
    assert.ok(!manifest.permissions.includes('clipboardRead'));assert.ok(!manifest.host_permissions.includes('<all_urls>'));
    for(const script of ['content.js','background.js','popup/index.js','dashboard/index.js','social-page.js','social-bridge.js','appearance.js',...(browser==='chrome'?['media/chrome.js']:[])]) {
      const code=await readFile(path.join(root,script),'utf8');new vm.Script(code,{filename:script});
      assert.ok(!code.includes('validation.configure'),`Fault controls leaked into ${browser}/${script}`);
    }
    await assert.rejects(()=>access(path.join(root,'validation/index.html')));
  }
});
test('both browsers package real PNG icons for installation and toolbar use',async()=>{
  for(const browser of ['chrome','firefox']){
    const root=path.resolve('dist',browser),manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
    for(const size of [16,32,48,128]){
      assert.equal(typeof manifest.icons?.[size],'string',`${browser} needs its ${size}px icon`);
      assert.equal(manifest.action.default_icon?.[size],manifest.icons[size]);
      const bytes=await readFile(path.join(root,manifest.icons[size]));
      assert.equal(bytes.subarray(1,4).toString(),'PNG');
      assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
    }
    const popup=await readFile(path.join(root,manifest.action.default_popup),'utf8');
    assert.match(popup,/\.\.\/icons\/icon-48\.png/);
  }
});

test('both browsers package the dashboard and explicitly scope social clipboard adapters',async()=>{
  for(const browser of ['chrome','firefox']){
    const root=path.resolve('dist',browser),manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
    assert.equal(manifest.options_ui?.page,'dashboard/index.html');assert.equal(manifest.options_ui.open_in_tab,true);
    for(const file of ['dashboard/index.html','dashboard/index.js','dashboard/style.css','social-page.js','social-bridge.js','appearance.js'])await access(path.join(root,file));
    const page=manifest.content_scripts.find(entry=>entry.world==='MAIN');assert.ok(page);
    assert.deepEqual(page.js,['social-page.js']);assert.equal(page.run_at,'document_start');
    for(const host of ['www.instagram.com','www.reddit.com','www.tiktok.com'])assert.ok(page.matches.includes(`https://${host}/*`));
    assert.ok(!page.matches.some(pattern=>pattern.includes('x.com')||pattern.includes('*://*')));
    assert.ok(!manifest.permissions.includes('tabs'));assert.ok(!manifest.permissions.includes('clipboardRead'));
  }
});
