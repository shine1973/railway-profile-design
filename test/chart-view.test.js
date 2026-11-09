import test from 'node:test';
import assert from 'node:assert/strict';
import {fullView,clampView,zoomView,displayOffset,elevationAxis,sequenceTicks} from '../src/chart-view.js';
import {calculate,newProject} from '../src/core.js';

test('全区段统一正高程基准，起道量和高差不变',()=>{
  const p=newProject([{id:'p1',no:-2,fore:1200,back:null},{id:'p2',no:-2,fore:1600,back:null}]);
  p.controls={p1:0,p2:-200};const rows=calculate(p),offset=displayOffset(rows,p.controls);
  assert.equal(offset,700);
  for(const r of rows){assert.ok(r.measured+offset>=0);assert.ok(r.design+offset>=0);assert.equal((r.design+offset)-(r.measured+offset),r.lift);}
  const a=elevationAxis(rows.flatMap(r=>[r.measured+offset,r.design+offset]));
  assert.ok(a.min>=0);assert.ok(a.max>=700);assert.ok(a.ticks.every(t=>t%5===0));
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
