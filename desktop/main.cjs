const {app, BrowserWindow, ipcMain, dialog, Menu} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
let win, dirty = false;
const core = () => import('../src/core.js');
const workbook = () => import('./workbook.js');
const respond = fn => async (_event, ...args) => {try{return {ok:true,value:await fn(...args)};}catch(e){return {ok:false,error:e.message};}};
async function atomicWrite(file, content) {
  const temp = `${file}.${process.pid}.tmp`;
  try {await fs.writeFile(temp, content);await fs.rename(temp,file);} finally {await fs.rm(temp,{force:true}).catch(()=>{});}
}
async function createWindow() {
  win=new BrowserWindow({width:1440,height:960,minWidth:1000,minHeight:720,backgroundColor:'#edf2f4',title:'线路拉坡',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.on('close',e=>{if(dirty){const choice=dialog.showMessageBoxSync(win,{type:'question',buttons:['返回保存','放弃未保存更改'],defaultId:0,cancelId:0,message:'项目有未保存的更改',detail:'请先保存项目，或选择放弃更改后退出。'});if(choice===0)e.preventDefault();}});
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'线路拉坡',submenu:[{role:'about'},{type:'separator'},{role:'quit'}]},{label:'编辑',submenu:[{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'视图',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}]));
  await win.loadFile(path.join(__dirname,'../src/index.html'));
}
ipcMain.on('dirty',(_e,value)=>{dirty=Boolean(value);if(win)win.setDocumentEdited(dirty);});
ipcMain.handle('import',respond(async()=>{
  const r=await dialog.showOpenDialog(win,{title:'导入测量 Excel',filters:[{name:'Excel 工作簿',extensions:['xlsx']}],properties:['openFile']});
  if(r.canceled)return null;
  if((await fs.stat(r.filePaths[0])).size>30*1024*1024)throw new Error('文件超过 30 MB，请仅保留测量工作表后导入');
  return (await workbook()).importWorkbook(await fs.readFile(r.filePaths[0]),path.basename(r.filePaths[0],'.xlsx'));
}));
ipcMain.handle('open',respond(async()=>{
  const r=await dialog.showOpenDialog(win,{title:'打开拉坡项目',filters:[{name:'线路拉坡项目',extensions:['railproj']}],properties:['openFile']});
  if(r.canceled)return null;
  if((await fs.stat(r.filePaths[0])).size>30*1024*1024)throw new Error('项目文件过大');
  return {project:(await core()).validateProject(JSON.parse(await fs.readFile(r.filePaths[0],'utf8'))),file:r.filePaths[0]};
}));
ipcMain.handle('save',respond(async(raw)=>{
  const project=(await core()).validateProject(raw);
  const r=await dialog.showSaveDialog(win,{title:'保存项目',defaultPath:`${project.name.replace(/[\\/:*?"<>|]/g,'_')}.railproj`,filters:[{name:'线路拉坡项目',extensions:['railproj']}]});
  if(r.canceled)return null;
  await atomicWrite(r.filePath,JSON.stringify(project,null,2));return r.filePath;
}));
ipcMain.handle('export',respond(async(raw)=>{
  const project=(await core()).validateProject(raw);
  const r=await dialog.showSaveDialog(win,{title:'导出 Excel 成果',defaultPath:`${project.name.replace(/[\\/:*?"<>|]/g,'_')}-拉坡成果.xlsx`,filters:[{name:'Excel 工作簿',extensions:['xlsx']}]});
  if(r.canceled)return null;
  await atomicWrite(r.filePath,await (await workbook()).exportWorkbook(project));return r.filePath;
}));
ipcMain.handle('template',respond(async()=>{
  const r=await dialog.showSaveDialog(win,{title:'导出示例模板',defaultPath:'测量数据填写模板.xlsx',filters:[{name:'Excel 工作簿',extensions:['xlsx']}]});
  if(r.canceled)return null;
  await atomicWrite(r.filePath,await (await workbook()).exportTemplate());return r.filePath;
}));
app.whenReady().then(createWindow);
app.on('window-all-closed',()=>app.quit());
