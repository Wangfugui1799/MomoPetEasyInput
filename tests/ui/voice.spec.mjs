import {test,expect} from '@playwright/test';
async function openChat(page){await page.goto('/');await page.locator('#chat-open').click()}
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
  await page.locator('#chat-dialog').getByRole('button',{name:'关闭麦克风',exact:true}).click();expect(await page.evaluate(()=>window.voiceTracks.every(t=>t.stopped))).toBe(true);await expect(page.locator('#voice-toggle')).toHaveAttribute('aria-pressed','false');
});
test('S5 system input keeps multiple phrases and silence until the send press',async({page})=>{
  await mockVoice(page);await page.goto('/');await page.keyboard.press('5');
  await expect(page.locator('#voice-panel-status')).toContainText('正在录音');
  await page.evaluate(()=>{
    const o=window.voiceOptions;o.onFrameProcessed({},new Float32Array(8000).fill(.2));o.onSpeechEnd(new Float32Array(8000).fill(.2));
    o.onFrameProcessed({},new Float32Array(16000));o.onVADMisfire();
    o.onFrameProcessed({},new Float32Array(8000).fill(.3));o.onSpeechEnd(new Float32Array(8000).fill(.3));
  });
  expect(await page.evaluate(()=>window.voiceSent.some(m=>m.type==='mic-audio-end'))).toBe(false);
  await page.keyboard.press('5');await expect(page.locator('#voice-panel-status')).toContainText('正在想');
  expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-data').reduce((n,m)=>n+m.audio.length,0))).toBe(32000);
  expect(await page.evaluate(()=>window.voiceTracks[0].enabled)).toBe(false);
  await page.evaluate(()=>{window.voiceSocket.emit({type:'audio',audio:null});window.voiceSocket.emit({type:'backend-synth-complete'})});
  await expect(page.locator('#voice-panel-status')).toContainText('按 S5 录下一条');expect(await page.evaluate(()=>window.voiceTracks[0].enabled)).toBe(false);
  await page.locator('#voice-stop').click();
});
test('Escape keeps voice alive; text routes only to VTuber while enabled',async({page})=>{
  let chats=0;page.on('request',r=>{if(r.url().endsWith('/api/chat'))chats++});await mockVoice(page);await openChat(page);await page.locator('#voice-toggle').click();await expect(page.locator('#voice-status')).toContainText('正在听');
  await page.locator('#chat-input').fill('测试文字');await page.locator('#send-chat').click();expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='text-input'))).toEqual([{type:'text-input',text:'测试文字'}]);expect(chats).toBe(0);
  await page.keyboard.press('Escape');await expect(page.locator('#chat-dialog')).not.toBeVisible();await expect(page.locator('#voice-panel')).toBeVisible();expect(await page.evaluate(()=>window.voiceTracks.some(t=>t.stopped))).toBe(false);
  await page.evaluate(()=>{window.voiceSocket.emit({type:'audio',audio:null,display_text:{text:'窗口关上了也能听到我'}});window.voiceSocket.emit({type:'backend-synth-complete'})});
  await expect(page.locator('#voice-panel-status')).toContainText('正在听');await expect(page.locator('#speech')).toContainText('窗口关上了也能听到我');
  await page.evaluate(()=>window.voiceOptions.onSpeechEnd(new Float32Array(16000).fill(.2)));await expect(page.locator('#voice-panel-status')).toContainText('正在想');
  await page.locator('#voice-reopen').click();await expect(page.locator('#chat-dialog')).toBeVisible();await expect(page.locator('.message').last()).toHaveText('窗口关上了也能听到我');
  expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='create-new-history').length)).toBe(1);
  await page.keyboard.press('Escape');await page.locator('#voice-stop').click();await expect(page.locator('#voice-panel')).toBeHidden();expect(await page.evaluate(()=>window.voiceTracks.every(t=>t.stopped))).toBe(true);
});
test('denied microphone displays recovery and leaves text chat usable',async({page})=>{
  await mockVoice(page,{permissionDenied:true});await openChat(page);await page.locator('#voice-toggle').click();await expect(page.locator('#voice-status')).toContainText('未获授权');await expect(page.locator('#chat-input')).toBeEnabled();await expect(page.locator('#voice-toggle')).toHaveAttribute('aria-pressed','false');
});
test('chat button layout fits a narrow screen',async({page})=>{
  await openChat(page);await page.setViewportSize({width:390,height:844});expect(await page.locator('#chat-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);await page.screenshot({path:'docs/momo-voice-mobile.png'});
});
test('voice cue offers four previewable choices and persists the selection',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();
  await expect(page.locator('#voice-cue option')).toHaveCount(4);await page.locator('#voice-cue').selectOption('bubble');
  await expect(page.locator('#voice-cue-status')).toContainText('气泡啫声');await page.reload();await page.getByRole('button',{name:'设置',exact:true}).click();
  await expect(page.locator('#voice-cue')).toHaveValue('bubble');await page.locator('#voice-cue-preview').click();await expect(page.locator('#voice-cue-status')).toContainText('气泡啫声');
});

for(const method of ['close button','backdrop'])test(`${method} preserves queued playback and reply text`,async({page})=>{
  await mockVoice(page);await openChat(page);await page.locator('#voice-toggle').click();await expect(page.locator('#voice-status')).toContainText('正在听');
  // Real, silent two-second WAV keeps the playback queue active while closing.
  const wav=Buffer.alloc(44+16000*2*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  await page.evaluate(audio=>{window.voiceOptions.onSpeechEnd(new Float32Array(16000).fill(.2));window.voiceSocket.emit({type:'user-input-transcription',text:'继续聊天'});window.voiceSocket.emit({type:'audio',audio,display_text:{text:'第一句。'}})},wav.toString('base64'));
  await expect(page.locator('#voice-status')).toContainText('正在说');
  if(method==='close button')await page.getByRole('button',{name:'关闭聊天',exact:true}).click();else await page.mouse.click(10,10);
  await expect(page.locator('#chat-dialog')).toBeHidden();await expect(page.locator('#voice-panel-status')).toContainText('正在说');
  await page.evaluate(()=>{window.voiceSocket.emit({type:'audio',audio:null,display_text:{text:'第二句。'}});window.voiceSocket.emit({type:'backend-synth-complete'})});
  await expect(page.locator('#voice-panel-status')).toContainText('正在听');
  expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='interrupt-signal').length)).toBe(0);
  await page.locator('#voice-reopen').click();await expect(page.locator('.message.assistant')).toHaveCount(2);await expect(page.locator('.message').last()).toHaveText('第一句。第二句。');
  await page.locator('#voice-toggle').click();expect(await page.evaluate(()=>window.voiceTracks.every(t=>t.stopped))).toBe(true);
});
test('background voice status fits mobile and reports a disconnect',async({page})=>{
  await mockVoice(page);await openChat(page);await page.locator('#voice-toggle').click();await expect(page.locator('#voice-status')).toContainText('正在听');await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#voice-stop')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'docs/momo-voice-background-mobile.png'});
  await page.evaluate(()=>window.voiceSocket.onclose());await expect(page.locator('#voice-panel-status')).toContainText('已断开');await expect(page.locator('#voice-stop')).toHaveText('关闭提示');expect(await page.evaluate(()=>window.voiceTracks.every(t=>t.stopped))).toBe(true);
  await page.locator('#voice-stop').click();await expect(page.locator('#voice-panel')).toBeHidden();
});
