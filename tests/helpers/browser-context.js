export function event() {const handlers=new Set();return {addListener:fn=>handlers.add(fn),removeListener:fn=>handlers.delete(fn),emit(...args){return [...handlers].map(fn=>fn(...args));},get size(){return handlers.size;}};}
export function browserContext() {
  const local={},session={},downloads=new Map();let sequence=0;
  const area=data=>({async get(key){return {[key]:structuredClone(data[key])};},async set(values){Object.assign(data,structuredClone(values));}});
  const api={runtime:{id:'extension-test',getURL:path=>`moz-extension://test/${path}`,onMessage:event(),onConnect:event(),onInstalled:event()},storage:{local:area(local),session:area(session),onChanged:event()},contextMenus:{onClicked:event(),async removeAll(){},create(){}},tabs:{async sendMessage(){throw new Error('tab gone');}},downloads:{onChanged:event(),onCreated:event(),async download(options){const id=++sequence;downloads.set(id,{id,url:options.url,state:'in_progress',startTime:new Date().toISOString()});return id;},async search(query){return [...downloads.values()].filter(item=>query.id===undefined||item.id===query.id);},async cancel(id){const item=downloads.get(id);if(item)item.state='interrupted';}}};
  return {api,local,session,downloads};
}
