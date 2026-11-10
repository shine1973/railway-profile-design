import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {newProject,calculate,validateProject,moveControl,removeSegment} from '../src/core.js';
import {curveGeometry,curveHeight} from '../src/vertical-curves.js';
import {exportWorkbook} from '../desktop/workbook.js';
export function curveFixture(sign=1){
  const p=newProject(Array.from({length:101},(_,i)=>({id:`p${i}`,sourceRow:i+2,no:i-2,feature:i===50?'变坡点':'',fore:1000,back:null})));
  p.controls={p0:sign*180,p50:0,p100:sign*180};p.segments=[['p0','p50'],['p50','p100']];p.curves={p50:10000};p.lineType='到发线';p.speed=80;
  return p;
}
test('圆曲线凸凹两向：独立圆方程、相切、起道量和逐点递增一致',()=>{
  for(const sign of [1,-1]){
    const p=curveFixture(sign),rows=calculate(p),{curves,issues}=curveGeometry(p,rows),c=curves[0];assert.deepEqual(issues,[]);
    const expected=10+sign*10000*(Math.sqrt(1+.001**2)-1)*1000;
    assert.ok(Math.abs(rows[50].design-expected)<1e-6);
    const eps=1e-4;
    assert.ok(Math.abs((curveHeight(c,c.start+eps)-curveHeight(c,c.start))/eps/1000-c.m1)<1e-7);
    assert.ok(Math.abs((curveHeight(c,c.end)-curveHeight(c,c.end-eps))/eps/1000-c.m2)<1e-7);
    rows.slice(0,-1).forEach((r,i)=>{assert.ok(Math.abs(r.increment-(rows[i+1].design-r.design))<1e-10);assert.ok(Math.abs(r.lift-(r.design-r.measured))<1e-10);});
    assert.equal(rows.at(-1).slope,null);
    assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  }
});
test('半径越界阻止导出，删除坡段清理竖曲线，拖动带走参数',async()=>{
  const p=curveFixture();p.curves.p50=1000000;
  assert.match(curveGeometry(p,calculate(p)).issues.join(),/超出/);
  await assert.rejects(exportWorkbook(p),/超出/);
  p.curves.p50=10000;assert.ok(moveControl(p,'p50','p51'));assert.equal(p.curves.p51,10000);assert.equal(p.curves.p50,undefined);
  removeSegment(p,0);assert.deepEqual(p.curves,{});
});
test('公式导出含完整计算链、缓存、动态负值、版本迁移和曲线参数',async()=>{
  const p=curveFixture();p.points[20].back=800;p.points[70].back=900;
  // Keep slopes moderate after stations change.
  p.points.forEach((r,i)=>{r.fore=i<=20?1000:i<=70?800:900;});
  const bytes=await exportWorkbook(p,{formulas:true,labelLift:true});const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
  const sheet=book.getWorksheet('测量数据'),rows=calculate(p);
  rows.forEach((r,i)=>{for(const [col,key] of [['E','instrument'],['F','measured'],['G','design'],['J','lift']]){assert.ok(sheet.getCell(`${col}${i+2}`).formula);assert.equal(sheet.getCell(`${col}${i+2}`).result,r[key]);}});
  assert.ok(book.getWorksheet('竖曲线参数').getCell('P2').formula);
  const zip=await JSZip.loadAsync(bytes),chart=await zip.file('xl/charts/chart1.xml').async('string');
  assert.match(chart,/计算过程/);assert.match(chart,/strRef/);assert.equal(sheet.autoFilter,undefined);
  const old={...p,version:2};delete old.curves;assert.deepEqual(validateProject(old).curves,{});
});
test('独立前后坡段延长线交点位于测点之间：仅显式连接、精确曲线范围和半径列',async()=>{
 const p=curveFixture();p.controls={p0:200,p20:128,p70:70,p100:178};p.segments=[['p0','p20'],['p70','p100']];p.curves={};
 assert.equal(calculate(p)[50].design,null);
 const key='p0~p20~p70~p100';p.curves[key]=10000;
 const rows=calculate(p),g=curveGeometry(p,rows);assert.deepEqual(g.issues,[]);assert.ok(Math.abs(g.curves[0].x-191)<1e-8);
 assert.ok(Math.abs(g.curves[0].x/3.6-Math.round(g.curves[0].x/3.6))>.01);
 assert.notEqual(rows[40].design,null);assert.equal(rows[40].radius,null);assert.equal(rows[53].radius,10000);assert.ok(Math.abs(rows[20].slope+1)<1e-10);
 const book=new ExcelJS.Workbook();const bytes=await exportWorkbook(p,{formulas:true});await book.xlsx.load(bytes);
 assert.equal(book.getWorksheet('测量数据').getCell('K55').result,10000);
 const z=await JSZip.loadAsync(bytes);assert.match(await z.file('xl/charts/chart1.xml').async('string'),/竖曲线起点 1/);
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
 assert.ok(moveControl(p,'p20','p21'));assert.ok(p.curves['p0~p21~p70~p100']);
 removeSegment(p,0);assert.deepEqual(p.curves,{});assert.equal(calculate(p)[50].design,null);
});
test('连续两处竖曲线不覆盖前一处已计算弧段，平行坡线拒绝导出',async()=>{
 const p=curveFixture();p.controls={p0:180,p30:0,p60:180,p100:0};p.segments=[['p0','p30'],['p30','p60'],['p60','p100']];p.curves={p30:5000};const before=calculate(p);
 p.curves.p60=5000;const after=calculate(p);assert.deepEqual(curveGeometry(p,after).issues,[]);for(const i of [29,30,31])assert.ok(Math.abs(before[i].design-after[i].design)<1e-9);
 p.controls={p0:0,p30:0,p60:0,p100:0};await assert.rejects(exportWorkbook(p),/平行/);
});
