import {test,expect} from '@playwright/test';
const moon=page=>page.locator('[data-theme-choice="moonlight"]');
const classic=page=>page.locator('[data-theme-choice="classic"]');
const choose=async(page,name)=>page.getByRole('button',{name,exact:true}).click();
async function enterMoon(page){await page.goto('/');await moon(page).click();await expect(page.locator('html')).toHaveAttribute('data-theme','moonlight')}

test('theme defaults, corruption, persistence, live draft and node identity',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await expect(classic(page)).toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>{window.originalInput=document.querySelector('#chat-input');window.originalMessages=document.querySelector('#messages');window.originalSettings=document.querySelector('#voice-input')});
  await moon(page).click();await expect(page.locator('#moon-chat')).toBeVisible();await expect(page.locator('#voice-toggle')).toHaveAttribute('aria-pressed','false');
  await page.locator('#chat-input').fill('没有发送的草稿 123');
  await classic(page).click();await expect(page.locator('#chat-dialog')).toBeVisible();await expect(page.locator('#chat-input')).toHaveValue('没有发送的草稿 123');
  await page.keyboard.press('Escape');await moon(page).click();await expect(page.locator('#chat-input')).toHaveValue('没有发送的草稿 123');
  for(let i=0;i<3;i++){await classic(page).click();await moon(page).click()}
  expect(await page.evaluate(()=>window.originalInput===document.querySelector('#chat-input')&&window.originalMessages===document.querySelector('#messages')&&window.originalSettings===document.querySelector('#voice-input'))).toBe(true);
  expect(await page.locator('#messages .message')).toHaveCount(1);
  expect(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.length===new Set(ids).size})).toBe(true);
  await page.reload();await expect(moon(page)).toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>localStorage.setItem('momo.ui.theme.v1','broken'));await page.reload();await expect(classic(page)).toHaveAttribute('aria-pressed','true');expect(errors).toEqual([]);
});

test('blocked storage still switches without discarding pet state',async({page})=>{
  await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('blocked','SecurityError')}});
  await page.goto('/');await moon(page).click();await expect(page.locator('#moon-chat')).toBeVisible();await expect(page.locator('#toast')).toContainText('本地存储不可用');
  await choose(page,'1 喂食');await page.locator('#confirm').click();await expect(page.locator('#hunger-value')).toHaveText('80');await classic(page).click();await expect(page.locator('#hunger-value')).toHaveText('80');
});

test('activities, clothing, sleep, diary export, settings and classic restoration',async({page})=>{
  await enterMoon(page);await choose(page,'1 喂食');await page.locator('#confirm').click();await expect(page.locator('#hunger-value')).toHaveText('80');
  await choose(page,'2 摸摸');await page.locator('#next').click();await page.locator('#confirm').click();
  await choose(page,'4 探索');await page.locator('#confirm').click();await expect(page.locator('#speech')).not.toHaveText('附近藏着什么小美好？');
  await choose(page,'6 装扮');await page.locator('#next').click();await page.locator('#confirm').click();await expect(page.locator('#outfit')).toHaveText('🎩');
  await choose(page,'8 睡觉');await page.locator('#confirm').click();await expect(page.locator('.moon-pet-asleep')).toBeVisible();await expect(page.locator('.moon-pet-awake')).toBeHidden();
  await classic(page).click();await expect(page.locator('.pet-room')).toHaveClass(/sleeping/);await expect(page.locator('.pet')).toBeVisible();await moon(page).click();await page.locator('#confirm').click();await expect(page.locator('.moon-pet-awake')).toBeVisible();
  await page.locator('#diary-open').click();await expect(page.locator('.diary-entry')).toHaveCount(6);const dl=page.waitForEvent('download');await page.locator('#export-diary').click();expect((await dl).suggestedFilename()).toMatch(/Momo-日记/);await page.keyboard.press('Escape');
  await page.locator('#settings-open').click();await expect(page.locator('.settings-group')).toHaveCount(5);await expect(page.locator('#voice-cue')).toHaveCount(1);await page.locator('#reverse-knob').check();await page.locator('#voice-input').selectOption('default');await page.keyboard.press('Escape');
  await classic(page).click();await page.locator('#settings-open').click();await expect(page.locator('#reverse-knob')).toBeChecked();await expect(page.locator('#voice-cue')).toBeVisible();await expect(page.locator('#settings-dialog>.setting-row')).toHaveCount(3);
});

test('training and music continue through repeated switches, text input is isolated',async({page})=>{
  await enterMoon(page);await choose(page,'3 训练');await page.locator('#confirm').click();await expect(page.locator('#training')).toBeVisible();
  await classic(page).click();await expect(page.locator('#training')).toBeVisible();await moon(page).click();await expect(page.locator('#training')).toBeVisible();await page.locator('#confirm').click();await expect(page.locator('#training')).toBeHidden();
  await choose(page,'7 音乐');await page.locator('#confirm').click();await expect(page.locator('#confirm')).toContainText('停止播放');await classic(page).click();await moon(page).click();await expect(page.locator('#confirm')).toContainText('停止播放');await page.locator('#confirm').click();
  await page.locator('#chat-input').fill('');await page.locator('#chat-input').pressSequentially('12345678');await expect(page.locator('#mode-name')).toHaveText('音乐时间');await expect(page.locator('#chat-input')).toHaveValue('12345678');
});

test('pending AI reply and draft survive classic to moon and back without another request',async({page})=>{
  let resolveReply;const ready=new Promise(r=>resolveReply=r);let calls=0;
  await page.route('**/api/chat',async route=>{calls++;await ready;await route.fulfill({json:{reply:'我还在，消息也没有丢。'}})});
  await page.goto('/');await page.locator('#settings-open').click();await page.locator('#ai-endpoint').fill('https://example.com/chat/completions');await page.locator('#ai-model').fill('test');await page.locator('#ai-key').fill('test-only');await page.locator('#ai-form button[type=submit]').click();await page.keyboard.press('Escape');
  await page.locator('#chat-open').click();await page.locator('#chat-input').fill('今天很累');await page.locator('#send-chat').click();await expect(page.locator('#send-chat')).toBeDisabled();await page.keyboard.press('Escape');await moon(page).click();await expect(page.locator('.message').last()).toContainText('正在想');
  await page.locator('#chat-input').fill('下一句草稿');await classic(page).click();await page.keyboard.press('Escape');await moon(page).click();resolveReply();await expect(page.locator('.message').last()).toHaveText('我还在，消息也没有丢。');await expect(page.locator('#chat-input')).toHaveValue('下一句草稿');expect(calls).toBe(1);await expect(page.locator('.message.user')).toHaveCount(1);
});

test('USB input and battery survive theme switches without reconnect',async({page})=>{
  await page.addInitScript(()=>{window.opens=0;let controller;const emit=m=>controller.enqueue(new TextEncoder().encode(JSON.stringify({protocol:'momo-easyinput/1',...m})+'\n'));window.inject=emit;const port={readable:new ReadableStream({start(c){controller=c}}),open:async()=>{window.opens++;setTimeout(()=>emit({type:'hello',board:'easyinput-v2',firmware:'0.4.0'}),10)},close:async()=>{}};Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port}})});
  await page.goto('/');await page.locator('#connection').click();await expect(page.locator('#connection')).toContainText('已连接');await moon(page).click();
  await page.evaluate(()=>{window.inject({type:'key',key:1});window.inject({type:'rotate',delta:1});window.inject({type:'press'})});await expect(page.locator('#hunger-value')).toHaveText('75');await classic(page).click();await expect(page.locator('#connection')).toContainText('已连接');expect(await page.evaluate(()=>window.opens)).toBe(1);
});

for(const size of [{width:1487,height:1058},{width:1280,height:950},{width:850,height:720},{width:390,height:844}])test(`moonlight screenshot and usable controls ${size.width}x${size.height}`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize(size);await enterMoon(page);await page.emulateMedia({reducedMotion:'reduce'});await choose(page,'1 喂食');
  await page.locator('#chat-input').fill('今天有点累，想待一会儿。');await page.locator('#send-chat').click();await expect(page.locator('.message').last()).not.toContainText('正在想');
  await page.locator('#chat-input').blur();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`docs/moonlight/home-${size.width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const id of ['chat-input','send-chat','voice-toggle','confirm']){const box=await page.locator('#'+id).boundingBox();expect(box.width).toBeGreaterThan(20);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width)}
  if(size.width===1487){await choose(page,'8 睡觉');await page.locator('#confirm').click();await page.screenshot({path:'docs/moonlight/sleep.png',fullPage:true});await page.locator('#diary-open').click();await page.screenshot({path:'docs/moonlight/diary.png'});await page.keyboard.press('Escape');await page.locator('#settings-open').click();await page.screenshot({path:'docs/moonlight/settings.png'})}
  expect(errors).toEqual([]);
});
