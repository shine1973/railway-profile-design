// Exact circular fillets. Distances and geometry are in metres; table heights in mm.
export function junctions(project) {
  const index=new Map(project.points.map((p,i)=>[p.id,i]));
  const ids=project.points.filter(p=>Object.hasOwn(project.controls,p.id)).map(p=>p.id);
  const source=project.version===1?ids.slice(1).map((id,i)=>[ids[i],id]):project.segments;
  const segments=source.map(s=>s.slice().sort((a,b)=>index.get(a)-index.get(b))).sort((a,b)=>index.get(a[0])-index.get(b[0]));
  return segments.slice(1).flatMap((s,i)=>segments[i][1]===s[0]?[{id:s[0],a:segments[i][0],b:s[1]}]:[]);
}
export function curveGeometry(project,rows) {
  const byId=new Map(rows.map(r=>[r.id,r])), curves=[], issues=[];
  for(const j of junctions(project)) {
    const radius=project.curves?.[j.id];if(!radius)continue;
    const a=byId.get(j.a),v=byId.get(j.id),b=byId.get(j.b);
    const x=v.distance,y=(v.measured+project.controls[v.id])/1000;
    const m1=(y-(a.measured+project.controls[a.id])/1000)/(x-a.distance);
    const m2=((b.measured+project.controls[b.id])/1000-y)/(b.distance-x);
    const t1=Math.atan(m1),t2=Math.atan(m2),sign=Math.sign(t2-t1);
    if(Math.abs(t2-t1)<1e-12){issues.push(`序号 ${v.index+1}：两侧坡度相同，无需设置竖曲线`);continue;}
    const tangent=radius*Math.tan(Math.abs(t2-t1)/2);
    const start=x-tangent*Math.cos(t1),end=x+tangent*Math.cos(t2);
    const startY=y-tangent*Math.sin(t1);
    const cx=start-sign*radius*Math.sin(t1),cy=startY+sign*radius*Math.cos(t1);
    const c={...j,radius,m1,m2,sign,start,end,startY,cx,cy,tangent,length:radius*Math.abs(t2-t1)};
    if(start<a.distance-1e-8||end>b.distance+1e-8)issues.push(`序号 ${v.index+1}：竖曲线超出相邻坡段，请减小半径或延长坡段`);
    if(curves.length&&start<curves.at(-1).end-1e-8)issues.push(`序号 ${v.index+1}：与前一处竖曲线重叠`);
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
