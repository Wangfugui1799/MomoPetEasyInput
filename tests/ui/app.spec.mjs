import {test,expect} from '@playwright/test';
test('eight keys, feeding, outfit persistence, sleep guard and diary',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('.key')).toHaveCount(8);await page.getByRole('button',{name:'1 喂食',exact:true}).click();await page.locator('#confirm').click();await expect(page.locator('#hunger-value')).toHaveText('80');
  await page.getByRole('button',{name:'6 装扮',exact:true}).click();await page.locator('#next').click();await page.locator('#confirm').click();await expect(page.locator('#outfit')).toHaveText('🎩');await page.reload();await expect(page.locator('#outfit')).toHaveText('🎩');
  await page.getByRole('button',{name:'8 睡觉',exact:true}).click();await page.locator('#confirm').click();await expect(page.locator('.pet-room')).toHaveClass(/sleeping/);await page.getByRole('button',{name:'1 喂食',exact:true}).click();await page.locator('#confirm').click();await expect(page.locator('#speech')).toHaveText('先叫醒我，再一起玩吧。');
  await page.getByRole('button',{name:'8 睡觉',exact:true}).click();await page.locator('#confirm').click();await expect(page.locator('.pet-room')).not.toHaveClass(/sleeping/);await page.locator('#diary-open').click();await expect(page.locator('.diary-entry')).toHaveCount(4);expect(errors).toEqual([]);
});
test('chat is local by default, text is escaped and keyboard focus is respected',async({page})=>{
  await page.goto('/');await page.locator('#chat-open').click();await expect(page.locator('#chat-dialog')).toBeVisible();await expect(page.locator('#chat-badge')).toContainText('预设回复');await page.locator('#chat-input').fill('<img src=x onerror=alert(1)> 今天有点累');await page.locator('#send-chat').click();await expect(page.locator('.message').last()).toContainText('今天不太轻松');await expect(page.locator('#messages img')).toHaveCount(0);await expect(page.locator('#mode-name')).toHaveText('聊天时间');
});
test('training can start and cancel, music can start and stop, mobile has no overflow',async({page})=>{
  await page.goto('/');await page.keyboard.press('3');await page.keyboard.press('Enter');await expect(page.locator('#training')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#training')).toBeHidden();await page.keyboard.press('7');await page.locator('#confirm').click();await expect(page.locator('#confirm')).toContainText('停止播放');await page.locator('#confirm').click();await expect(page.locator('#confirm')).toContainText('播放这一首');await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'docs/momo-mobile.png',fullPage:true});
});
test('sleep ambience follows sleeping, the setting and waking',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await page.getByRole('button',{name:'8 睡觉',exact:true}).click();await page.locator('#confirm').click();
  await expect(page.locator('.pet-room')).toHaveAttribute('data-sleep-sound','lullaby');
  await page.locator('#settings-open').click();await expect(page.locator('#sleep-sound-style')).toHaveValue('lullaby');
  await page.locator('#sleep-sound-style').selectOption('snore');await expect(page.locator('.pet-room')).toHaveAttribute('data-sleep-sound','snore');await expect(page.locator('#sleep-sound-status')).toContainText('正在播放');
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();await page.locator('#confirm').click();
  await expect(page.locator('.pet-room')).toHaveAttribute('data-sleep-sound','off');
  await page.locator('#settings-open').click();await page.locator('#sleep-sound-style').selectOption('off');
  await page.locator('#sleep-sound-volume').evaluate(el=>{el.value='55';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});await expect(page.locator('#sleep-sound-value')).toHaveText('55%');
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();await page.locator('#confirm').click();
  await expect(page.locator('.pet-room')).toHaveAttribute('data-sleep-sound','off');
  await page.reload();await page.locator('#settings-open').click();
  await expect(page.locator('#sleep-sound-style')).toHaveValue('off');await expect(page.locator('#sleep-sound-volume')).toHaveValue('55');
  expect(errors).toEqual([]);
});
test('serial handshake gates events and disconnection resets the status',async({page})=>{
  await page.addInitScript(()=>{let controller;const port={readable:new ReadableStream({start(c){controller=c}}),open:async()=>{},close:async()=>{}};Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port}});window.injectSerial=e=>controller.enqueue(new TextEncoder().encode(JSON.stringify(e)+'\n'))});
  await page.goto('/');await page.locator('#connection').focus();await page.keyboard.press('Enter');await page.evaluate(()=>window.injectSerial({protocol:'momo-easyinput/1',type:'key',key:1}));await expect(page.locator('#mode-name')).toHaveText('装扮时间');await page.evaluate(()=>window.injectSerial({protocol:'momo-easyinput/1',type:'hello',board:'easyinput-v2',firmware:'0.1.0'}));await expect(page.locator('#connection')).toContainText('已连接');await page.evaluate(()=>window.injectSerial({protocol:'momo-easyinput/1',type:'key',key:1}));await expect(page.locator('#mode-name')).toHaveText('喂食时间');await page.evaluate(()=>window.injectSerial({protocol:'momo-easyinput/1',type:'rotate',delta:1}));await expect(page.locator('#option-name')).toHaveText('甜甜草莓');await page.evaluate(()=>window.injectSerial({protocol:'momo-easyinput/1',type:'press'}));await expect(page.locator('#hunger-value')).toHaveText('75');await page.locator('#settings-open').click();await page.evaluate(()=>window.injectSerial({protocol:'momo-easyinput/1',type:'long_press'}));await expect(page.locator('#settings-dialog')).not.toBeVisible();await page.locator('#connection').click();await expect(page.locator('#connection')).toContainText('连接 EasyInput');
});
test('desktop reference screenshot',async({page})=>{await page.goto('/');await page.locator('#next').click();await page.screenshot({path:'docs/momo-desktop.png',fullPage:true});});
test('a pet that was already asleep at launch gets the ambience back',async({page})=>{
  // 模拟浏览器拦截自动播放：没有用户手势时 resume() 不起作用，验证「等第一次交互补上」这条路径。
  await page.addInitScript(()=>{
    const Real=window.AudioContext;
    window.AudioContext=class extends Real{resume(){return window.__gestured?super.resume():Promise.resolve()}};
    document.addEventListener('pointerdown',()=>{window.__gestured=true},{capture:true});
  });
  await page.addInitScript(()=>localStorage.setItem('momo.pet.v1',JSON.stringify({version:1,createdAt:Date.now(),updatedAt:Date.now(),hunger:65,mood:70,energy:80,bond:12,outfit:0,sleeping:true,diary:[],lastExplore:0})));
  await page.goto('/');
  await expect(page.locator('.pet-room')).toHaveClass(/sleeping/);
  await expect(page.locator('.pet-room')).toHaveAttribute('data-sleep-sound','off');
  await page.locator('#mood-label').click();
  await expect(page.locator('.pet-room')).toHaveAttribute('data-sleep-sound','lullaby');
});
