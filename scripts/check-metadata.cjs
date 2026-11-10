const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const delay=()=>new Promise(resolve=>setTimeout(resolve,50));
app.whenReady().then(async()=>{
 try{
  const {exportWorkbook}=await import('../desktop/workbook.js');
  const ExcelJS=(await import('exceljs')).default;
  const exports=[];let saved;
  ipcMain.on('dirty',()=>{});
  ipcMain.handle('export',async(event,project,options)=>{
   const book=new ExcelJS.Workbook();await book.xlsx.load(await exportWorkbook(project,options));
   const sheet=book.getWorksheet('测量数据');
   assert.equal(sheet.getCell('B1').value,project.measurementDate);
   assert.equal(sheet.getCell('F1').value,project.measurementLocation);
   assert.equal(sheet.getCell('H2').value,'竖曲线半径（m）');
   assert.equal(sheet.getCell('I2').value,'坡度');
   assert.equal(sheet.views[0].ySplit,2);
   exports.push({project,options});return {ok:true,value:'/tmp/metadata-test.xlsx'};
  });
  ipcMain.handle('save',async(event,project)=>{saved=JSON.parse(JSON.stringify(project));return {ok:true,value:'/tmp/metadata-test.railway'};});
  ipcMain.handle('open',async()=>({ok:true,value:{project:saved,file:'/tmp/metadata-test.railway'}}));
  const w=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),sandbox:true,contextIsolation:true}});
  await w.loadFile(path.join(__dirname,'../src/index.html'));
  const js=code=>w.webContents.executeJavaScript(code);
  const waitFor=async(condition)=>{for(let n=0;n<100;n++){if(await condition())return;await delay();}throw Error('metadata operation timed out');};
  await js(`document.getElementById('demo').click()`);await delay();
  // A render before blur must preserve the location draft.
  await js(`var place=document.getElementById('measurementLocation');place.focus();place.value='演示站9道';place.dispatchEvent(new Event('input'));document.getElementById('clear').click();`);
  assert.equal(await js(`document.getElementById('measurementLocation').value`),'演示站9道');
  // Commit the date and the still-uncommitted location in one transaction.
  await js(`var date=document.getElementById('measurementDate');date.value='2026-11-10';date.dispatchEvent(new Event('input'));date.dispatchEvent(new Event('change'));`);
  for(const mode of ['formulas','values']){
   const count=exports.length;
   await js(`document.getElementById('exportMode').value='${mode}';var place=document.getElementById('measurementLocation');place.focus();place.value='演示站9道-${mode}';place.dispatchEvent(new Event('input'));document.getElementById('export').click();`);
   await waitFor(()=>exports.length===count+1);await delay();
   assert.equal(exports.at(-1).project.measurementLocation,`演示站9道-${mode}`);
   assert.equal(exports.at(-1).project.measurementDate,'2026-11-10');
  }
  await js(`var place=document.getElementById('measurementLocation');place.value='未失焦直接保存';place.dispatchEvent(new Event('input'));document.getElementById('save').click();`);
  await waitFor(()=>Boolean(saved));await delay();
  assert.equal(saved.measurementLocation,'未失焦直接保存');
  await js(`document.getElementById('open').click()`);await delay();
  assert.equal(await js(`document.getElementById('measurementLocation').value`),'未失焦直接保存');
  console.log('PASS: metadata draft survives render, direct export/save captures active input, numeric/formula Excel top row and header order, project reopen');
  app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
