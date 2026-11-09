// View coordinates use record sequence, never the possibly duplicated field label.
export function fullView(count) { return {min: .5, max: Math.max(1, count) + .5}; }
export function clampView(view, count) {
  const full = fullView(count), span = Math.min(view.max - view.min, full.max - full.min);
  const min = Math.max(full.min, Math.min(view.min, full.max - span));
  return {min, max: min + span};
}
export function zoomView(view, count, ratio, delta, sensitivity = 1) {
  const full = fullView(count), span = view.max - view.min;
  const next = Math.max(Math.min(2, count), Math.min(full.max-full.min, span * Math.exp(Math.max(-2, Math.min(2, delta * .002 * sensitivity)))));
  const anchor = view.min + ratio * span;
  return clampView({min: anchor - ratio * next, max: anchor + (1-ratio)*next}, count);
}
export function displayOffset(rows, controls) {
  let min = 0;
  for (const r of rows) {
    min = Math.min(min, r.measured, r.design ?? Infinity);
    if (Object.hasOwn(controls, r.id)) min = Math.min(min, r.measured + controls[r.id]);
  }
  // One common offset for the whole dataset; panning does not change heights.
  return Math.ceil((100-min)/100)*100;
}
export function elevationAxis(values) {
  const lo=Math.min(...values), hi=Math.max(...values), padding=Math.max(10,(hi-lo)*.12);
  const desired=Math.max(5,(hi-lo+2*padding)/6);
  const magnitude=10**Math.floor(Math.log10(desired));
  const step=Math.max(5,[1,2,5,10].map(v=>v*magnitude).find(v=>v>=desired));
  const min=Math.max(0,Math.floor((lo-padding)/step)*step);
  const max=Math.max(min+step,Math.ceil((hi+padding)/step)*step);
  const ticks=[];for(let n=min;n<=max+step*.001;n+=step)ticks.push(n);
  return {min,max,ticks,step};
}
export function sequenceTicks(view, count) {
  const desired=Math.max(1,(view.max-view.min)/8), magnitude=10**Math.floor(Math.log10(desired));
  const step=Math.max(1,[1,2,5,10].map(v=>v*magnitude).find(v=>v>=desired));
  const ticks=[];
  for(let n=Math.max(1,Math.ceil(view.min/step)*step);n<=Math.min(count,view.max);n+=step)ticks.push(n);
  if(view.min<=1&&!ticks.includes(1))ticks.unshift(1);
  return ticks;
}
