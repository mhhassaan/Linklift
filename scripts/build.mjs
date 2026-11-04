import {build} from 'esbuild';
import {mkdir,readFile,writeFile,copyFile,access} from 'node:fs/promises';
import path from 'node:path';
const validation=process.argv.includes('--mode=validation');
for(const browser of ['chrome','firefox']) {
  const out=path.resolve('dist',...(validation?['validation']:[]),browser);
  const entries={'content':'src/content/index.js','background':`src/background/${browser}.js`,'popup/index':'src/popup/index.js'};
  if(browser==='chrome')entries['media/chrome']='src/media/chrome.js';
  if(validation)entries['validation/index']='tests/harness/index.js';
  await mkdir(out,{recursive:true});
  await build({entryPoints:entries,outdir:out,bundle:true,format:'iife',target:browser==='chrome'?'chrome121':'firefox128',define:{__VALIDATION__:String(validation)},minifySyntax:true,treeShaking:true,legalComments:'none',sourcemap:false});
  const copies=[['src/popup/index.html','popup/index.html'],['src/popup/style.css','popup/style.css'],['src/content/feedback.css','feedback.css'],[`manifests/${browser}.json`,'manifest.json']];
  for(const size of [16,32,48,128])copies.push([`assets/icon-${size}.png`,`icons/icon-${size}.png`]);
  if(browser==='chrome')copies.push(['src/media/chrome.html','media/chrome.html']);
  if(validation)copies.push(['tests/harness/index.html','validation/index.html']);
  for(const [source,dest] of copies){await mkdir(path.dirname(path.join(out,dest)),{recursive:true});await copyFile(source,path.join(out,dest));}
  const manifest=JSON.parse(await readFile(path.join(out,'manifest.json'),'utf8'));
  if(validation){manifest.name='TweetX — Validation';await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');}
  for(const file of [...Object.keys(entries).map(name=>`${name}.js`),...copies.map(([,dest])=>dest)])await access(path.join(out,file));
  console.log(`${browser}: ${path.relative(process.cwd(),out)}`);
}
