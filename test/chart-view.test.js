import test from 'node:test';
import assert from 'node:assert/strict';
import {fullView,clampView,zoomView,displayOffset,elevationAxis,sequenceTicks} from '../src/chart-view.js';
import {calculate,newProject} from '../src/core.js';

test('坐标加密随可用空间适配，数字留距且放大后显示每个序号',()=>{
  const view=fullView(89),wide=sequenceTicks(view,89,800),narrow=sequenceTicks(view,89,400);
  assert.ok(wide.length>=16);assert.ok(wide.length>narrow.length);
  for(const width of [400,800,1400]) {
    const ticks=sequenceTicks(view,89,width);
    for(let i=1;i<ticks.length;i++)assert.ok((ticks[i]-ticks[i-1])/89*width>=36);
  }
  assert.deepEqual(sequenceTicks({min:20.5,max:30.5},89,800),[21,22,23,24,25,26,27,28,29,30]);
  const axis=elevationAxis([100,300]);
  assert.ok(axis.ticks.length>=10);assert.ok(axis.ticks.every(v=>v>=0&&v%5===0));
  assert.ok(elevationAxis([100,300],500).ticks.length>axis.ticks.length);
});

test('全区段统一正高程基准，起道量和高差不变',()=>{
  const p=newProject([{id:'p1',no:-2,fore:1200,back:null},{id:'p2',no:-2,fore:1600,back:null}]);
  p.controls={p1:0,p2:-200};const rows=calculate(p),offset=displayOffset(rows,p.controls);
  assert.equal(offset,300);
  for(const r of rows){assert.ok(r.measured+offset>=0);assert.ok(r.design+offset>=0);assert.equal((r.design+offset)-(r.measured+offset),r.lift);}
  const a=elevationAxis(rows.flatMap(r=>[r.measured+offset,r.design+offset]));
  assert.ok(a.min>=0);assert.ok(a.max>=710);assert.ok(a.ticks.every(t=>t%5===0));
});
test('纵轴平线/小范围/大范围刻度均规整，覆盖所有数据',()=>{
  for(const values of [[100,100],[105,108],[100,50000]]){
    const a=elevationAxis(values);assert.ok(a.min>=0);assert.ok(a.min<=Math.min(...values));assert.ok(a.max>=Math.max(...values));assert.ok(a.step>=5);assert.ok(a.ticks.every(t=>t%5===0));
  }
});
test('连续滚轮支持多档细微缩放，指针锚点稳定',()=>{
  const initial=fullView(89),a=zoomView(initial,89,.5,-1),b=zoomView(a,89,.5,-1),c=zoomView(initial,89,.5,-80);
  assert.ok(b.max-b.min<a.max-a.min);assert.ok(c.max-c.min<b.max-b.min);assert.equal((a.min+a.max)/2,45);
  assert.ok(zoomView(initial,89,.5,-80,2).max-zoomView(initial,89,.5,-80,2).min<c.max-c.min);
});
test('平移限制边界，横轴使用整数记录序号',()=>{
  assert.deepEqual(clampView({min:-10,max:10},89),{min:.5,max:20.5});
  assert.deepEqual(clampView({min:85,max:105},89),{min:69.5,max:89.5});
  const ticks=sequenceTicks({min:22.3,max:30.7},89);assert.ok(ticks.every(n=>Number.isInteger(n)&&n>=23&&n<=30));
  assert.deepEqual(zoomView(fullView(1),1,.5,-200),fullView(1));
});
