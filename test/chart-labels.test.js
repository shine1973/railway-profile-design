import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutLabels} from '../src/chart-labels.js';
const measure=s=>Array.from(s).length*11;
test('左右端点完整向内摆放，不越过图表边缘',()=>{
  const l=layoutLabels([{x:62,text:'起点完整名称'},{x:500,text:'终点完整名称'}],62,500,measure);
  for(const b of l.labels){assert.ok(b.x>=62);assert.ok(b.x+b.width<=500);assert.equal(b.lines.join(''),b.text);}
});
test('密集标签全部保留且两两不重叠，按需扩展标注区',()=>{
  const items=Array.from({length:25},(_,i)=>({x:250+i,text:`岔心特征点${i}`}));
  const result=layoutLabels(items,62,500,measure);assert.equal(result.labels.length,25);
  for(const a of result.labels)for(const b of result.labels)if(a!==b)assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);
  assert.ok(result.height>100);
});
test('超长名称自动换行不省略，窄图仍留在边界内',()=>{
  const text='非常长的特征点名称'.repeat(12),result=layoutLabels([{x:100,text}],62,200,measure),label=result.labels[0];
  assert.equal(label.lines.join(''),text);assert.ok(label.lines.length>1);assert.ok(label.x+label.width<=200);
  assert.deepEqual(layoutLabels([],62,500,measure),{height:0,labels:[]});
});
