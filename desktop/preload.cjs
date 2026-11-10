const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  openManual:()=>ipcRenderer.invoke('manual'),
  exportTemplate:()=>ipcRenderer.invoke('template'),
  importExcel:()=>ipcRenderer.invoke('import'),
  openProject:()=>ipcRenderer.invoke('open'),
  saveProject:project=>ipcRenderer.invoke('save',project),
  exportExcel:(project,options)=>ipcRenderer.invoke('export',project,options),
  setDirty:value=>ipcRenderer.send('dirty',value)
});
