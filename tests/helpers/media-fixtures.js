export const photoUrl='https://pbs.twimg.com/media/Fixture?format=png&name=small';
export function mediaDependencies(clock) {
  const blobs=new Map(),copied=[];let index=0;
  return {clock,blobs,copied,fetch:async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}}),decode:async()=>({width:3,height:2,close(){}}),writeImage:async photo=>copied.push(photo.rendition),createObjectURL:blob=>{const url=`blob:moz-extension://test/${++index}`;blobs.set(url,blob);return url;},revokeObjectURL:url=>blobs.delete(url)};
}
