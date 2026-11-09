import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRows,newProject,calculate,validateProject,History,format} from '../src/core.js';
const head=['特征点','点号','前视读数','后视读数'];
function fixture(){return newProject(parseRows([head,['',-2,1200,null],['',-2,1250,800],['岔心',5,830,null],['',6,850,null]]));}
test('转站、重复点号、固定距离及零后视',()=>{
  const p=fixture(),r=calculate(p);
  assert.deepEqual(r.map(p=>p.measured),[0,-50,-80,-100]);
  r.forEach((r,i)=>assert.ok(Math.abs(r.distance-i*3.6)<1e-10));
  p.points[1].back=0;assert.equal(calculate(p)[2].measured,-880);
});
test('表头换序、空行、旧结果忽略，错误保留原行号',()=>{
  const rows=[['特征点','后视读数','点号','前视读数','设计高程'],['',null,0,1000,999],[],['x',null,0,1010,123]];
  assert.equal(parseRows(rows).length,2);assert.equal(parseRows(rows)[1].sourceRow,4);
  assert.throws(()=>parseRows([head,['',1,'错',null],['',2,1.5,null]]),/第 2 行[\s\S]*第 3 行/);
  assert.throws(()=>parseRows([head,['有内容',null,null,null]]),/不能为空/);
});
test('分段设计、末点留空、首末范围之外未设计',()=>{
  const p=fixture();p.controls={p3:20,p4:0};const r=calculate(p);
  assert.equal(r[0].design,null);assert.equal(r[3].design,null);
  assert.equal(r[1].design,-30);assert.equal(r[2].design,-80);
  assert.ok(Math.abs(r[1].slope-(-50/3.6))<1e-10);assert.equal(r[2].slope,null);
  p.controls.p5=-5;const r2=calculate(p);assert.equal(r2[2].increment,-25);assert.equal(r2[3].lift,-5);assert.equal(r2[3].slope,null);
});
test('改读数保留控制点起道设置，不累计舍入；改变间距仅改变坡度',()=>{
  const p=fixture();p.controls={p2:1,p5:3};const before=calculate(p);
  assert.ok(Math.abs(before[1].design-(1+(-97-1)/3))<1e-10);
  p.points[2].fore+=10;assert.equal(calculate(p)[3].lift,3);
  p.sleepers=12;const r=calculate(p);assert.equal(r[0].slope,before[0].slope/2);
});
test('不足两个点、撤销清除、项目往返校验',()=>{
  const p=fixture();p.controls={p2:-5};assert.ok(calculate(p).every(r=>r.design===null));
  p.controls.p5=0;const h=new History(p);h.change({...p,controls:{}});h.undo();assert.deepEqual(h.current.controls,p.controls);h.redo();assert.deepEqual(h.current.controls,{});
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  assert.throws(()=>validateProject({...p,controls:{wrong:0}}),/不存在/);
  assert.throws(()=>validateProject({...p,points:[p.points[0],p.points[0]]}),/重复/);
});
test('四舍五入及极小负数保留负号',()=>{assert.equal(format(-1.5),'-2');assert.equal(format(-.2),'−0');assert.equal(format(2/3,1),'0.7');});
