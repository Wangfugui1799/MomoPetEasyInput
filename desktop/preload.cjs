const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('momoDesktop',{
  setAlwaysOnTop:value=>ipcRenderer.invoke('momo:always-top',value),
  wireless:(action,value)=>ipcRenderer.invoke('momo:wireless',action,value),
  onWireless:callback=>{const listener=(_event,kind,value)=>callback(kind,value);ipcRenderer.on('momo:wireless-event',listener);return ()=>ipcRenderer.removeListener('momo:wireless-event',listener)},
});
