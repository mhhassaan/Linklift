export const MAX_BYTES=32*1024*1024;
export const MAX_PIXELS=48_000_000;
export function mediaCandidates(input) {
  let url;
  try {url=new URL(input);} catch {throw new Error('NOT_PHOTO');}
  if(url.protocol!=='https:' || url.hostname!=='pbs.twimg.com' || url.port || url.username || url.password || !/^\/media\/[A-Za-z0-9_-]{1,128}(?:\.(?:jpg|jpeg|png|webp))?$/.test(url.pathname) || url.hash) throw new Error('NOT_PHOTO');
  const format=url.searchParams.get('format');
  if(format && !['jpg','jpeg','png','webp'].includes(format)) throw new Error('NOT_PHOTO');
  const preferred=new URL(url); preferred.searchParams.set('name','orig');
  return [...new Set([preferred.href,url.href])];
}
export async function fetchPhoto(input,{fetch:fetcher=globalThis.fetch,signal,decode}={}) {
  const candidates=mediaCandidates(input);
  let last=new Error('FETCH_FAILED');
  for(let index=0;index<candidates.length;index++) {
    try {
      const timeout=AbortSignal.timeout(15000);
      const response=await fetcher(candidates[index],{redirect:'error',credentials:'include',signal:signal ? AbortSignal.any([signal,timeout]) : timeout});
      if(!response.ok) throw new Error('FETCH_FAILED');
      const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if(!['image/jpeg','image/png','image/webp'].includes(type)) throw new Error('DECODE_FAILED');
      if(Number(response.headers.get('content-length'))>MAX_BYTES) throw new Error('IMAGE_TOO_LARGE');
      const reader=response.body?.getReader();
      if(!reader) throw new Error('FETCH_FAILED');
      const chunks=[];let size=0;
      try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw new Error('IMAGE_TOO_LARGE');chunks.push(value);}}
      finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
      if(!size) throw new Error('DECODE_FAILED');
      const blob=new Blob(chunks,{type});
      const result={blob,rendition:index===0?'original-candidate':'displayed-fallback'};
      if(decode) Object.assign(result,await decode(blob));
      return result;
    }catch(error){
      last=error instanceof Error?error:new Error('FETCH_FAILED');
      if(signal?.aborted)throw last;
    }
  }
  throw last;
}
export function imageFilename(mediaId,postId,type) {
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[type];
  if(!ext)throw new Error('DECODE_FAILED');
  return `linklift-${String(postId || 'photo').replace(/[^\d]/g,'') || 'photo'}-${String(mediaId).replace(/[^A-Za-z0-9_-]/g,'').slice(0,128)}.${ext}`;
}
