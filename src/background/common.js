import {isXUrl} from '../shared/url.js';
import {DEFAULT_SETTINGS,SETTINGS_KEY,repairSettings,validateSettings} from '../shared/settings.js';
import {mediaCandidates} from '../shared/media.js';
import {message,validEnvelope,success,failure,isUuid,uuid} from '../shared/protocol.js';
import {nativeClock} from '../shared/api.js';

const SESSION_KEY='tweetx.downloads';
const keys=(value,names)=>!!value && Object.keys(value).sort().join(',')===[...names].sort().join(',');
export function createBackground({api,media,browserKind,clock=nativeClock}) {
  const records=new Map(),documents=new Map(),workingTabs=new Set(),ports=new Map(),timers=new Set(),expiredUrls=new Map(),barriers=new Map(),operations=new Map();
  let settings=null,settingsError=null,disposed=false,saveChain=Promise.resolve(),writeChain=Promise.resolve();
  const popupUrl=api.runtime.getURL('popup/index.html'),dashboardUrl=api.runtime.getURL('dashboard/index.html'),helperUrl=api.runtime.getURL('media/chrome.html');
  const isContent=sender=>sender.id===api.runtime.id && sender.tab?.id!==undefined && (sender.frameId??0)===0 && isXUrl(sender.url);
  const isPopup=sender=>sender.id===api.runtime.id && (sender.url===popupUrl||sender.url===dashboardUrl);
  const persist=()=>{const value={version:1,records:[...records.values()]};saveChain=saveChain.catch(()=>{}).then(()=>api.storage.session.set({[SESSION_KEY]:value}));return saveChain;};
  async function send(tabId,command,payload) {
    const m=message(command,'content',payload);
    const reply=await api.tabs.sendMessage(tabId,m,{frameId:0});
    if(!reply?.ok || reply.requestId!==m.requestId)throw new Error(reply?.error?.code||'STALE_CONTEXT');
    return reply.result;
  }
  async function identify(tabId){const result=await send(tabId,'content.identify',{});if(!isUuid(result.documentToken))throw new Error('STALE_CONTEXT');return result.documentToken;}
  async function notify(owner,outcome,code=null,rendition=null) {
    await send(owner.tabId,'action.result',{documentToken:owner.documentToken,operationId:owner.operationId,outcome,code,rendition}).catch(()=>{});
  }
  async function releaseOwner(owner) {
    if(browserKind==='firefox' && !workingTabs.has(owner.tabId) && ![...records.values()].some(r=>r.owner.documentToken===owner.documentToken))await send(owner.tabId,'media.owner',{documentToken:owner.documentToken,hold:false}).catch(()=>{});
  }
  async function cleanup(leaseId,code=null,cancel=false) {
    const record=records.get(leaseId);if(!record)return;
    record.terminal=code||cancel?'failed':'complete';records.delete(leaseId);expiredUrls.set(record.blobUrl,record.expiresAt);
    if(cancel){
      const items=record.downloadId!==null?await api.downloads.search({id:record.downloadId}).catch(()=>[]):(await api.downloads.search({startedAfter:new Date(record.createdAt-1000).toISOString()}).catch(()=>[])).filter(item=>item.url===record.blobUrl);
      for(const item of items)if(item.state==='in_progress')await api.downloads.cancel(item.id).catch(()=>{});
    }
    await media.release(leaseId).catch(()=>{});await persist();await releaseOwner(record.owner);
    if(code)await notify(record.owner,'failed',code);
  }
  async function reconcile() {
    const stored=(await api.storage.session.get(SESSION_KEY))[SESSION_KEY];
    if(stored?.version===1 && Array.isArray(stored.records))for(const record of stored.records){
      if(isUuid(record.leaseId) && typeof record.blobUrl==='string' && record.blobUrl.startsWith(`blob:${api.runtime.getURL('')}`) && record.owner && Number.isInteger(record.owner.tabId) && Number.isFinite(record.expiresAt))records.set(record.leaseId,record);
    }
    const inventory=await media.inventory();const live=new Map(inventory.leases.map(lease=>[lease.leaseId,lease]));
    async function inspect(record) {
      const held=live.get(record.leaseId);
      if(!held || held.helperGeneration!==record.helperGeneration){await cleanup(record.leaseId,'HELPER_LOST',true);return;}
      if(record.expiresAt<=clock.now()){await cleanup(record.leaseId,'LEASE_EXPIRED',true);return;}
      if(record.downloadId===null){
        const found=(await api.downloads.search({startedAfter:new Date(record.createdAt-1000).toISOString()})).filter(item=>item.url===record.blobUrl);
        if(found.length===1){record.downloadId=found[0].id;record.state='BOUND';await media.bind(record.leaseId,record.downloadId);await persist();}
        else if(found.length>1){for(const item of found)if(item.state==='in_progress')await api.downloads.cancel(item.id).catch(()=>{});await cleanup(record.leaseId,'DOWNLOAD_FAILED');return;}
        else if(clock.now()-record.createdAt>=30000){await cleanup(record.leaseId,'DOWNLOAD_FAILED');return;}
        else {workingTabs.add(record.owner.tabId);const timer=clock.setTimeout(async()=>{timers.delete(timer);try{await inspect(record);}finally{if(!records.has(record.leaseId)||record.downloadId!==null)workingTabs.delete(record.owner.tabId);}},1000);timer?.unref?.();timers.add(timer);return;}
      }
      const [item]=await api.downloads.search({id:record.downloadId});
      if(!item || item.state!=='in_progress')await cleanup(record.leaseId,item?.state==='complete'?null:'DOWNLOAD_FAILED');
    }
    for(const record of [...records.values()])await inspect(record);
    for(const lease of inventory.leases)if(!records.has(lease.leaseId)){
      const timer=clock.setTimeout(()=>media.release(lease.leaseId).catch(()=>{}),Math.max(0,30000-(clock.now()-lease.createdAt)));timer?.unref?.();timers.add(timer);
    }
  }
  const ready=(async()=>{
    try{const stored=(await api.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];const fixed=repairSettings(stored);settings=fixed.settings;if(stored===undefined||fixed.repaired)await api.storage.local.set({[SETTINGS_KEY]:settings});}catch(error){settingsError=error;}
    await reconcile();
    await api.contextMenus.removeAll();
    const patterns=['https://x.com/*','https://www.x.com/*','https://twitter.com/*','https://www.twitter.com/*'];
    api.contextMenus.create({id:'tweetx',title:'TweetX',contexts:['page','image','link'],documentUrlPatterns:patterns});
    for(const [id,title] of [['tweetx-copy','Copy image'],['tweetx-download','Download image']])api.contextMenus.create({id,parentId:'tweetx',title,contexts:['page','image','link'],documentUrlPatterns:patterns});
  })();
  async function handle(m,sender) {
    if(!validEnvelope(m)||m.target!=='background'||sender.id!==api.runtime.id)throw new Error('INVALID_MESSAGE');
    await ready;
    if(m.command==='settings.get' && keys(m.payload,[]) && (isContent(sender)||isPopup(sender))){if(settingsError)throw settingsError;return settings||structuredClone(DEFAULT_SETTINGS);}
    if(m.command==='settings.replace' && isPopup(sender) && keys(m.payload,['settings'])){
      const next=validateSettings(m.payload.settings);
      writeChain=writeChain.catch(()=>{}).then(async()=>{await api.storage.local.set({[SETTINGS_KEY]:next});settings=next;settingsError=null;return next;});return writeChain;
    }
    if(m.command==='content.ready' && isContent(sender) && keys(m.payload,['documentToken']) && isUuid(m.payload.documentToken)){documents.set(sender.tab.id,m.payload.documentToken);return {documentToken:m.payload.documentToken,pendingErrors:[]};}
    if(m.command==='lease.expired' && sender.url===helperUrl && keys(m.payload,['leaseId']) && isUuid(m.payload.leaseId)){await cleanup(m.payload.leaseId,'LEASE_EXPIRED',true);return {};}
    if(typeof __VALIDATION__!=='undefined' && __VALIDATION__){
      if(sender.url===api.runtime.getURL('validation/index.html')){
        if(m.command==='validation.inspect')return {records:[...records.values()].map(r=>({leaseId:r.leaseId,state:r.state,downloadId:r.downloadId,byteLength:r.byteLength})),workingTabs:[...workingTabs],inventory:await media.inventory()};
        if(m.command==='validation.configure' && Number.isInteger(m.payload.tabId)){
          if(!['none','clipboard-denied','preferred-fetch-failed','both-fetches-failed','redirect','helper-lost'].includes(m.payload.fault)||!['none','prepared','download-id'].includes(m.payload.barrier))throw new Error('INVALID_MESSAGE');
          barriers.get(m.payload.tabId)?.resolve();barriers.delete(m.payload.tabId);
          if(m.payload.barrier==='download-id'){let resolve;const promise=new Promise(done=>{resolve=done;});barriers.set(m.payload.tabId,{promise,resolve});}
          const token=await identify(m.payload.tabId);await send(m.payload.tabId,'validation.configure',{documentToken:token,fault:m.payload.fault});
          if(m.payload.fault==='helper-lost') {await media.lose?.();for(const r of [...records.values()])await cleanup(r.leaseId,'HELPER_LOST',true);}
          else await media.configure?.(m.payload);return {};
        }
        if(m.command==='validation.release' && Number.isInteger(m.payload.tabId)){barriers.get(m.payload.tabId)?.resolve();barriers.delete(m.payload.tabId);await media.releaseBarrier?.(m.payload.tabId);return {};}
      }
    }
    throw new Error('INVALID_MESSAGE');
  }
  async function performMenu(info,tab) {
    if(!['tweetx-copy','tweetx-download'].includes(info.menuItemId)||!tab?.id||!isXUrl(info.pageUrl||tab.url))return;
    await ready;const tabId=tab.id;let owner,acquired=false,operation;
    try {
      if(workingTabs.has(tabId))throw new Error('BUSY');
      const documentToken=await identify(tabId);owner={tabId,frameId:0,documentToken,operationId:uuid()};
      const snapshot=await send(tabId,'photo.snapshot',{documentToken});
      if(snapshot?.snapshot===null)throw new Error('NOT_PHOTO');
      if(!isUuid(snapshot?.snapshotId)||snapshot.documentToken!==documentToken||!Number.isFinite(snapshot.capturedAt)||clock.now()-snapshot.capturedAt>120000||snapshot.capturedAt>clock.now()+1000)throw new Error('STALE_CONTEXT');
      mediaCandidates(snapshot.mediaUrl);
      if(!/^[A-Za-z0-9_-]{1,128}$/.test(snapshot.mediaId)||snapshot.postId!==null&&!/^\d{1,30}$/.test(snapshot.postId))throw new Error('INVALID_MESSAGE');
      if(info.srcUrl && new URL(info.srcUrl).pathname!==new URL(snapshot.mediaUrl).pathname)throw new Error('STALE_CONTEXT');
      workingTabs.add(tabId);
      acquired=true;operation={owner,cancelled:false};operations.set(owner.operationId,operation);
      if(browserKind==='firefox')await send(tabId,'media.owner',{documentToken,hold:true});
      if(operation.cancelled)throw new Error('OWNER_GONE');
      if(info.menuItemId==='tweetx-copy') {const result=await media.copy(owner,snapshot);if(operation.cancelled)throw new Error('OWNER_GONE');await notify(owner,'copied',null,result.rendition);}
      else {
        const result=await media.prepare(owner,snapshot);const {rendition,...record}=result;
        if(operation.cancelled){await media.release(record.leaseId);throw new Error('OWNER_GONE');}
        records.set(record.leaseId,record);
        try {
          await persist();record.state='STARTING';await persist();
          if(operation.cancelled||record.terminal)throw new Error('OWNER_GONE');
          record.downloadId=await api.downloads.download({url:record.blobUrl,filename:record.filename,saveAs:false,conflictAction:'uniquify'});
          if(operation.cancelled||record.terminal){await api.downloads.cancel(record.downloadId).catch(()=>{});throw new Error('DOWNLOAD_FAILED');}
          if(typeof __VALIDATION__!=='undefined'&&__VALIDATION__&&barriers.has(tabId))await barriers.get(tabId).promise;
          record.state='BOUND';await persist();await media.bind(record.leaseId,record.downloadId);
          await notify(owner,'download-started',null,rendition);
          const [item]=await api.downloads.search({id:record.downloadId});if(item?.state!=='in_progress')await cleanup(record.leaseId,item?.state==='complete'?null:'DOWNLOAD_FAILED');
        }catch(error){if(record.terminal==='complete'){await notify(owner,'download-complete');return;}await cleanup(record.leaseId,'DOWNLOAD_FAILED',true);throw error;}
      }
    }catch(error){if(!owner){try{owner={tabId,frameId:0,documentToken:await identify(tabId),operationId:uuid()};}catch{}}if(owner)await notify(owner,'failed',error.message);}
    finally{if(acquired){operations.delete(owner.operationId);workingTabs.delete(tabId);await releaseOwner(owner);}}
  }
  const onMessage=(m,sender,reply)=>{if(m?.target!=='background')return false;handle(m,sender).then(result=>reply(success(m,result)),error=>reply(failure(m,error)));return true;};
  const onMenu=(info,tab)=>{void performMenu(info,tab).catch(()=>{});};
  const onChanged=delta=>{void ready.then(async()=>{for(const r of records.values())if(r.downloadId===delta.id && ['complete','interrupted'].includes(delta.state?.current)){await cleanup(r.leaseId,delta.state.current==='complete'?null:'DOWNLOAD_FAILED');if(delta.state.current==='complete')await notify(r.owner,'download-complete');break;}}).catch(()=>{});};
  const onCreated=item=>{if(expiredUrls.has(item.url))void api.downloads.cancel(item.id).catch(()=>{});};
  const onConnect=port=>{if(browserKind!=='firefox'||port.name!=='tweetx.media-owner.v1'||!isContent(port.sender))return;const id=port.sender.tab.id;ports.set(id,port);port.onDisconnect.addListener(()=>{if(ports.get(id)!==port)return;ports.delete(id);for(const op of operations.values())if(op.owner.tabId===id){op.cancelled=true;media.cancelOwner?.(op.owner.documentToken);}void ready.then(async()=>{for(const record of [...records.values()])if(record.owner.tabId===id)await cleanup(record.leaseId,'OWNER_GONE',true);}).catch(()=>{});});};
  api.runtime.onMessage.addListener(onMessage);api.contextMenus.onClicked.addListener(onMenu);api.downloads.onChanged.addListener(onChanged);api.downloads.onCreated.addListener(onCreated);api.runtime.onConnect.addListener(onConnect);
  return {ready,handle,performMenu,reconcile,expire:leaseId=>cleanup(leaseId,'LEASE_EXPIRED',true),async dispose(){disposed=true;for(const timer of timers)clock.clearTimeout(timer);api.runtime.onMessage.removeListener(onMessage);api.contextMenus.onClicked.removeListener(onMenu);api.downloads.onChanged.removeListener(onChanged);api.downloads.onCreated.removeListener(onCreated);api.runtime.onConnect.removeListener(onConnect);await saveChain;},get disposed(){return disposed;}};
}
