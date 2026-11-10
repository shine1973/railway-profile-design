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
