import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRows,newProject,calculate,validateProject,History,format,moveControl,pickEndpoint,removeSegment,cancelPending} from '../src/core.js';
const head=['特征点','点号','前视读数','后视读数'];
function fixture(){return newProject(parseRows([head,['',-2,1200,null],['',-2,1250,800],['岔心',5,830,null],['',6,850,null]]));}
test('独立两点配对，不继承上一段末点，支持反选、共享端点、取消与删除',()=>{
  const p=newProject(Array.from({length:10},(_,i)=>({id:`p${i}`,no:0,sourceRow:i+2,feature:'',fore:500+i,back:null})));
  pickEndpoint(p,'p0');assert.ok(calculate(p).every(r=>r.design===null));
  pickEndpoint(p,'p2');pickEndpoint(p,'p7');
  assert.equal(calculate(p)[7].design,null);
  pickEndpoint(p,'p9');let r=calculate(p);
  assert.deepEqual(p.segments,[['p0','p2'],['p7','p9']]);assert.ok(r.slice(3,7).every(r=>r.design===null&&r.lift===null&&r.slope===null));assert.equal(r[2].slope,null);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  pickEndpoint(p,'p6');pickEndpoint(p,'p4');assert.notEqual(calculate(p)[5].design,null);
  pickEndpoint(p,'p2');pickEndpoint(p,'p4');assert.notEqual(calculate(p)[3].design,null);
  pickEndpoint(p,'p1');assert.throws(()=>pickEndpoint(p,'p5'),/重叠/);cancelPending(p);assert.ok(!Object.hasOwn(p.controls,'p1'));
  removeSegment(p,3);assert.equal(calculate(p)[3].design,null);
  const before=structuredClone(p);assert.equal(moveControl(p,'p2','p5'),false);assert.deepEqual(p,before);
});
test('旧版项目显式迁移原有连续坡段，不改变旧设计；新版孤立控制点校验',()=>{
  const raw={...fixture(),version:1,controls:{p2:0,p3:5,p5:0}};delete raw.segments;delete raw.pendingControl;
  const migrated=validateProject(raw);
  assert.equal(migrated.version,3);assert.deepEqual(migrated.segments,[['p2','p3'],['p3','p5']]);
  assert.deepEqual(calculate(migrated),calculate(raw));
  assert.throws(()=>validateProject({...fixture(),controls:{p2:0}}),/未关联坡段/);
});
test('移动控制点保留起道量、重复点号用记录标识、占用不覆盖、可撤销及保存',()=>{
  const p=fixture();p.controls={p2:-5,p5:20};p.segments=[['p2','p5']];const h=new History(p),next=structuredClone(p);
  assert.equal(moveControl(next,'p2','p3'),true);assert.deepEqual(next.controls,{p3:-5,p5:20});
  assert.deepEqual(next.points,p.points);assert.equal(calculate(next)[1].lift,-5);
  h.change(next);h.undo();assert.deepEqual(h.current,p);h.redo();assert.deepEqual(validateProject(JSON.parse(JSON.stringify(h.current))),next);
  for(const id of ['p5','p3','missing'])assert.equal(moveControl(next,'p3',id),false);
  assert.deepEqual(next.controls,{p3:-5,p5:20});
  assert.equal(moveControl(next,'p3','p2'),true);assert.deepEqual(next.controls,p.controls);
});
test('统一假定高程与仪器高：多次转站、读数修改、旧项目重开',()=>{
  const p=fixture();p.points[2].back=400;p.points[3].fore=6000;p.controls={p2:0,p5:-20};p.segments=[['p2','p5']];
  for(const project of [p,validateProject(JSON.parse(JSON.stringify(p)))]) {
    const rows=calculate(project);
    assert.ok(rows.every(r=>r.measured>=10));
    assert.equal(Math.min(...rows.map(r=>r.measured)),10);
    rows.forEach((r,i)=>{
      assert.equal(r.measured,r.instrument-r.fore);
      if(i)assert.equal(r.instrument,rows[i-1].back===null?rows[i-1].instrument:rows[i-1].measured+rows[i-1].back);
    });
    assert.equal(rows.at(-1).lift,-20);
  }
  p.points[3].fore+=10000;
  assert.ok(calculate(p).every(r=>r.measured>=10));
});
test('转站、重复点号、固定距离及零后视',()=>{
  const p=fixture(),r=calculate(p);
  assert.deepEqual(r.map(p=>p.measured),[110,60,30,10]);
  r.forEach((r,i)=>assert.ok(Math.abs(r.distance-i*3.6)<1e-10));
  p.points[1].back=0;assert.equal(calculate(p)[2].measured-calculate(p)[0].measured,-880);
});
test('表头换序、空行、旧结果忽略，错误保留原行号',()=>{
  const rows=[['特征点','后视读数','点号','前视读数','设计高程'],['',null,0,1000,999],[],['x',null,0,1010,123]];
  assert.equal(parseRows(rows).length,2);assert.equal(parseRows(rows)[1].sourceRow,4);
  assert.throws(()=>parseRows([head,['',1,'错',null],['',2,1.5,null]]),/第 2 行[\s\S]*第 3 行/);
  assert.throws(()=>parseRows([head,['有内容',null,null,null]]),/不能为空/);
});
test('分段设计、末点留空、首末范围之外未设计',()=>{
  const p=fixture();p.controls={p3:20,p4:0};p.segments=[['p3','p4']];const r=calculate(p);
  assert.equal(r[0].design,null);assert.equal(r[3].design,null);
  assert.equal(r[1].design,80);assert.equal(r[2].design,30);
  assert.ok(Math.abs(r[1].slope-(-50/3.6))<1e-10);assert.equal(r[2].slope,null);
  p.controls.p5=-5;p.segments.push(['p4','p5']);const r2=calculate(p);assert.equal(r2[2].increment,-25);assert.equal(r2[3].lift,-5);assert.equal(r2[3].slope,null);
});
test('改读数保留控制点起道设置，不累计舍入；改变间距仅改变坡度',()=>{
  const p=fixture();p.controls={p2:1,p5:3};p.segments=[['p2','p5']];const before=calculate(p);
  assert.ok(Math.abs(before[1].design-(111+(-97-1)/3))<1e-10);
  p.points[2].fore+=10;assert.equal(calculate(p)[3].lift,3);
  p.sleepers=12;const r=calculate(p);assert.equal(r[0].slope,before[0].slope/2);
});
test('不足两个点、撤销清除、项目往返校验',()=>{
  const p=fixture();p.controls={p2:-5};p.pendingControl='p2';assert.ok(calculate(p).every(r=>r.design===null));
  p.controls.p5=0;p.pendingControl=null;p.segments=[['p2','p5']];const h=new History(p);h.change({...p,controls:{}});h.undo();assert.deepEqual(h.current.controls,p.controls);h.redo();assert.deepEqual(h.current.controls,{});
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  assert.throws(()=>validateProject({...p,controls:{wrong:0}}),/不存在/);
  assert.throws(()=>validateProject({...p,points:[p.points[0],p.points[0]]}),/重复/);
});
test('四舍五入及极小负数保留负号',()=>{assert.equal(format(-1.5),'-2');assert.equal(format(-.2),'−0');assert.equal(format(2/3,1),'0.7');});
