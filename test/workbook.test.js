import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {importWorkbook,exportWorkbook} from '../desktop/workbook.js';
import {calculate,newProject,parseRows} from '../src/core.js';
test('导出九列、原始数据、负值样式、真实可编辑散点图与空段',async()=>{
  const p=newProject(parseRows([['特征点','点号','前视读数','后视读数'],['<岔心>',0,1200,null],['',0,1220,null],['',2,1240,null],['',3,1250,null]]));
  p.controls={p3:-5,p4:0};const buffer=await exportWorkbook(p);
  const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);const s=book.getWorksheet('测量数据');
  assert.equal(s.getCell('F2').value,'未设计');assert.equal(s.getCell('I3').value,-5);assert.equal(s.getCell('I3').font.color.argb,'FFDC3545');assert.equal(s.getCell('G4').value,null);assert.equal(s.getCell('G3').numFmt,'0.0');assert.equal(s.getCell('A2').value,'<岔心>');
  const zip=await JSZip.loadAsync(buffer),chart=await zip.file('xl/charts/chart1.xml').async('string');
  assert.match(chart,/<c:scatterChart>/);assert.match(chart,/'测量数据'|&apos;测量数据&apos;/);assert.match(chart,/<c:dispBlanksAs val="gap"/);
  assert.match(await zip.file('xl/worksheets/sheet1.xml').async('string'),/<drawing r:id="rId1"/);
  const imported=await importWorkbook(buffer,'test');assert.deepEqual(imported.points.map(p=>p.no),[0,0,2,3]);
});
const sample=process.env.SURVEY_SAMPLE;
test('用户提供的实测表：逐点对照参考高程，统一到首点0',{skip:!sample},async()=>{
  const buffer=await fs.readFile(sample),p=await importWorkbook(buffer,'现场样表');
  const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);const sheet=book.worksheets[0],baseline=sheet.getCell('F2').value;
  const result=calculate(p);assert.equal(result.length,89);
  result.forEach(r=>assert.equal(r.measured,sheet.getCell(`F${r.sourceRow}`).value-baseline,`行 ${r.sourceRow}`));
});
