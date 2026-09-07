import {test,expect} from '@playwright/test';
test('Bluetooth controls Momo and disconnects cleanly',async({page})=>{
 await page.addInitScript(()=>{
  const characteristic=new EventTarget();
  characteristic.startNotifications=async()=>characteristic;
  characteristic.readValue=async()=>new DataView(Uint8Array.of(1,0,0).buffer);
  const device=new EventTarget();device.gatt={connect:async()=>({getPrimaryService:async()=>({getCharacteristic:async()=>characteristic})}),disconnect:()=>{}};
  Object.defineProperty(navigator,'bluetooth',{value:{requestDevice:async()=>device}});
  window.bleInput=(type,value)=>{characteristic.value=new DataView(Uint8Array.of(1,type,value).buffer);characteristic.dispatchEvent(new Event('characteristicvaluechanged'))};
 });
 await page.goto('/');await page.locator('#bluetooth-connect').click();await expect(page.locator('#connection')).toContainText('已连接');
 await page.evaluate(()=>window.bleInput(5,85));await expect(page.locator('#battery-level')).toHaveText('电量 85%');
 await page.evaluate(()=>window.bleInput(1,1));await expect(page.locator('#mode-name')).toHaveText('喂食时间');
 await page.evaluate(()=>window.bleInput(2,1));await expect(page.locator('#option-name')).toHaveText('甜甜草莓');
 await page.evaluate(()=>window.bleInput(3,0));await expect(page.locator('#hunger-value')).toHaveText('75');
 await page.locator('#settings-open').click();await expect(page.locator('#input-sound-status')).toContainText('USB');
 await page.locator('#settings-dialog .close-dialog').click();await page.locator('#connection').click();await expect(page.locator('#connection')).toContainText('连接 EasyInput');await expect(page.locator('#battery-level')).toBeHidden();
});
