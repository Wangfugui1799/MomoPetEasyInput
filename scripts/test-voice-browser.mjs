// Opt-in real-backend smoke test. Uses a synthetic WAV through Chromium's
// fake microphone, never records the user's microphone. Requires VTuber running.
import {chromium} from '@playwright/test';
import {startServer} from '../server.mjs';
import {existsSync} from 'node:fs';
const fixture=process.env.MOMO_VOICE_FIXTURE;
if(!fixture||!existsSync(fixture))throw Error('Set MOMO_VOICE_FIXTURE to a synthetic 16 kHz mono WAV');
const server=await startServer({port:0});let browser;
try{
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${fixture}`]});
  const page=await browser.newPage({viewport:{width:1280,height:950}});const errors=[],events=[];let inputs=0,acks=0,rounds=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('websocket',ws=>{
    ws.on('framesent',({payload})=>{const m=JSON.parse(payload);if(m.type==='mic-audio-end')inputs++;if(m.type==='frontend-playback-complete')acks++;});
    ws.on('framereceived',({payload})=>{const m=JSON.parse(payload);if(m.type==='user-input-transcription')events.push({transcription:m.text});if(m.type==='audio')events.push({text:m.display_text?.text,audio:!!m.audio});if(m.type==='control'&&m.text==='conversation-chain-end'){rounds++;console.log('Completed real backend turn '+rounds)}});
  });
  await page.goto(server.url);await page.keyboard.press('5');await page.keyboard.press('Enter');
  await page.screenshot({path:'docs/momo-voice-desktop.png'});
  await page.locator('#voice-toggle').click();
  const deadline=Date.now()+150000;
  while(rounds<3&&Date.now()<deadline){await page.waitForTimeout(500);if(await page.locator('#voice-status').getAttribute('data-state')==='error')throw Error(await page.locator('#voice-status').innerText())}
  if(rounds!==3)throw Error('Did not finish three real-backend rounds');
  await page.screenshot({path:'docs/momo-voice-live.png'});
  await page.locator('#voice-toggle').click();
  if(await page.locator('#voice-toggle').getAttribute('aria-pressed')!=='false')throw Error('Microphone did not stop');
  console.log(JSON.stringify({inputs,acks,rounds,errors,events},null,2));if(errors.length)throw Error('Browser errors');
}finally{await browser?.close();await server.close()}
