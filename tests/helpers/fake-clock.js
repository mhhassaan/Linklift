export function fakeClock(start=0) {
  let time=start,sequence=0;const timers=new Map();
  return {now:()=>time,setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,at:time+delay});return id;},clearTimeout:id=>timers.delete(id),async advance(ms){const end=time+ms;while(true){const due=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!due)break;time=due[1].at;timers.delete(due[0]);await due[1].fn();}time=end;},get timerCount(){return timers.size;}};
}
