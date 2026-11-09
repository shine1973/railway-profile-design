const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  exportTemplate:()=>ipcRenderer.invoke('template'),
  importExcel:()=>ipcRenderer.invoke('import'),
  openProject:()=>ipcRenderer.invoke('open'),
  saveProject:project=>ipcRenderer.invoke('save',project),
  exportExcel:project=>ipcRenderer.invoke('export',project),
  setDirty:value=>ipcRenderer.send('dirty',value)
});
