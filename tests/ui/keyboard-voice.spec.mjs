import {test,expect} from '@playwright/test';
async function setup(page,{capable=true,source='easyinput'}={}){
  await page.addInitScript(({capable,source})=>{
    if(!localStorage.getItem('momo.voice.input.v1'))localStorage.setItem('momo.voice.input.v1',source);window.micCommands=[];window.gumCalls=[];window.voiceSent=[];
    let controller,seq=0,stream=0,timer;
    const emit=e=>controller.enqueue(new TextEncoder().encode(JSON.stringify({protocol:'momo-easyinput/1',...e})+'\n'));
    window.keyEvent=emit;
    const port={open:async()=>{setTimeout(()=>emit({type:'hello',board:'easyinput-v2',firmware:capable?'0.5.0':'0.4.0',mic:capable?'pcm16-usb-v1':false}),20)},close:async()=>clearInterval(timer),readable:new ReadableStream({start(c){controller=c}}),writable:new WritableStream({write(bytes){const m=JSON.parse(new TextDecoder().decode(bytes).trim());window.micCommands.push(m);if(m.type==='mic_start'){stream=m.stream;seq=0;timer=setInterval(()=>emit({type:'mic_audio',stream,seq:seq++,pcm:btoa('\0'.repeat(256))}),8)}if(m.type==='mic_stop')clearInterval(timer);emit({type:'mic_state',id:m.id,stream:m.stream,ok:true,active:m.type!=='mic_stop',error:'none',rate:16000})}})};
    Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port}});
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async constraints=>{window.gumCalls.push(constraints);if(constraints.audio.deviceId?.exact==='missing')throw new DOMException('missing','OverconstrainedError');const track={enabled:true,stop(){window.trackStopped=true},addEventListener(){}};return {getTracks:()=>[track],getAudioTracks:()=>[track]}}});
    Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{value:async()=>[{kind:'audioinput',deviceId:'mac-mic',label:'Mac 麦克风'},{kind:'audioinput',deviceId:'headset',label:'耳机麦克风'}]});
    class Socket{constructor(){this.readyState=1;window.voiceSocket=this;setTimeout(()=>this.emit({type:'set-model-and-conf'}),10)}emit(m){this.onmessage?.({data:JSON.stringify(m)})}send(raw){const m=JSON.parse(raw);window.voiceSent.push(m);if(m.type==='create-new-history')setTimeout(()=>this.emit({type:'new-history-created'}),0);if(m.type==='frontend-playback-complete')this.emit({type:'control',text:'conversation-chain-end'})}close(){this.readyState=3}}
    window.WebSocket=Socket;
  },{capable,source});
  await page.route('**/voice-assets/ort.wasm.min.js',r=>r.fulfill({contentType:'text/javascript',body:`window.ort={env:{wasm:{}},Tensor:class{dispose(){}},InferenceSession:{create:async()=>({release:async()=>{window.modelReleased=true}})}};`}));
  await page.route('**/voice-assets/bundle.min.js',r=>r.fulfill({contentType:'text/javascript',body:`window.vad={Message:{SpeechEnd:'end'},FrameProcessor:class{constructor(process,reset){this.reset=reset;reset()}resume(){}pause(){}async process(frame,event){window.pcmFrame=frame;window.endSpeech=()=>event({msg:'end',audio:new Float32Array(16000).fill(.2)})}},MicVAD:{new:async options=>({start:async()=>options.getStream(),pause:async()=>options.pauseStream(),destroy(){}})}};`}));
  await page.goto('/');await page.locator('#connection').click();await expect(page.locator('#connection')).toContainText('已连接');
}
test('S5 records and sends three USB messages; knob only reveals chat and other activities still work',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
  await page.evaluate(()=>window.keyEvent({type:'key',key:5}));await expect(page.locator('#voice-status')).toContainText('正在录音');await expect(page.locator('#chat-dialog')).toBeHidden();expect(await page.evaluate(()=>window.gumCalls.length)).toBe(0);
  await page.evaluate(()=>window.keyEvent({type:'press'}));await expect(page.locator('#chat-dialog')).toBeVisible();expect(await page.evaluate(()=>window.micCommands.filter(m=>m.type==='mic_start').length)).toBe(1);
  await page.evaluate(()=>window.keyEvent({type:'key',key:1}));await expect(page.locator('#chat-dialog')).toBeHidden();await expect(page.locator('#mode-name')).toHaveText('喂食时间');await page.evaluate(()=>window.keyEvent({type:'press'}));await expect(page.locator('#hunger-value')).toHaveText('80');
  for(let turn=1;turn<=3;turn++){
    if(turn>1)await page.evaluate(()=>window.keyEvent({type:'key',key:5}));
    await expect(page.locator('#voice-panel-status')).toContainText('正在录音');
    await page.waitForTimeout(1100); // even silence longer than the old VAD threshold must not send
    expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-end').length)).toBe(turn-1);
    await page.evaluate(()=>window.keyEvent({type:'key',key:5}));await expect(page.locator('#voice-panel-status')).toContainText('正在想');
    await page.evaluate(()=>{window.keyEvent({type:'press'});window.keyEvent({type:'key',key:5})});await expect(page.locator('#chat-dialog')).toBeVisible();
    expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-end').length)).toBe(turn);
    await page.evaluate(turn=>{window.voiceSocket.emit({type:'user-input-transcription',text:'留言'+turn});window.voiceSocket.emit({type:'audio',audio:null,display_text:{text:'回复'+turn}});window.voiceSocket.emit({type:'backend-synth-complete'})},turn);
    await expect(page.locator('#voice-status')).toContainText('按 S5 录下一条');
    expect(await page.evaluate(()=>window.micCommands.filter(m=>m.type==='mic_start').length)).toBe(turn);
  }
  expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='create-new-history').length)).toBe(1);
  await page.locator('#voice-toggle').click();await expect(page.locator('#voice-panel')).toBeHidden();expect(await page.evaluate(()=>window.modelReleased)).toBeUndefined();expect(errors).toEqual([]);
});
test('settings preserve exact input across reload; missing device does not fall back',async({page})=>{
  await setup(page,{source:'headset'});await page.locator('#settings-open').click();await expect(page.locator('#voice-input')).toHaveValue('headset');await page.locator('#voice-input').selectOption('mac-mic');await page.locator('#settings-dialog .close-dialog').click();await page.keyboard.press('5');await page.locator('#confirm').click();await expect(page.locator('#voice-status')).toContainText('正在录音');expect(await page.evaluate(()=>window.gumCalls[0].audio.deviceId)).toEqual({exact:'mac-mic'});
  await page.keyboard.press('Escape');await page.locator('#settings-open').click();await page.locator('#voice-input').selectOption('easyinput');await expect(page.locator('#voice-panel')).toBeHidden();expect(await page.evaluate(()=>window.trackStopped)).toBe(true);
  await page.reload();await page.locator('#settings-open').click();await expect(page.locator('#voice-input')).toHaveValue('easyinput');
  await page.evaluate(()=>localStorage.setItem('momo.voice.input.v1','missing'));await page.reload();await page.keyboard.press('5');await page.locator('#confirm').click();await expect(page.locator('#voice-status')).toContainText('所选麦克风不可用');expect(await page.evaluate(()=>window.gumCalls.length)).toBe(1);expect(await page.evaluate(()=>window.gumCalls[0].audio.deviceId)).toEqual({exact:'missing'});
});
test('older firmware explains USB upgrade and never opens computer microphone',async({page})=>{
  await setup(page,{capable:false});await page.keyboard.press('5');await page.locator('#confirm').click();await expect(page.locator('#voice-status')).toContainText('升级');expect(await page.evaluate(()=>window.gumCalls.length)).toBe(0);expect(await page.evaluate(()=>window.micCommands.length)).toBe(0);await expect(page.locator('#chat-input')).toBeEnabled();
});
test('text entry opens local chat without capture; settings fit mobile',async({page})=>{
  await setup(page);await page.locator('#chat-open').click();await expect(page.locator('#chat-dialog')).toBeVisible();await expect(page.locator('#voice-toggle')).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>window.micCommands.length)).toBe(0);
  await page.keyboard.press('Escape');await page.locator('#settings-open').click();await page.setViewportSize({width:390,height:844});expect(await page.locator('#settings-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);await page.screenshot({path:'docs/momo-voice-input-settings.png'});
});
