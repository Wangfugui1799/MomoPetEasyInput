// Opt-in renderer integration test. Feeds a synthetic WAV via Web Audio,
// not the computer microphone. Requires the real local VTuber backend.
import {_electron as electron} from '@playwright/test';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const fixture=process.env.MOMO_VOICE_FIXTURE;if(!fixture)throw Error('Set MOMO_VOICE_FIXTURE to a synthetic WAV');
const wav=readFileSync(fixture).toString('base64');
const app=await electron.launch({args:[resolve('scripts/voice-electron-fixture.cjs'),'--mute-audio']});
try{
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('#keys .key');
 await page.evaluate(base64=>{
   window.syntheticTracks=[];
   navigator.mediaDevices.getUserMedia=async()=>{
     const ctx=new AudioContext();await ctx.resume();
     const buffer=await ctx.decodeAudioData(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)).buffer);
     const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
     const destination=ctx.createMediaStreamDestination();source.connect(destination);source.start();
     for(const track of destination.stream.getTracks()){
       const stop=track.stop.bind(track);track.stop=()=>{stop();try{source.stop()}catch{}ctx.close().catch(()=>{})};window.syntheticTracks.push(track);
     }
     return destination.stream;
   };
 },wav);
 await page.getByRole('button',{name:'5 聊天',exact:true}).click();await page.locator('#confirm').click();await page.locator('#voice-toggle').click();
 await page.waitForFunction(()=>['listening','error'].includes(document.querySelector('#voice-status').dataset.state),{},{timeout:60000});
 const status=await page.locator('#voice-status').textContent();console.log(status);if(!status.includes('正在听'))throw Error(status);
 await page.getByRole('button',{name:'关闭聊天',exact:true}).click();
 if(await page.locator('#chat-dialog').isVisible()||!(await page.locator('#voice-panel').isVisible()))throw Error('Background voice panel missing');
 await page.waitForFunction(()=>document.querySelectorAll('.message.user').length>0||document.querySelector('#voice-status').dataset.state==='error',{},{timeout:60000});
 await page.waitForFunction(()=>['listening','error'].includes(document.querySelector('#voice-status').dataset.state),{},{timeout:90000});
 if(await page.locator('#voice-status').getAttribute('data-state')==='error')throw Error(await page.locator('#voice-status').textContent());
 await page.screenshot({path:'docs/momo-voice-background.png'});
 await page.locator('#voice-reopen').click();if(!(await page.locator('#chat-dialog').isVisible()))throw Error('Unable to reopen chat');
 await page.getByRole('button',{name:'关闭聊天',exact:true}).click();await page.locator('#voice-stop').click();
 const released=await page.evaluate(()=>window.syntheticTracks.every(t=>t.readyState==='ended'));
 console.log(JSON.stringify({status:await page.locator('#voice-status').textContent(),messages:await page.locator('.message').allTextContents(),released,errors},null,2));
 if(errors.length||!released)throw Error('Renderer or cleanup failed');
}finally{await app.close()}
