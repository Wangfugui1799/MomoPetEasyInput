import {test,expect} from '@playwright/test';
const switchTheme=async(page,theme)=>{if(await page.locator('#chat-dialog').isVisible())await page.keyboard.press('Escape');await page.locator(`[data-theme-choice="${theme}"]`).click()};
async function mock(page){
 await page.addInitScript(()=>{
  window.voiceSent=[];window.voiceTracks=[];window.socketCount=0;
  class Socket{constructor(){this.readyState=1;window.socketCount++;window.voiceSocket=this;setTimeout(()=>this.emit({type:'set-model-and-conf'}),10)}emit(m){this.onmessage?.({data:JSON.stringify(m)})}send(raw){const m=JSON.parse(raw);window.voiceSent.push(m);if(m.type==='create-new-history')setTimeout(()=>this.emit({type:'new-history-created'}),0);if(m.type==='frontend-playback-complete')this.emit({type:'control',text:'conversation-chain-end'})}close(){this.readyState=3}}
  window.WebSocket=Socket;
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{const t={enabled:true,stopped:false,stop(){this.stopped=true},addEventListener(){}};window.voiceTracks.push(t);return {getTracks:()=>[t],getAudioTracks:()=>[t]}}});
 });
 await page.route('**/voice-assets/ort.wasm.min.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/voice-assets/bundle.min.js',r=>r.fulfill({contentType:'text/javascript',body:`window.vad={MicVAD:{new:async options=>{window.voiceOptions=options;let stream;return {start:async()=>{stream=stream?await options.resumeStream(stream):await options.getStream()},pause:async()=>options.pauseStream(stream),destroy(){}}}}};`}));
 await page.goto('/');
}
function audioClip(){const wav=Buffer.alloc(44+16000*2*3);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);return wav.toString('base64')}

test('three continuous voice turns survive listening, thinking and playing theme transitions',async({page})=>{
 await mock(page);await switchTheme(page,'moonlight');expect(await page.evaluate(()=>window.voiceTracks.length)).toBe(0);
 await page.locator('#voice-toggle').click();await expect(page.locator('#voice-status')).toContainText('正在听');
 for(let turn=0;turn<3;turn++){
  await switchTheme(page,'classic');await switchTheme(page,'moonlight');
  await page.evaluate(()=>window.voiceOptions.onSpeechEnd(new Float32Array(16000).fill(.2)));await expect(page.locator('#voice-status')).toContainText('正在想');
  await switchTheme(page,'classic');await switchTheme(page,'moonlight');
  await page.evaluate(({audio,turn})=>{window.voiceSocket.emit({type:'user-input-transcription',text:'我的留言'+turn});window.voiceSocket.emit({type:'audio',audio,display_text:{text:'回复'+turn}});window.voiceSocket.emit({type:'backend-synth-complete'})},{audio:audioClip(),turn});
  await expect(page.locator('#voice-status')).toContainText('正在说');await switchTheme(page,'classic');await switchTheme(page,'moonlight');await expect(page.locator('#voice-status')).toContainText('正在听');
 }
 expect(await page.evaluate(()=>window.socketCount)).toBe(1);expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-end').length)).toBe(3);expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='frontend-playback-complete').length)).toBe(3);expect(await page.evaluate(()=>window.voiceSent.some(m=>m.type==='interrupt-signal'))).toBe(false);expect(await page.evaluate(()=>window.voiceTracks.some(t=>t.stopped))).toBe(false);
 await expect(page.locator('.message.user')).toHaveCount(3);await expect(page.locator('.message.assistant')).toHaveCount(4);
 await page.locator('#voice-toggle').click();expect(await page.evaluate(()=>window.voiceTracks.every(t=>t.stopped))).toBe(true);
});

test('S5 retains captured phrases across switch, sends once, and other activities remain available',async({page})=>{
 await mock(page);await page.keyboard.press('5');await expect(page.locator('#voice-panel-status')).toContainText('正在录音');
 await page.evaluate(()=>{window.voiceOptions.onFrameProcessed({},new Float32Array(16000).fill(.2));window.voiceOptions.onSpeechEnd(new Float32Array(16000).fill(.2))});
 await switchTheme(page,'moonlight');await page.getByRole('button',{name:'1 喂食',exact:true}).click();await page.locator('#confirm').click();await expect(page.locator('#hunger-value')).toHaveText('80');await expect(page.locator('#moon-chat')).toBeVisible();await expect(page.locator('#voice-status')).toContainText('正在录音');
 await switchTheme(page,'classic');await switchTheme(page,'moonlight');await page.keyboard.press('5');await expect(page.locator('#voice-status')).toContainText('正在想');
 expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-end').length)).toBe(1);expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-data').reduce((sum,m)=>sum+m.audio.length,0))).toBe(16000);
 await page.evaluate(()=>{window.voiceSocket.emit({type:'audio',audio:null,display_text:{text:'收到这条留言啦'}});window.voiceSocket.emit({type:'backend-synth-complete'})});await expect(page.locator('#voice-status')).toContainText('按 S5 录下一条');await switchTheme(page,'classic');await switchTheme(page,'moonlight');await expect(page.locator('.message').last()).toHaveText('收到这条留言啦');expect(await page.evaluate(()=>window.socketCount)).toBe(1);await page.locator('#voice-toggle').click();
});

test('Bluetooth event subscription and battery persist across both themes',async({page})=>{
 await page.addInitScript(()=>{
  window.bleConnections=0;const c=new EventTarget();c.startNotifications=async()=>c;c.readValue=async()=>new DataView(Uint8Array.of(1,0,0).buffer);const d=new EventTarget();d.gatt={connect:async()=>{window.bleConnections++;return {getPrimaryService:async()=>({getCharacteristic:async()=>c})}},disconnect(){}};
  Object.defineProperty(navigator,'bluetooth',{value:{requestDevice:async()=>d}});window.bleInput=(type,value)=>{c.value=new DataView(Uint8Array.of(1,type,value).buffer);c.dispatchEvent(new Event('characteristicvaluechanged'))};
 });
 await page.goto('/');await page.locator('#bluetooth-connect').click();await expect(page.locator('#connection')).toContainText('已连接');await switchTheme(page,'moonlight');await page.evaluate(()=>{window.bleInput(5,85);window.bleInput(1,1);window.bleInput(2,1);window.bleInput(3,0)});await expect(page.locator('#battery-level')).toHaveText('电量 85%');await expect(page.locator('#hunger-value')).toHaveText('75');await switchTheme(page,'classic');await switchTheme(page,'moonlight');await expect(page.locator('#battery-level')).toHaveText('电量 85%');expect(await page.evaluate(()=>window.bleConnections)).toBe(1);await page.locator('#connection').click();await expect(page.locator('#battery-level')).toBeHidden();
});
