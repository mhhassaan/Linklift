const labels={BUSY:'Finish or cancel an existing image action first.',NOT_PHOTO:'Right-click a photo first.',STALE_CONTEXT:'This photo is no longer selected. Right-click it again.',IMAGE_TOO_LARGE:'This image exceeds the supported size.',OWNER_GONE:'Download interrupted. Retry from the post.',LEASE_EXPIRED:'Download expired. Retry from the post.',HELPER_LOST:'Image action interrupted. Retry.',CLIPBOARD_DENIED:'Could not copy the image. Check clipboard access.'};
export function createFeedback(document) {
  let timer;
  const remove=()=>{clearTimeout(timer);document.getElementById('tweetx-feedback')?.remove();};
  function show(text,{original,onOriginal,error=false,persistent=false}={}) {
    remove();const box=document.createElement('div');box.id='tweetx-feedback';box.setAttribute('role',error?'alert':'status');box.setAttribute('aria-live',error?'assertive':'polite');
    const copy=document.createElement('p');copy.textContent=text;box.append(copy);
    if(original){const input=document.createElement('input');input.readOnly=true;input.value=original;input.setAttribute('aria-label','Original X post link');input.addEventListener('click',()=>input.select());box.append(input);const button=document.createElement('button');button.textContent='Use original Share';button.dataset.action='original';button.addEventListener('click',()=>{onOriginal?.();remove();});box.append(button);}
    const close=document.createElement('button');close.textContent='Dismiss';close.addEventListener('click',remove);box.append(close);
    (document.body||document.documentElement).append(box);
    if(!persistent&&!error)timer=setTimeout(remove,4500);
  }
  return {show,error:code=>show(labels[code]||'Image action failed. Retry or use X directly.',{error:true}),dispose:remove};
}
