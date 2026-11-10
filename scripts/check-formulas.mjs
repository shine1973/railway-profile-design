// Independent spreadsheet-engine verification; install LibreOffice or set SOFFICE.
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';import ExcelJS from 'exceljs';import JSZip from 'jszip';
import {newProject,calculate,extendControl,pickEndpoint} from '../src/core.js';import {exportWorkbook} from '../desktop/workbook.js';
const dir=await mkdtemp(path.join(os.tmpdir(),'railway-formulas-'));
try{
 const p=newProject(Array.from({length:101},(_,i)=>({id:`p${i}`,sourceRow:i+2,no:i-2,feature:'',fore:i<=20?1000:i<=70?800:900,back:i===20?800:i===70?900:null})));
 p.controls={p0:180,p50:0,p100:180};p.segments=[['p0','p50'],['p50','p100']];p.curves={p50:10000};
 const bytes=await exportWorkbook(p,{formulas:true});
 const clearCaches=async zip=>{for(const name of Object.keys(zip.files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n))){let xml=await zip.file(name).async('string');xml=xml.replace(/<c\b[^>]*>[\s\S]*?<\/c>/g,cell=>cell.includes('<f')?cell.replace(/<v>[\s\S]*?<\/v>/g,''):cell);zip.file(name,xml);}return zip.generateAsync({type:'nodebuffer'});};
 await writeFile(path.join(dir,'base.xlsx'),await clearCaches(await JSZip.loadAsync(bytes)));
 const changed=structuredClone(p);changed.points[30].fore+=35;changed.points[20].back+=10;changed.controls.p50=20;changed.sleepers=12;changed.curves.p50=20000;
 const z=await JSZip.loadAsync(bytes);
 const set=async(file,edits)=>{let xml=await z.file(file).async('string');for(const [cell,value] of Object.entries(edits)){const re=new RegExp(`(<c r="${cell}"[^>]*>[\\s\\S]*?<v>)[^<]*(</v>)`);assert.ok(re.test(xml));xml=xml.replace(re,(_,a,b)=>a+value+b);}z.file(file,xml);};
 await set('xl/worksheets/sheet1.xml',{C33:835,D23:810});await set('xl/worksheets/sheet7.xml',{B2:12,B7:20,H6:20000});
 await writeFile(path.join(dir,'changed.xlsx'),await clearCaches(z));
 const pair=structuredClone(p);pair.controls={p0:200,p20:128,p70:70,p100:178};pair.segments=[['p0','p20'],['p70','p100']];pair.curves={'p0~p20~p70~p100':10000};
 await writeFile(path.join(dir,'pair.xlsx'),await clearCaches(await JSZip.loadAsync(await exportWorkbook(pair,{formulas:true}))));
 const extended=structuredClone(p);extended.controls={p0:0,p7:2};extended.segments=[['p0','p7']];extended.curves={};extendControl(extended,'p7','p12');pickEndpoint(extended,'p100');
 await writeFile(path.join(dir,'extended.xlsx'),await clearCaches(await JSZip.loadAsync(await exportWorkbook(extended,{formulas:true}))));
 const multiple=structuredClone(p);multiple.controls={p0:180,p30:0,p60:180,p100:0};multiple.segments=[['p0','p30'],['p30','p60'],['p60','p100']];multiple.curves={p30:5000,p60:5000};
 await writeFile(path.join(dir,'multiple.xlsx'),await clearCaches(await JSZip.loadAsync(await exportWorkbook(multiple,{formulas:true}))));
 const manual=structuredClone(p);manual.controls.p50=5;
 const mz=await JSZip.loadAsync(bytes);let mx=await mz.file('xl/worksheets/sheet7.xml').async('string');
 mx=mx.replace(/(<c r="E7"[^>]*>[\s\S]*?<f[^>]*>)[^<]*(<\/f>)/,(_,a,b)=>a+'D7+B7+5'+b);
 mz.file('xl/worksheets/sheet7.xml',mx);await writeFile(path.join(dir,'manual.xlsx'),await clearCaches(mz));
 const out=path.join(dir,'out');await mkdir(out);
 const result=spawnSync(process.env.SOFFICE||'soffice',[`-env:UserInstallation=file://${dir}/profile`,'--headless','--convert-to','xlsx','--outdir',out,path.join(dir,'base.xlsx'),path.join(dir,'changed.xlsx'),path.join(dir,'pair.xlsx'),path.join(dir,'extended.xlsx'),path.join(dir,'manual.xlsx'),path.join(dir,'multiple.xlsx')],{encoding:'utf8',timeout:90000});
 assert.equal(result.status,0,result.stderr||result.error?.message);console.log(result.stdout.trim());
 for(const [name,project] of [['base',p],['changed',changed],['pair',pair],['extended',extended],['manual',manual],['multiple',multiple]]){
  const book=new ExcelJS.Workbook();await book.xlsx.load(await readFile(path.join(out,name+'.xlsx')));const sheet=book.getWorksheet('测量数据');
  for(const r of calculate(project))for(const [col,key] of [['E','instrument'],['F','measured'],['G','design'],['I','slope'],['J','increment'],['K','lift'],['H','radius']]){
   if(r[key]===null)continue;const cell=sheet.getCell(`${col}${r.index+3}`),actual=cell.result??cell.value;
   assert.equal(typeof actual,'number',`${name} ${cell.address}: ${JSON.stringify(actual)}`);
   assert.ok(Math.abs(actual-r[key])<1e-6,`${name} ${cell.address}: ${actual} != ${r[key]}`);
  }
  // Chart series still point at dynamic formula cells after both parameter and formula edits.
  const params=book.getWorksheet('参数'),offset=params.getCell('J2').result;
  for(const r of calculate(project)){
   const i=r.index+2;
   assert.ok(Math.abs(params.getCell(`F${i}`).result-r.measured-offset)<1e-6,`${name} measured chart row ${i}`);
   if(r.design!==null)assert.ok(Math.abs(params.getCell(`G${i}`).result-r.design-offset)<1e-6,`${name} design chart row ${i}`);
  }
 }
 console.log('PASS: split formulas and chart data match app after parameter edits and manual formula edits, including two adjacent curves and disconnected segments');
} finally {await rm(dir,{recursive:true,force:true});}
