import test from 'node:test';
import assert from 'node:assert/strict';
const media = await import('../src/shared/media.js').catch(() => ({}));
const input='https://pbs.twimg.com/media/Photo_abc?format=jpg&name=small';
test('constructs only the original and displayed candidates on the allowed media host', () => {
  assert.equal(typeof media.mediaCandidates,'function','Media rules must exist');
  assert.deepEqual(media.mediaCandidates(input), ['https://pbs.twimg.com/media/Photo_abc?format=jpg&name=orig', input]);
  for (const url of ['https://evil.test/media/x','https://pbs.twimg.com/profile_images/x','http://pbs.twimg.com/media/x','https://pbs.twimg.com.evil.test/media/x']) assert.throws(() => media.mediaCandidates(url));
});
test('rejects redirects and uses one displayed fallback with accurate metadata', async () => {
  const requests=[];
  const photo=await media.fetchPhoto(input,{fetch:async (url,options)=>{
    requests.push({url,options});
    if(requests.length===1) throw new TypeError('redirect rejected');
    return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/jpeg'}});
  }});
  assert.equal(photo.rendition,'displayed-fallback');
  assert.equal(photo.blob.size,3);
  assert.equal(requests.length,2);
  assert.ok(requests.every(r=>r.options.redirect==='error'));
});
test('does not download a non-image or oversized response', async () => {
  await assert.rejects(()=>media.fetchPhoto(input,{fetch:async()=>new Response('not image',{headers:{'content-type':'text/html'}})}));
  await assert.rejects(()=>media.fetchPhoto(input,{fetch:async()=>new Response('x',{headers:{'content-type':'image/png','content-length':String(33*1024*1024)}})}), /IMAGE_TOO_LARGE/);
});
