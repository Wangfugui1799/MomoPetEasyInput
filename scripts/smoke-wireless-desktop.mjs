import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const profile=await realpath(await mkdtemp(path.join(tmpdir(),'momo-wireless-smoke-')));
const app=await electron.launch({executablePath:path.resolve(process.env.MOMO_SMOKE_APP||'dist/wireless/Momo-darwin-arm64/Momo.app/Contents/MacOS/Momo'),args:[`--user-data-dir=${profile}`],env:{...process.env,MOMO_DESKTOP_PORT:'4788'},timeout:30000});
try{
  const actual=await app.evaluate(({app})=>app.getPath('userData'));assert.equal(actual,profile,'Smoke test must use an isolated profile');
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.key');
  assert.equal(await page.locator('.key').count(),8);
  const status=await page.evaluate(()=>window.momoDesktop.wireless('status'));assert.equal(status.bound,false);assert.equal(status.listening,false);
  await page.locator('#settings-open').click();await page.locator('#voice-input').selectOption('easyinput-wifi');
  assert.equal(await page.locator('#wireless-bind').isEnabled(),true);
  await page.locator('#wireless-bind').click();await page.waitForFunction(()=>document.querySelector('#wireless-status').textContent.includes('原生 USB'));
  const denied=await page.evaluate(async()=>{try{await window.momoDesktop.wireless('unexpected-command');return false}catch{return true}});assert.equal(denied,true);
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');assert.deepEqual(errors,[]);
  await page.locator('.wireless-settings').evaluate(el=>el.scrollIntoView({block:'start'}));
  await page.screenshot({path:process.env.MOMO_SMOKE_SCREENSHOT||'docs/momo-wireless-settings.png',fullPage:true});
  console.log(JSON.stringify({nativeWindow:true,keys:8,isolatedProfile:true,receiverDefaultOff:true,ipc:true,wirelessSettings:true,errors},null,2));
}finally{await app.close()}
