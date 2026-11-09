// Labels occupy their own growing band above the plot. Never hide or truncate one.
export function layoutLabels(items, left, right, measure) {
  const maxWidth=Math.max(1,right-left-12), lanes=[];
  const labels=[...items].sort((a,b)=>a.x-b.x).map(item=>{
    const lines=[];let line='';
    for(const char of String(item.text)) {
      if(line&&measure(line+char)>maxWidth){lines.push(line);line='';}
      line+=char;
    }
    lines.push(line);
    const width=Math.min(right-left,Math.max(...lines.map(measure))+12),height=lines.length*16+8;
    const x=Math.max(left,Math.min(item.x-width/2,right-width));
    let lane=lanes.findIndex(l=>l.boxes.every(b=>x+width+8<=b.x||x>=b.x+b.width+8));
    if(lane<0){lane=lanes.length;lanes.push({height:0,boxes:[]});}
    lanes[lane].height=Math.max(lanes[lane].height,height);lanes[lane].boxes.push({x,width});
    return {...item,x,anchorX:item.x,width,height,lines,lane};
  });
  let height=0;const offsets=lanes.map(l=>{const y=height;height+=l.height+6;return y;});
  return {height,labels:labels.map(l=>({...l,y:offsets[l.lane]}))};
}
