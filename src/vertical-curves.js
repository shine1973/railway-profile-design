// Exact circular fillets. Distances and geometry are in metres; table heights in mm.
export function junctions(project) {
  const index=new Map(project.points.map((p,i)=>[p.id,i]));
  const ids=project.points.filter(p=>Object.hasOwn(project.controls,p.id)).map(p=>p.id);
  const source=project.version===1?ids.slice(1).map((id,i)=>[ids[i],id]):project.segments;
  const segments=source.map(s=>s.slice().sort((a,b)=>index.get(a)-index.get(b))).sort((a,b)=>index.get(a[0])-index.get(b[0]));
  return segments.slice(1).map((s,i)=>{const left=segments[i];return {id:left[1]===s[0]?s[0]:[...left,...s].join('~'),a:left[0],leftEnd:left[1],rightStart:s[0],b:s[1],leftIndex:project.segments?.findIndex(p=>p.includes(left[0])&&p.includes(left[1]))??i,rightIndex:project.segments?.findIndex(p=>p.includes(s[0])&&p.includes(s[1]))??i+1};});
}
export function curveGeometry(project,rows) {
  const byId=new Map(rows.map(r=>[r.id,r])), curves=[], issues=[];
  for(const j of junctions(project)) {
    const radius=project.curves?.[j.id];if(!radius)continue;
    const a=byId.get(j.a),le=byId.get(j.leftEnd),rs=byId.get(j.rightStart),b=byId.get(j.b);
    const ya=(a.measured+project.controls[a.id])/1000,yl=(le.measured+project.controls[le.id])/1000;
    const yr=(rs.measured+project.controls[rs.id])/1000,yb=(b.measured+project.controls[b.id])/1000;
    const m1=(yl-ya)/(le.distance-a.distance),m2=(yb-yr)/(b.distance-rs.distance);
    const description=`坡段 ${j.leftIndex+1} → ${j.rightIndex+1}`;
    const t1=Math.atan(m1),t2=Math.atan(m2),sign=Math.sign(t2-t1);
    if(Math.abs(t2-t1)<1e-12){issues.push(`${description}：两侧坡线平行，无法定位有限交点`);continue;}
    const x=(yr-ya+m1*a.distance-m2*rs.distance)/(m1-m2),y=ya+m1*(x-a.distance);
    const tangent=radius*Math.tan(Math.abs(t2-t1)/2);
    const start=x-tangent*Math.cos(t1),end=x+tangent*Math.cos(t2);
    const startY=y-tangent*Math.sin(t1);
    const cx=start-sign*radius*Math.sin(t1),cy=startY+sign*radius*Math.cos(t1);
    const c={...j,x,y,from:a.distance,to:b.distance,radius,m1,m2,sign,start,end,startY,cx,cy,tangent,length:radius*Math.abs(t2-t1)};
    if(start<a.distance-1e-8||end>b.distance+1e-8)issues.push(`${description}：竖曲线超出相邻坡段，请减小半径或延长坡段`);
    if(curves.length&&start<curves.at(-1).end-1e-8)issues.push(`${description}：与前一处竖曲线重叠`);
    curves.push(c);
  }
  return {curves,issues};
}
export function curveHeight(c,x) {
  // Difference of roots avoids subtracting two large radius-sized heights.
  const u=x-c.cx,u0=c.start-c.cx;
  const q=Math.sqrt(Math.max(0,c.radius*c.radius-u*u)),q0=Math.sqrt(Math.max(0,c.radius*c.radius-u0*u0));
  return (c.startY+c.sign*(u*u-u0*u0)/(q+q0))*1000;
}

// Geometric limit and lift-only rounded candidates. Never change project data.
// Values are whole metres, with at most two significant digits; not a standards check.
export function recommendRadius(project,rows,id){
  const candidates=junctions(project),position=candidates.findIndex(j=>j.id===id);
  if(position<0)return {reason:'请先建立前后两个坡段'};
  const current=curveGeometry({...project,curves:{[id]:1}},rows).curves[0];
  if(!current)return {reason:'两条坡线平行，无法推荐半径'};
  const other=curveGeometry({...project,curves:Object.fromEntries(Object.entries(project.curves??{}).filter(([key])=>key!==id))},rows);
  if(other.issues.length)return {reason:'请先处理其他竖曲线的几何冲突'};
  let left=current.from,right=current.to;
  for(const c of other.curves){const index=candidates.findIndex(j=>j.id===c.id);if(index<position)left=Math.max(left,c.end);else right=Math.min(right,c.start);}
  const t1=Math.atan(current.m1),t2=Math.atan(current.m2),k=Math.tan(Math.abs(t2-t1)/2);
  const maximum=Math.min((current.x-left)/(k*Math.cos(t1)),(right-current.x)/(k*Math.cos(t2)));
  if(!Number.isFinite(maximum)||maximum<.001)return {reason:'交点两侧没有足够空间，请调整坡段'};
  if(maximum<1)return {maximum,reason:'可容纳最大半径不足1 m，没有正整数几何可用值；仍可手动填写小数'};
  // Search every supported rounded integer, largest first. Concave curves can
  // need a larger radius, convex curves a smaller one: do not assume one direction.
  const values=[];
  for(let unit=1;unit<=1000000;unit*=10)for(let n=1;n<100;n++){
    const r=n*unit;if(r<=maximum&&r<=10000000)values.push(r);
  }
  const affected=rows.filter(r=>r.distance>=current.from&&r.distance<=current.to);
  let best=null;
  for(const radius of [...new Set(values)].sort((a,b)=>b-a)){
    const check=curveGeometry({...project,curves:{...project.curves,[id]:radius}},rows);
    if(check.issues.length)continue;
    const c=check.curves.find(c=>c.id===id);
    let worst=null;
    for(const row of affected){
      const x=row.distance;
      let height=x<c.start?(c.y+c.m1*(x-c.x))*1000:x>c.end?(c.y+c.m2*(x-c.x))*1000:curveHeight(c,x);
      // Preserve adjacent enabled arcs where they occupy the shared straight segment.
      for(const neighbor of other.curves)if(x>=neighbor.start&&x<=neighbor.end)height=curveHeight(neighbor,x);
      const deficit=row.measured-height;
      if(!worst||deficit>worst.deficit)worst={deficit,index:row.index,no:row.no};
    }
    if(!worst||worst.deficit<=1e-7)return {radius,maximum,inputLimit:10000000,start:c.start,end:c.end};
    if(!best||worst.deficit<best.deficit)best={...worst,radius};
  }
  return {maximum,shortfall:best,reason:best
    ?`没有满足只起不落的取整半径，请手动调整控制点。候选值中最小的最大欠缺量 ${(Math.ceil(best.deficit*10)/10).toFixed(1)} mm（现场点号 ${best.no} · 记录序号 ${best.index+1}，试算半径 ${best.radius} m）`
    :'当前坡段组合存在几何冲突，请手动调整控制点'};
}
