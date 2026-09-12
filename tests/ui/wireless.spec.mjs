import {test,expect} from '@playwright/test';
async function setup(page,{connected=true,bound=true,stopDelay=0}={}){
  await page.addInitScript(({connected,bound,stopDelay})=>{
    localStorage.setItem('momo.voice.input.v1','easyinput-wifi');
    window.wirelessCalls=[];window.gumCalls=0;window.listeners=[];window.wirelessEmit=(kind,data)=>window.listeners.forEach(fn=>fn(kind,data));
    window.state={bound,connected,listening:connected,device:'010203040506',host:'192.168.1.8',addresses:[{name:'en0',host:'192.168.1.8'}]};
    let stream=0,seq=0,timer,active=false;
    window.momoDesktop={setAlwaysOnTop:async()=>{},onWireless:fn=>{window.listeners.push(fn);return ()=>{}},wireless:async(action,value)=>{
      window.wirelessCalls.push({action,value});
      if(action==='status')return window.state;
      if(action==='prepareBind')return {device:'010203040506',key:'42'.repeat(32)};
      if(action==='commitBind'){window.state={...window.state,bound:true};return window.state}
      if(action==='provision')return [[1,0,2,...Array(17).fill(9)],[1,1,2,9,9,9]];
      if(action==='start'){window.state={...window.state,listening:true};return window.state}
      if(action==='stop'){clearInterval(timer);window.state={...window.state,listening:false,connected:false};window.wirelessEmit('status',window.state);window.wirelessEmit('mic',{type:'disconnected'});return window.state}
      if(action==='mic'){
        if(value.type==='mic_start'){
          if(active)return {ok:false,active:true,stream,error:'busy'};
          active=true;stream=value.stream;seq=0;timer=setInterval(()=>window.wirelessEmit('mic',{type:'mic_audio',stream,seq:seq++,pcm:btoa('\0'.repeat(256))}),8);
        }
        if(value.type==='mic_stop'){if(stopDelay)await new Promise(r=>setTimeout(r,stopDelay));active=false;clearInterval(timer);window.stopConfirmed=(window.stopConfirmed||0)+1}
        return {ok:true,active:value.type!=='mic_stop',stream:value.stream,error:'none'};
      }
    }};
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{window.gumCalls++;throw Error('Wireless must not open system microphone')}});
    window.voiceSent=[];
    class Socket{constructor(){this.readyState=1;window.voiceSocket=this;setTimeout(()=>this.emit({type:'set-model-and-conf'}),10)}emit(m){this.onmessage?.({data:JSON.stringify(m)})}send(raw){const m=JSON.parse(raw);window.voiceSent.push(m);if(m.type==='create-new-history')setTimeout(()=>this.emit({type:'new-history-created'}),0);if(m.type==='frontend-playback-complete')this.emit({type:'control',text:'conversation-chain-end'})}close(){this.readyState=3}}
    window.WebSocket=Socket;
  },{connected,bound,stopDelay});
  await page.route('**/voice-assets/ort.wasm.min.js',r=>r.fulfill({contentType:'text/javascript',body:`window.ort={env:{wasm:{}},Tensor:class{dispose(){}},InferenceSession:{create:async()=>({release:async()=>{}})}};`}));
  await page.route('**/voice-assets/bundle.min.js',r=>r.fulfill({contentType:'text/javascript',body:`window.vad={Message:{SpeechEnd:'end'},FrameProcessor:class{constructor(process,reset){this.reset=reset;reset()}resume(){}pause(){}async process(frame,event){window.pcmFrame=frame;window.endSpeech=()=>event({msg:'end',audio:new Float32Array(16000).fill(.2)})}}};`}));
  await page.goto('/');
}
test('wireless source completes three turns with no USB or system microphone',async({page})=>{
  await setup(page);await page.locator('#chat-open').click();await page.locator('#voice-toggle').click();await expect(page.locator('#voice-status')).toContainText('正在听');
  for(let i=0;i<3;i++){
    await expect.poll(()=>page.evaluate(()=>window.pcmFrame?.length)).toBe(512);
    await page.evaluate(()=>window.endSpeech());await expect(page.locator('#voice-status')).toContainText('正在想');
    await page.evaluate(i=>{window.voiceSocket.emit({type:'user-input-transcription',text:'无线第'+i+'句'});window.voiceSocket.emit({type:'audio',audio:null,display_text:{text:'回答'+i}});window.voiceSocket.emit({type:'backend-synth-complete'});window.pcmFrame=null},i);
    await expect(page.locator('#voice-status')).toContainText('正在听');
  }
  await page.keyboard.press('Escape');await page.locator('#voice-stop').click();
  expect(await page.evaluate(()=>window.gumCalls)).toBe(0);
  expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-end').length)).toBe(3);
  const cmds=await page.evaluate(()=>window.wirelessCalls.filter(x=>x.action==='mic').map(x=>x.value.type));
  expect(cmds.filter(x=>x==='mic_start')).toHaveLength(4);expect(cmds.filter(x=>x==='mic_stop')).toHaveLength(4);
});
test('S5 Wi-Fi messages wait for a second press and stop ACK, with no automatic next recording',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page,{stopDelay:750});
  for(let turn=1;turn<=3;turn++){
    await page.keyboard.press('5');await expect(page.locator('#voice-panel-status')).toContainText('正在录音');
    await page.waitForTimeout(1100);
    expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-end').length)).toBe(turn-1);
    await page.keyboard.press('5');await expect(page.locator('#voice-panel-status')).toContainText('结束录音');
    expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-end').length)).toBe(turn-1);
    await expect.poll(()=>page.evaluate(()=>window.stopConfirmed)).toBe(turn);
    await expect.poll(()=>page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-end').length)).toBe(turn);
    await page.evaluate(()=>{window.voiceSocket.emit({type:'audio',audio:null});window.voiceSocket.emit({type:'backend-synth-complete'})});
    await expect(page.locator('#voice-panel-status')).toContainText('按 S5 录下一条');
    expect(await page.evaluate(()=>window.wirelessCalls.filter(c=>c.value?.type==='mic_start').length)).toBe(turn);
  }
  expect(await page.evaluate(()=>window.gumCalls)).toBe(0);expect(await page.evaluate(()=>window.pcmFrame)).toBeUndefined();
  expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='create-new-history').length)).toBe(1);
  await page.locator('#knob').click();await expect(page.locator('#chat-dialog')).toBeVisible();
  await page.locator('#voice-toggle').click();expect(errors).toEqual([]);
});
test('delayed Wi-Fi stop is acknowledged before submission and three automatic resumes',async({page})=>{
  await setup(page,{stopDelay:750});await page.locator('#chat-open').click();await page.locator('#voice-toggle').click();
  for(let turn=1;turn<=3;turn++){
    await expect(page.locator('#voice-status')).toContainText('正在听');
    await expect.poll(()=>page.evaluate(()=>window.pcmFrame?.length)).toBe(512);
    await page.evaluate(()=>window.endSpeech());
    // A normal end of speech pauses capture, not the conversation/session.
    expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-end').length)).toBe(turn-1);
    await expect.poll(()=>page.evaluate(()=>window.stopConfirmed)).toBe(turn);
    await expect.poll(()=>page.evaluate(()=>window.voiceSent.filter(m=>m.type==='mic-audio-end').length)).toBe(turn);
    await page.evaluate(()=>{window.pcmFrame=null;window.voiceSocket.emit({type:'audio',audio:null});window.voiceSocket.emit({type:'backend-synth-complete'})});
  }
  await expect(page.locator('#voice-status')).toContainText('正在听');
  await expect(page.locator('#voice-toggle')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>window.voiceSent.filter(m=>m.type==='create-new-history').length)).toBe(1);
  expect(await page.evaluate(()=>window.gumCalls)).toBe(0);
  await page.locator('#voice-toggle').click();
});
test('wireless disconnect stops voice and reconnection does not resume capture',async({page})=>{
  await setup(page);await page.locator('#chat-open').click();await page.locator('#voice-toggle').click();await expect(page.locator('#voice-status')).toContainText('正在听');
  await page.evaluate(()=>{window.wirelessEmit('status',{...window.state,connected:false});window.wirelessEmit('mic',{type:'disconnected'})});
  await expect(page.locator('#voice-toggle')).toHaveAttribute('aria-pressed','false');await expect(page.locator('#voice-status')).toContainText('断开');
  await page.evaluate(()=>window.wirelessEmit('status',window.state));
  expect(await page.evaluate(()=>window.wirelessCalls.filter(x=>x.value?.type==='mic_start').length)).toBe(1);
});
test('missing wireless input explains setup, preserves selection and never falls back',async({page})=>{
  await setup(page,{connected:false});await page.keyboard.press('5');await page.keyboard.press('Enter');await expect(page.locator('#voice-status')).toContainText('无线接收');
  expect(await page.evaluate(()=>window.gumCalls)).toBe(0);await page.keyboard.press('Escape');await page.locator('#settings-open').click();
  await expect(page.locator('#voice-input')).toHaveValue('easyinput-wifi');await page.setViewportSize({width:390,height:844});
  expect(await page.locator('#settings-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);
});
test('receiver toggle and provisioning show actionable states without BLE',async({page})=>{
  await setup(page,{connected:false});await page.locator('#settings-open').click();await page.locator('#wireless-toggle').click();await expect(page.locator('#wireless-status')).toContainText('等待开发板');
  await page.locator('#wireless-ssid').fill('My Wi-Fi');await page.locator('#wireless-password').fill('test-password');await page.locator('#wireless-form button').click();
  await expect(page.locator('#wireless-status')).toContainText('顶部连接');
  await page.locator('#wireless-toggle').click();await expect(page.locator('#wireless-toggle')).toHaveText('开启无线接收');
});
test('USB binding followed by BLE provisioning clears the password and reaches wireless ready',async({page})=>{
  await page.addInitScript(()=>{
    let controller;
    const emit=e=>controller.enqueue(new TextEncoder().encode(JSON.stringify({protocol:'momo-easyinput/1',...e})+'\n'));
    const port={readable:new ReadableStream({start(c){controller=c}}),open:async()=>setTimeout(()=>emit({type:'hello',board:'easyinput-v2',firmware:'0.6.0',mic:'pcm16-usb-v1',wireless:true,device:'010203040506'}),10),close:async()=>{},writable:new WritableStream({write(data){const m=JSON.parse(new TextDecoder().decode(data).trim());if(m.type==='wireless_bind')emit({type:'wireless_state',id:m.id,ok:true,device:'010203040506',error:'none'})}})};
    Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port}});
    window.provisionWrites=[];let configured=false;
    const cfg={readValue:async()=>new DataView(Uint8Array.from([99,1,configured?4:1,1,2,3,4,5,6,...Array(12).fill(19),99]).buffer,1,20),writeValueWithResponse:async bytes=>{window.provisionWrites.push([...bytes]);if(bytes[1]+1===bytes[2]){configured=true;window.state={...window.state,connected:true};window.wirelessEmit('status',window.state)}}};
    const events={addEventListener(){},removeEventListener(){},startNotifications:async()=>{},readValue:async()=>new DataView(Uint8Array.from([1,0,0]).buffer)};
    const device={addEventListener(){},removeEventListener(){},gatt:{connect:async()=>({getPrimaryService:async()=>({getCharacteristic:async id=>id.endsWith('003')?cfg:events})}),disconnect(){}}};
    Object.defineProperty(navigator,'bluetooth',{value:{requestDevice:async()=>device}});
  });
  await setup(page,{connected:false,bound:false});await page.locator('#connection').click();await expect(page.locator('#connection')).toContainText('已连接');
  await page.locator('#settings-open').click();await page.locator('#wireless-bind').click();await expect(page.locator('#wireless-status')).toContainText('已绑定');
  await page.locator('#wireless-toggle').click();await page.keyboard.press('Escape');await page.locator('#connection').click();await page.locator('#bluetooth-connect').click();await expect(page.locator('#connection')).toContainText('已连接');
  await page.locator('#settings-open').click();await page.locator('#wireless-ssid').fill('My Wi-Fi');await page.locator('#wireless-password').fill('test-password');await page.locator('#wireless-form button').click();
  await expect(page.locator('#wireless-status')).toContainText('无线语音已连接');await expect(page.locator('#wireless-password')).toHaveValue('');
  expect(await page.evaluate(()=>window.provisionWrites.length)).toBe(2);
  expect(await page.evaluate(()=>window.wirelessCalls.find(c=>c.action==='provision').value.status)).toEqual([1,1,1,2,3,4,5,6,...Array(12).fill(19)]);
});
