export const getApi = () => globalThis.browser ?? globalThis.chrome;
export function listen(event, handler) { event.addListener(handler); return () => event.removeListener(handler); }
export const nativeClock = {now:()=>Date.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)};
