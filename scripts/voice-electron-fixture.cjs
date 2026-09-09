// Isolated integration-test host: production renderer, server and media policy.
const {app,BrowserWindow}=require('electron');
const {mkdtempSync}=require('node:fs');const {tmpdir}=require('node:os');const path=require('node:path');
const {allowMicrophone}=require('../desktop/media-policy.cjs');
app.setPath('userData',mkdtempSync(path.join(tmpdir(),'momo-voice-electron-')));
app.whenReady().then(async()=>{
 const {startServer}=await import('../server.mjs');const server=await startServer({port:0});
 const win=new BrowserWindow({width:1280,height:950,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
 const origin=server.url,ses=win.webContents.session;
 ses.setPermissionCheckHandler((wc,p,o,d)=>allowMicrophone(wc,p,o,win.webContents.id,origin,d));
 ses.setPermissionRequestHandler((wc,p,cb,d)=>cb(allowMicrophone(wc,p,d.requestingUrl,win.webContents.id,origin,d,true)));
 await win.loadURL(origin);app.on('before-quit',()=>server.server.close());
});
