const {BrowserWindow}=require('electron');
const path=require('node:path');
let manualWindow;
async function openManual(parent) {
  if(manualWindow&&!manualWindow.isDestroyed()){
    if(manualWindow.isMinimized())manualWindow.restore();
    manualWindow.show();manualWindow.focus();return;
  }
  manualWindow=new BrowserWindow({width:1080,height:850,minWidth:720,minHeight:560,parent,show:false,title:'线路拉坡 · 使用手册',backgroundColor:'#f2f4f7',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const current=manualWindow;
  current.setMenuBarVisibility(false);
  current.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  current.webContents.on('will-navigate',event=>event.preventDefault());
  current.on('closed',()=>{if(manualWindow===current)manualWindow=null;});
  try{await current.loadFile(path.join(__dirname,'../src/manual/index.html'));if(!current.isDestroyed())current.show();}
  catch(error){if(!current.isDestroyed())current.close();throw error;}
}
module.exports={openManual};
