import {test,expect} from '@playwright/test';
async function mockKeyboard(page){
  await page.addInitScript(()=>{
    let controller;window.soundCommands=[];
    window.replySound=(id,changes={})=>controller.enqueue(new TextEncoder().encode(JSON.stringify({protocol:'momo-easyinput/1',type:'sound_state',id,ok:true,enabled:true,volume:30,ready:true,error:'none',audio_error:'none',storage_error:'none',...changes})+'\n'));
    window.helloSound=()=>controller.enqueue(new TextEncoder().encode(JSON.stringify({protocol:'momo-easyinput/1',type:'hello',board:'easyinput-v2',firmware:'0.2.0',sound:true})+'\n'));
    const port={readable:new ReadableStream({start(c){controller=c}}),writable:new WritableStream({write(data){const command=JSON.parse(new TextDecoder().decode(data).trim());window.soundCommands.push(command);if(command.type==='sound_get')window.replySound(command.id)}}),open:async()=>{},close:async()=>{}};
    Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port}});
  });
  await page.goto('/');await expect(page.locator('.key')).toHaveCount(8);await page.locator('#connection').click();await page.evaluate(()=>window.helloSound());await page.evaluate(()=>setInterval(window.helloSound,2000));
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await expect(page.locator('#input-sound-status')).toContainText('已读取');
}
test('sound controls require hardware and successful device acknowledgement',async({page})=>{
  await mockKeyboard(page);await expect(page.locator('#input-sound-enabled')).toBeChecked();
  await page.locator('#input-sound-enabled').uncheck();await expect(page.locator('#input-sound-status')).toContainText('正在保存');await expect(page.locator('#input-sound-enabled')).toBeDisabled();
  await page.evaluate(()=>{const c=window.soundCommands.at(-1);window.replySound(c.id,{enabled:false})});
  await expect(page.locator('#input-sound-status')).toHaveText('已保存到键盘');await expect(page.locator('#input-sound-preview')).toBeDisabled();
  await page.locator('#input-sound-enabled').check();await page.evaluate(()=>window.replySound(window.soundCommands.at(-1).id));await expect(page.locator('#input-sound-preview')).toBeEnabled();
  await page.locator('#input-sound-preview').click();await page.evaluate(()=>window.replySound(window.soundCommands.at(-1).id));await expect(page.locator('#input-sound-status')).toContainText('已发送试听');
  await page.locator('#input-sound-volume').evaluate(el=>{el.value=60;el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'))});
  await page.evaluate(()=>window.replySound(window.soundCommands.at(-1).id,{ok:false,error:'storage_write'}));
  await expect(page.locator('#input-sound-status')).toContainText('保存失败');await expect(page.locator('#input-sound-preview')).toBeDisabled();
  await page.locator('#input-sound-refresh').click();await expect(page.locator('#input-sound-status')).toContainText('已读取');
  await page.screenshot({path:'test-results/input-sound-settings.png'});
  await page.getByRole('button',{name:'关闭设置'}).click();await page.locator('#connection').click();await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.locator('#input-sound-enabled')).toBeDisabled();
});
test('offline sound UI never offers computer-speaker preview',async({page})=>{
  await page.goto('/');await expect(page.locator('.key')).toHaveCount(8);await page.getByRole('button',{name:'设置',exact:true}).click();
  await expect(page.locator('#settings-dialog')).toBeVisible();await expect(page.locator('#input-sound-preview')).toBeDisabled();await expect(page.locator('#input-sound-status')).toContainText('连接键盘');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
