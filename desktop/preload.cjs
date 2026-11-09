const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  importExcel:()=>ipcRenderer.invoke('import'),
  openProject:()=>ipcRenderer.invoke('open'),
  saveProject:project=>ipcRenderer.invoke('save',project),
  exportExcel:project=>ipcRenderer.invoke('export',project),
  setDirty:value=>ipcRenderer.send('dirty',value)
});
