const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('momoDesktop',{setAlwaysOnTop:value=>ipcRenderer.invoke('momo:always-top',value)});
