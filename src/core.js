export const HEADERS = ['特征点', '点号', '前视读数', '后视读数'];
export const blank = v => v === null || v === undefined || String(v).trim() === '';
export function integer(value, label, optional = false) {
  if (blank(value)) { if (optional) return null; throw new Error(`${label}不能为空`); }
  if (!['number', 'string'].includes(typeof value) || !/^[+-]?\d+(?:\.0+)?$/.test(String(value).trim()) || !Number.isSafeInteger(Number(value)))
    throw new Error(`${label}必须是整毫米数值或整数编号`);
  return Number(value);
}
export function parseRows(rows) {
  const headerIndex = rows.findIndex(r => HEADERS.every(h => r.some(v => String(v ?? '').trim() === h)));
  if (headerIndex < 0) throw new Error('缺少表头：特征点、点号、前视读数、后视读数。请使用 .xlsx 文件。');
  const header = rows[headerIndex].map(v => String(v ?? '').trim());
  for (const h of HEADERS) if (header.filter(v => v === h).length !== 1) throw new Error(`表头“${h}”重复`);
  const cols = HEADERS.map(h => header.indexOf(h)), points = [], errors = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const sourceRow = headerIndex + offset + 2;
    const v = cols.map(c => row[c]);
    if (v.every(blank)) return;
    const p = {id: `p${sourceRow}`, sourceRow, feature: String(v[0] ?? '')};
    for (const [key, index, optional] of [['no', 1, false], ['fore', 2, false], ['back', 3, true]]) {
      try { p[key] = integer(v[index], HEADERS[index], optional); }
      catch (e) { errors.push(`Excel 第 ${sourceRow} 行 · ${HEADERS[index]}：${e.message}`); }
    }
    points.push(p);
  });
  if (errors.length) throw new Error(errors.join('\n'));
  if (!points.length) throw new Error('没有可导入的测点记录');
  return points;
}
export function newProject(points = [], name = '未命名项目') {
  return {format: 'railway-profile', version: 2, name, sleepers: 6, points, controls: {}, segments: [], pendingControl: null};
}
export function validateProject(raw) {
  if (!raw || raw.format !== 'railway-profile' || ![1,2].includes(raw.version)) throw new Error('不是受支持的线路拉坡项目（版本 1/2）');
  const sleepers = integer(raw.sleepers, '轨枕根数');
  if (sleepers < 1 || sleepers > 1000) throw new Error('轨枕根数应为 1 至 1000 的整数');
  if (!Array.isArray(raw.points) || raw.points.length > 10000) throw new Error('项目测点格式错误或超过 10000 点');
  const ids = new Set();
  const points = raw.points.map((p, i) => {
    if (!p || typeof p.id !== 'string' || !/^p[\w-]+$/.test(p.id) || ids.has(p.id)) throw new Error(`第 ${i + 1} 条测点标识无效或重复`);
    ids.add(p.id);
    return {id: p.id, sourceRow: Number.isSafeInteger(p.sourceRow) ? p.sourceRow : i + 2,
      feature: String(p.feature ?? ''), no: integer(p.no, '点号'), fore: integer(p.fore, '前视读数'), back: integer(p.back, '后视读数', true)};
  });
  if (!raw.controls || typeof raw.controls !== 'object' || Array.isArray(raw.controls)) throw new Error('控制点数据格式错误');
  const controls = {};
  for (const [id, lift] of Object.entries(raw.controls)) {
    if (!ids.has(id)) throw new Error('控制点对应的测点不存在');
    controls[id] = integer(lift, '控制点起道量');
  }
  const project={...newProject(points,String(raw.name??'未命名项目')),sleepers,controls};
  if(raw.version===1){
    project.segments=designSegments({...project,version:1});
    project.pendingControl=Object.keys(controls).length===1?Object.keys(controls)[0]:null;
  }else{
    if(!Array.isArray(raw.segments)||raw.segments.length>10000)throw new Error('坡段数据无效');
    project.segments=raw.segments.map(s=>{if(!Array.isArray(s)||s.length!==2)throw new Error('坡段应包含两个端点');return [...s];});
    project.pendingControl=raw.pendingControl??null;
    if(project.pendingControl!==null&&!Object.hasOwn(controls,project.pendingControl))throw new Error('待选坡段端点无效');
  }
  if(!validSegments(project))throw new Error('坡段端点无效、重复或存在重叠');
  const used=new Set(project.segments.flat());if(project.pendingControl)used.add(project.pendingControl);
  if(Object.keys(controls).some(id=>!used.has(id)))throw new Error('控制点未关联坡段');
  return project;
}
export function calculate(project) {
  const step = project.sleepers * 0.6;
  let hi = project.points[0]?.fore ?? 0;
  const result = project.points.map((p, i) => {
    const measured = hi - p.fore;
    const r = {...p, index: i, distance: i * step, instrument: hi, measured, design: null, lift: null, slope: null, increment: null};
    if (p.back !== null) hi = measured + p.back;
    return r;
  });
  const byId=new Map(result.map(r=>[r.id,r]));
  const segments=designSegments(project).map(([a,b])=>[byId.get(a),byId.get(b)]).map(([a,b])=>a.index<b.index?[a,b]:[b,a]).sort((a,b)=>a[0].index-b[0].index);
  for (const [a,b] of segments) {
    const ya = a.measured + project.controls[a.id], yb = b.measured + project.controls[b.id];
    const increment = (yb - ya) / (b.index - a.index);
    for (let i = a.index; i <= b.index; i++) {
      const r = result[i];
      r.design = i === b.index ? yb : ya + increment * (i - a.index);
      r.lift = r.design - r.measured;
      if (i < b.index) { r.increment = increment; r.slope = increment / step; }
    }
  }
  // A common assumed datum changes no height differences or lift settings.
  const minimum = result.reduce((min,r)=>Math.min(min,r.measured),0);
  const datum = 10-minimum;
  for (const r of result) {
    r.datum=datum;
    r.instrument+=datum;
    r.measured+=datum;
    if(r.design!==null)r.design+=datum;
  }
  return result;
}
export function round(value, digits = 0) {
  const scale = 10 ** digits;
  const r = Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * scale) / scale;
  return Object.is(r, -0) ? 0 : r;
}
export function designSegments(project) {
  if(project.version===1){
    const ids=project.points.filter(p=>Object.hasOwn(project.controls,p.id)).map(p=>p.id);
    return ids.slice(1).map((id,i)=>[ids[i],id]);
  }
  return project.segments;
}
function validSegments(project) {
  const indexes=new Map(project.points.map((p,i)=>[p.id,i]));
  const ranges=[];
  for(const [a,b] of project.segments){
    if(a===b||!indexes.has(a)||!indexes.has(b)||!Object.hasOwn(project.controls,a)||!Object.hasOwn(project.controls,b))return false;
    ranges.push([Math.min(indexes.get(a),indexes.get(b)),Math.max(indexes.get(a),indexes.get(b))]);
  }
  ranges.sort((a,b)=>a[0]-b[0]);
  return ranges.every((r,i)=>!i||r[0]>=ranges[i-1][1]);
}
function pruneControls(project){
  const used=new Set(project.segments.flat());if(project.pendingControl)used.add(project.pendingControl);
  for(const id of Object.keys(project.controls))if(!used.has(id))delete project.controls[id];
}
export function cancelPending(project){project.pendingControl=null;pruneControls(project);}
export function pickEndpoint(project,id){
  if(!project.points.some(p=>p.id===id))throw new Error('测点不存在');
  if(project.pendingControl===id){cancelPending(project);return;}
  const from=project.pendingControl;
  const next={...project,controls:{...project.controls,[id]:project.controls[id]??0},segments:project.segments.map(s=>[...s])};
  if(from){
    next.segments.push([from,id]);
    if(!validSegments(next))throw new Error('这一段与已有坡段重叠，请另选端点；连续坡段可共用边界点');
    next.pendingControl=null;
  }else next.pendingControl=id;
  Object.assign(project,next);
}
export function removeSegment(project,index){project.segments.splice(index,1);pruneControls(project);}
export function removeControl(project,id){
  project.segments=project.segments.filter(s=>!s.includes(id));
  if(project.pendingControl===id)project.pendingControl=null;
  delete project.controls[id];pruneControls(project);
}
export function moveControl(project,fromId,toId){
  if(fromId===toId||!Object.hasOwn(project.controls,fromId)||Object.hasOwn(project.controls,toId)||!project.points.some(p=>p.id===toId))return false;
  const next={...project,controls:{...project.controls,[toId]:project.controls[fromId]},segments:project.segments.map(s=>s.map(id=>id===fromId?toId:id)),pendingControl:project.pendingControl===fromId?toId:project.pendingControl};
  delete next.controls[fromId];
  if(!validSegments(next))return false;
  Object.assign(project,next);return true;
}
export function format(value, digits = 0, missing = '未设计') {
  if (value === null || value === undefined) return missing;
  const r = round(value, digits);
  // Preserve the sign of a negative value that rounds to zero.
  return (value < 0 && r === 0 ? '−' : '') + r.toFixed(digits);
}
export class History {
  constructor(project) { this.current = structuredClone(project); this.past = []; this.future = []; }
  change(next) {
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.past.push(structuredClone(this.current));
    if (this.past.length > 100) this.past.shift();
    this.current = structuredClone(next); this.future = [];
  }
  undo() { if (this.past.length) { this.future.push(this.current); this.current = this.past.pop(); } }
  redo() { if (this.future.length) { this.past.push(this.current); this.current = this.future.pop(); } }
}
