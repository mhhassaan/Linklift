export const uuid = () => crypto.randomUUID();
export const isUuid = value => typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function message(command,target,payload={}) { return {v:1,requestId:uuid(),target,command,payload}; }
export function validEnvelope(m) {
  return !!m && Object.getPrototypeOf(m)===Object.prototype && Object.keys(m).sort().join(',')==='command,payload,requestId,target,v' && m.v===1 && isUuid(m.requestId) && ['background','content','media'].includes(m.target) && typeof m.command==='string' && !!m.payload && Object.getPrototypeOf(m.payload)===Object.prototype && JSON.stringify(m).length<=16384;
}
export function success(m,result) { return {v:1,requestId:m.requestId,ok:true,result}; }
export function failure(m,error) { return {v:1,requestId:m?.requestId,ok:false,error:{code:error?.message || 'INVALID_MESSAGE'}}; }
export async function request(api,command,target,payload={},timeout=5000) {
  const m=message(command,target,payload);
  let timer;
  try {
    const response=await Promise.race([api.runtime.sendMessage(m),new Promise((_,reject)=>{ timer=setTimeout(()=>reject(new Error('TIMEOUT')),timeout); })]);
    if(!response || response.requestId!==m.requestId || !response.ok) throw new Error(response?.error?.code || 'INVALID_MESSAGE');
    return response.result;
  } finally {clearTimeout(timer);}
}
