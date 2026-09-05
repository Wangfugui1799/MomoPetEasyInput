const {app,BrowserWindow,ipcMain,dialog,Menu}=require('electron');
const path=require('node:path');let server,win;
const {sameOrigin,allowSerial}=require('./serial-policy.cjs');
app.setName('Momo');
if(!app.requestSingleInstanceLock()){app.quit();process.exit(0)}
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus()}});
async function createWindow(){
  win=new BrowserWindow({width:1280,height:950,minWidth:850,minHeight:720,title:'Momo · 你的桌面小伙伴',backgroundColor:'#f8f9f4',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  const ses=win.webContents.session,origin=server.url;
  ses.setPermissionCheckHandler((contents,permission,requestingOrigin)=>allowSerial(contents,permission,requestingOrigin,win.webContents.id,origin));
  ses.setPermissionRequestHandler((contents,permission,callback)=>callback(permission==='serial'&&contents===win.webContents&&contents.getURL().startsWith(origin+'/')));
  ses.removeAllListeners('select-serial-port');
  ses.on('select-serial-port',async(event,ports,contents,callback)=>{
    event.preventDefault();if(contents?.id!==win.webContents.id||!sameOrigin(contents.getURL(),origin)){callback('');return}
    if(!ports.length){callback('');await dialog.showMessageBox(win,{type:'info',message:'没有找到串口设备',detail:'请用数据线连接 EasyInput。Momo 需要本项目配套固件。'});return}
    const {response}=await dialog.showMessageBox(win,{title:'连接 EasyInput',message:'选择运行 Momo 固件的键盘',detail:'连接只读取按键事件。应用会先验证 Momo 固件握手。',buttons:[...ports.map(p=>`${p.displayName||p.portName} (${p.portName})`),'取消'],cancelId:ports.length,defaultId:ports.length,noLink:true});callback(ports[response]?.portId||'');
  });
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith(origin+'/'))e.preventDefault()});
  await win.loadURL(origin);
}
app.whenReady().then(async()=>{const {startServer}=await import('../server.mjs');try{server=await startServer({port:4784})}catch{dialog.showErrorBox('Momo 暂时无法启动','本机端口 4784 已被占用。请关闭其他 Momo 实例后重试。');app.quit();return}ipcMain.handle('momo:always-top',(e,value)=>{if(e.sender!==win.webContents||typeof value!=='boolean')throw Error('Invalid request');win.setAlwaysOnTop(value);return value});Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Momo',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'quit'}]},{label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'窗口',submenu:[{role:'minimize'},{role:'zoom'}]}]));await createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow()})});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>server?.server.close());
