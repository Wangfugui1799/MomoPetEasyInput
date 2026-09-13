// Real Electron window/IPC integration with simulated, handshaken USB input.
import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const directory=await mkdtemp(join(tmpdir(),'momo-focus-'));
let desktop;
try{
  const executablePath=process.env.MOMO_TEST_EXECUTABLE;
  desktop=await electron.launch({...(executablePath?{executablePath}:{}),args:[...(executablePath?[]:[resolve('.')]),`--user-data-dir=${directory}`],env:{...process.env,MOMO_DESKTOP_PORT:'4796'}});
  const page=await desktop.firstWindow();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForSelector('#keys .key');
  await page.evaluate(()=>{
    let controller;
    const emit=event=>controller.enqueue(new TextEncoder().encode(JSON.stringify({protocol:'momo-easyinput/1',...event})+'\n'));
    const port={readable:new ReadableStream({start(c){controller=c}}),open:async()=>{},close:async()=>{}};
    Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port}});
    window.injectInput=emit;
  });
  await page.locator('#connection').click();
  await page.evaluate(()=>window.injectInput({type:'hello',board:'easyinput-v2',firmware:'0.1.0'}));
  await expect(page.locator('#connection')).toContainText('已连接');
  await desktop.evaluate(({BrowserWindow})=>{global.focusTestWindow=BrowserWindow.getAllWindows()[0]});
  const windowState=()=>desktop.evaluate(()=>({visible:global.focusTestWindow.isVisible(),minimized:global.focusTestWindow.isMinimized(),focused:global.focusTestWindow.isFocused(),top:global.focusTestWindow.isAlwaysOnTop()}));
  const summon=async()=>{
    await page.evaluate(()=>window.injectInput({type:'long_press'}));
    await expect.poll(windowState).toEqual({visible:true,minimized:false,focused:true,top:false});
  };
  await summon();
  await page.locator('#settings-open').click();
  await desktop.evaluate(()=>global.focusTestWindow.hide());
  await expect.poll(async()=>(await windowState()).visible).toBe(false);
  await summon();await expect(page.locator('#settings-dialog')).not.toBeVisible();
  if(process.platform==='darwin'){
    await desktop.evaluate(({app})=>app.hide());
    await expect.poll(()=>desktop.evaluate(({app})=>app.isHidden())).toBe(true);
    await summon();
    await expect.poll(()=>desktop.evaluate(({app})=>app.isHidden())).toBe(false);
  }
  await desktop.evaluate(({BrowserWindow})=>{global.otherFocusWindow=new BrowserWindow({width:300,height:200});global.otherFocusWindow.show();global.otherFocusWindow.focus()});
  await expect.poll(async()=>(await windowState()).focused).toBe(false);
  await summon();
  await desktop.evaluate(()=>global.otherFocusWindow.destroy());
  console.log('PASS: hidden app/window and background window are restored by USB long press.');
  // A different renderer cannot invoke the privileged focus action.
  const rejected=await desktop.evaluate(async({BrowserWindow,ipcMain})=>{
    const foreign=new BrowserWindow({show:false});
    try{
      await ipcMain._invokeHandlers.get('momo:focus')({sender:foreign.webContents,senderFrame:foreign.webContents.mainFrame});
      return false;
    }catch(error){return error.message==='Invalid focus origin'}finally{foreign.destroy()}
  });
  expect(rejected).toBe(true);expect(errors).toEqual([]);
  await desktop.evaluate(()=>global.focusTestWindow.minimize());
  await expect.poll(async()=>(await windowState()).minimized).toBe(true);
  await summon();
  console.log('PASS: USB long press restores minimized, hidden and background windows, closes settings, preserves always-on-top and rejects foreign IPC.');
}finally{
  if(desktop)await desktop.close();
  await rm(directory,{recursive:true,force:true});
}
