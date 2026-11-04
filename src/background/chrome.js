import {getApi} from '../shared/api.js';
import {request} from '../shared/protocol.js';
import {createBackground} from './common.js';
export function createChromeMedia(api) {
let creating=null,closing=null,active=0,validationPending=false;
async function existing(){return (await api.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[api.runtime.getURL('media/chrome.html')]})).length>0;}
async function ensure(){if(closing)await closing;if(await existing())return;if(!creating)creating=api.offscreen.createDocument({url:'media/chrome.html',reasons:['CLIPBOARD','BLOBS'],justification:'Copy the selected X photo and retain validated image bytes for its download.'}).finally(()=>{creating=null;});await creating;}
async function closeIdle(){if(active||closing||validationPending||!await existing())return;const inventory=await request(api,'lease.inventory','media',{});if(!active&&!validationPending&&!inventory.leases.length){closing=api.offscreen.closeDocument().catch(()=>{}).finally(()=>{closing=null;});await closing;}}
const call=async(command,payload)=>{active++;if(command==='media.copy'||command==='media.prepare')validationPending=false;try{await ensure();return await request(api,command,'media',payload,40000);}finally{active--;await closeIdle().catch(()=>{});}};
const media={copy:(owner,snapshot)=>call('media.copy',{owner,snapshot}),prepare:(owner,snapshot)=>call('media.prepare',{owner,snapshot}),bind:(leaseId,downloadId)=>call('lease.bind',{leaseId,downloadId}),
  async inventory(){return await existing()?request(api,'lease.inventory','media',{}):{helperGeneration:null,leases:[]};},
  async release(leaseId){if(!await existing())return {released:true};return call('lease.release',{leaseId,reason:'terminal'});},
  async lose(){if(await existing())await api.offscreen.closeDocument();}
};
if(typeof __VALIDATION__!=='undefined'&&__VALIDATION__){media.configure=payload=>{validationPending=true;return call('validation.configure',payload);};media.releaseBarrier=tabId=>call('validation.release',{tabId});}
return media;
}
const api=getApi();
if(api?.runtime){const background=createBackground({api,media:createChromeMedia(api),browserKind:'chrome'});background.ready.catch(error=>console.error('TweetX initialization:',error.message));}
