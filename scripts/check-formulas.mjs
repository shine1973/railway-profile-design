// Independent spreadsheet-engine verification; install LibreOffice or set SOFFICE.
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';import ExcelJS from 'exceljs';import JSZip from 'jszip';
import {newProject,calculate} from '../src/core.js';import {exportWorkbook} from '../desktop/workbook.js';
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
 await set('xl/worksheets/sheet1.xml',{C32:835,D22:810});await set('xl/worksheets/sheet2.xml',{D2:12,D7:20});await set('xl/worksheets/sheet4.xml',{B2:20000});
 await writeFile(path.join(dir,'changed.xlsx'),await clearCaches(z));
 const pair=structuredClone(p);pair.controls={p0:200,p20:128,p70:70,p100:178};pair.segments=[['p0','p20'],['p70','p100']];pair.curves={'p0~p20~p70~p100':10000};
 await writeFile(path.join(dir,'pair.xlsx'),await clearCaches(await JSZip.loadAsync(await exportWorkbook(pair,{formulas:true}))));
 const out=path.join(dir,'out');await mkdir(out);
 const result=spawnSync(process.env.SOFFICE||'soffice',[`-env:UserInstallation=file://${dir}/profile`,'--headless','--convert-to','xlsx','--outdir',out,path.join(dir,'base.xlsx'),path.join(dir,'changed.xlsx'),path.join(dir,'pair.xlsx')],{encoding:'utf8',timeout:90000});
 assert.equal(result.status,0,result.stderr||result.error?.message);console.log(result.stdout.trim());
 for(const [name,project] of [['base',p],['changed',changed],['pair',pair]]){
  const book=new ExcelJS.Workbook();await book.xlsx.load(await readFile(path.join(out,name+'.xlsx')));const sheet=book.getWorksheet('测量数据');
  for(const r of calculate(project))for(const [col,key] of [['E','instrument'],['F','measured'],['G','design'],['H','slope'],['I','increment'],['J','lift'],['K','radius']]){
   if(r[key]===null)continue;const cell=sheet.getCell(`${col}${r.index+2}`),actual=cell.result??cell.value;
   assert.equal(typeof actual,'number',`${name} ${cell.address}: ${JSON.stringify(actual)}`);
   assert.ok(Math.abs(actual-r[key])<1e-6,`${name} ${cell.address}: ${actual} != ${r[key]}`);
  }
 }
 console.log('PASS: spreadsheet engine recalculation matches app for all seven result columns including radius, before and after raw readings, backsight, lift, spacing and radius edits');
} finally {await rm(dir,{recursive:true,force:true});}
