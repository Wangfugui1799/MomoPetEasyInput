import {test,expect} from '@playwright/test';
async function openChat(page){await page.goto('/');await page.keyboard.press('5');await page.keyboard.press('Enter')}
async function mockVoice(page,{permissionDenied=false}={}){
  await page.addInitScript(({permissionDenied})=>{
    window.voiceSent=[];window.voiceTracks=[];
    class Socket {constructor(){this.readyState=1;window.voiceSocket=this;setTimeout(()=>this.emit({type:'set-model-and-conf'}),10)}emit(m){this.onmessage?.({data:JSON.stringify(m)})}send(raw){const m=JSON.parse(raw);window.voiceSent.push(m);if(m.type==='create-new-history')setTimeout(()=>this.emit({type:'new-history-created'}),0);if(m.type==='frontend-playback-complete')this.emit({type:'control',text:'conversation-chain-end'})}close(){this.readyState=3}}
    window.WebSocket=Socket;
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{if(permissionDenied)throw new DOMException('denied','NotAllowedError');const t={enabled:true,stopped:false,stop(){this.stopped=true},addEventListener(){}};window.voiceTracks.push(t);return {getTracks:()=>[t],getAudioTracks:()=>[t]}}});
  },{permissionDenied});
  await page.route('**/voice-assets/ort.wasm.min.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.route('**/voice-assets/bundle.min.js',route=>route.fulfill({contentType:'text/javascript',body:`window.vad={MicVAD:{new:async options=>{window.voiceOptions=options;let stream;return {start:async()=>{stream=stream?await options.resumeStream(stream):await options.getStream()},pause:async()=>options.pauseStream(stream),destroy:()=>{}}}}};`}));
}
test('microphone is left of input, default off; three turns and stop release tracks',async({page})=>{
  await mockVoice(page);await openChat(page);await expect(page.locator('#voice-toggle')).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>window.voiceTracks.length)).toBe(0);
  const mic=await page.locator('#voice-toggle').boundingBox(),input=await page.locator('#chat-input').boundingBox();expect(mic.x+mic.width).toBeLessThan(input.x);
  await page.getByRole('button',{name:'打开麦克风',exact:true}).click();await expect(page.locator('#voice-status')).toContainText('正在听');
  for(let i=0;i<3;i++){
    await page.evaluate(()=>window.voiceOptions.onSpeechEnd(new Float32Array(16000).fill(.2)));await expect(page.locator('#voice-status')).toContainText('正在想');
    expect(await page.evaluate(()=>window.voiceTracks[0].enabled)).toBe(false);
    await page.evaluate(i=>{window.voiceSocket.emit({type:'user-input-transcription',text:'你好'+i});window.voiceSocket.emit({type:'audio',audio:null,display_text:{text:'回答'+i}});window.voiceSocket.emit({type:'backend-synth-complete'})},i);
    await expect(page.locator('#voice-status')).toContainText('正在听');await expect(page.locator('.message').last()).toHaveText('回答'+i);
  }
  expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-end').length)).toBe(3);
  await page.getByRole('button',{name:'关闭麦克风',exact:true}).click();expect(await page.evaluate(()=>window.voiceTracks.every(t=>t.stopped))).toBe(true);await expect(page.locator('#voice-toggle')).toHaveAttribute('aria-pressed','false');
});
test('close with Escape cancels voice; text routes only to VTuber while enabled',async({page})=>{
  let chats=0;page.on('request',r=>{if(r.url().endsWith('/api/chat'))chats++});await mockVoice(page);await openChat(page);await page.locator('#voice-toggle').click();await expect(page.locator('#voice-status')).toContainText('正在听');
  await page.locator('#chat-input').fill('测试文字');await page.locator('#send-chat').click();expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='text-input'))).toEqual([{type:'text-input',text:'测试文字'}]);expect(chats).toBe(0);
  await page.keyboard.press('Escape');await expect(page.locator('#chat-dialog')).not.toBeVisible();expect(await page.evaluate(()=>window.voiceTracks.every(t=>t.stopped))).toBe(true);
});
test('denied microphone displays recovery and leaves text chat usable',async({page})=>{
  await mockVoice(page,{permissionDenied:true});await openChat(page);await page.locator('#voice-toggle').click();await expect(page.locator('#voice-status')).toContainText('未获授权');await expect(page.locator('#chat-input')).toBeEnabled();await expect(page.locator('#voice-toggle')).toHaveAttribute('aria-pressed','false');
});
test('chat button layout fits a narrow screen',async({page})=>{
  await openChat(page);await page.setViewportSize({width:390,height:844});expect(await page.locator('#chat-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);await page.screenshot({path:'docs/momo-voice-mobile.png'});
});
