// Opt-in Electron + real VAD + real VTuber test using simulated USB PCM frames.
// This never opens a physical microphone/serial port. It is not board acceptance.
import {_electron as electron} from '@playwright/test';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const fixture=process.env.MOMO_VOICE_FIXTURE;if(!fixture)throw Error('Set MOMO_VOICE_FIXTURE to a synthetic mono WAV');
const wav=readFileSync(fixture).toString('base64');
const app=await electron.launch({args:[resolve('scripts/voice-electron-fixture.cjs'),'--mute-audio']});
try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#keys .key');
  await page.evaluate(async base64=>{
    navigator.mediaDevices.getUserMedia=async()=>{throw Error('USB input must not open computer microphone')};
    const ctx=new AudioContext({sampleRate:16000}),buffer=await ctx.decodeAudioData(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)).buffer);const samples=buffer.getChannelData(0);await ctx.close();
    window.usbCommands=[];window.usbPCMFrames=0;let controller,timer,heartbeat,offset=0,seq=0;
    const emit=e=>controller.enqueue(new TextEncoder().encode(JSON.stringify({protocol:'momo-easyinput/1',...e})+'\n'));
    window.usbEvent=emit;
    const port={readable:new ReadableStream({start(c){controller=c}}),open:async()=>{const hello=()=>emit({type:'hello',board:'easyinput-v2',firmware:'0.5.0',mic:'pcm16-usb-v1'});setTimeout(hello,10);heartbeat=setInterval(hello,2000)},close:async()=>{clearInterval(timer);clearInterval(heartbeat)},writable:new WritableStream({write(bytes){const m=JSON.parse(new TextDecoder().decode(bytes).trim());window.usbCommands.push(m);if(m.type==='mic_start'){offset=0;seq=0;timer=setInterval(()=>{const bytes=new Uint8Array(256),view=new DataView(bytes.buffer);for(let i=0;i<128;i++){const s=Math.max(-1,Math.min(1,samples[offset++]||0));view.setInt16(i*2,Math.round(s*32767),true)}window.usbPCMFrames++;emit({type:'mic_audio',stream:m.stream,seq:seq++,pcm:btoa(String.fromCharCode(...bytes))})},8)}if(m.type==='mic_stop')clearInterval(timer);emit({type:'mic_state',id:m.id,stream:m.stream,rate:16000,ok:true,active:m.type!=='mic_stop',error:'none'})}})};
    Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port}});
  },wav);
  await page.locator('#settings-open').click();await page.locator('#voice-input').selectOption('easyinput');await page.locator('#settings-dialog .close-dialog').click();await page.locator('#connection').click();await page.waitForFunction(()=>document.querySelector('#connection').classList.contains('connected'));
  await page.evaluate(()=>{window.usbEvent({type:'key',key:5});window.usbEvent({type:'press'})});
  for(let turn=1;turn<=3;turn++){
    await page.waitForFunction(()=>['listening','error'].includes(document.querySelector('#voice-status').dataset.state),{},{timeout:60000});
    if(await page.locator('#voice-status').getAttribute('data-state')==='error')throw Error(await page.locator('#voice-status').textContent());
    if(turn===1)await page.getByRole('button',{name:'关闭聊天',exact:true}).click();
    await page.waitForFunction(turn=>document.querySelectorAll('.message.user').length>=turn||document.querySelector('#voice-status').dataset.state==='error',turn,{timeout:60000});
    await page.waitForFunction(()=>['listening','error'].includes(document.querySelector('#voice-status').dataset.state),{},{timeout:90000});
    if(await page.locator('#voice-status').getAttribute('data-state')==='error')throw Error(await page.locator('#voice-status').textContent());
    console.log('Real VAD/backend with simulated USB: completed turn '+turn);
  }
  await page.locator('#voice-stop').click();
  const result=await page.evaluate(()=>({pcmFrames:window.usbPCMFrames,starts:window.usbCommands.filter(m=>m.type==='mic_start').length,stops:window.usbCommands.filter(m=>m.type==='mic_stop').length,messages:[...document.querySelectorAll('.message')].map(e=>e.textContent)}));
  console.log(JSON.stringify({...result,errors},null,2));if(errors.length||result.starts!==result.stops)throw Error('Cleanup or renderer failed');
}finally{await app.close()}
