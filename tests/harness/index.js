import {getApi} from '../../src/shared/api.js';
import {request} from '../../src/shared/protocol.js';
import {isXUrl} from '../../src/shared/url.js';
const api=getApi(),tab=document.getElementById('tab'),output=document.getElementById('output');
api.tabs.query({}).then(tabs=>{for(const item of tabs){if(isXUrl(item.url)){const option=document.createElement('option');option.value=String(item.id);option.textContent=`${item.id}: ${item.title||'X tab'}`;tab.append(option);}}},error=>{output.textContent=error.message;});
async function run(command,payload){try{output.textContent=JSON.stringify(await request(api,command,'background',payload),null,2);}catch(error){output.textContent=error.message;}}
document.getElementById('apply').onclick=()=>run('validation.configure',{tabId:Number(tab.value),fault:document.getElementById('fault').value,barrier:document.getElementById('barrier').value});
document.getElementById('inspect').onclick=()=>run('validation.inspect',{});
document.getElementById('release').onclick=()=>run('validation.release',{tabId:Number(tab.value)});
