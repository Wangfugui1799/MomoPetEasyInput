import test from 'node:test';
import assert from 'node:assert/strict';
import {KeyboardMicrophone} from '../app/keyboard-microphone.mjs';
import {parseEvent,PROTOCOL} from '../app/protocol.mjs';
import {loadVoiceInput,VOICE_INPUT_KEY} from '../app/voice-input.mjs';
function fake(){const commands=[];let callback;return {commands,subscribeMic(fn){callback=fn;return ()=>{callback=null}},emit(e){callback?.(e)},async requestMic(type,stream){commands.push({type,stream});return {type:'mic_state',stream,ok:true,active:type!=='mic_stop'}}}}
const frame=(stream,seq,pcm=Buffer.alloc(256).toString('base64'))=>({protocol:PROTOCOL,type:'mic_audio',stream,seq,pcm});
test('mic parser enforces capability, exact PCM length, sequence range and acknowledgements',()=>{
  assert.equal(parseEvent(JSON.stringify({protocol:PROTOCOL,type:'hello',board:'easyinput-v2',firmware:'0.5.0',mic:'pcm16-usb-v1'})).mic,true);
  assert.equal(parseEvent(JSON.stringify(frame(1,0))).pcm.length,344);
  for(const e of [{stream:0},{seq:-1},{seq:2**32},{pcm:'!'.repeat(344)},{pcm:'AAAA'},{stream:1.1}])assert.equal(parseEvent(JSON.stringify({...frame(1,0),...e})),null);
  const state={protocol:PROTOCOL,type:'mic_state',id:0,stream:5,ok:false,active:false,error:'overrun',rate:16000};assert.equal(parseEvent(JSON.stringify(state)).error,'overrun');assert.equal(parseEvent(JSON.stringify({...state,rate:48000})),null);
});
test('PCM decoder is signed little endian and fails closed on dropped frames',async()=>{
  const c=fake(),frames=[],errors=[],mic=new KeyboardMicrophone(c,f=>frames.push(f),e=>errors.push(e));await mic.start();const stream=mic.stream;
  const bytes=Buffer.alloc(256);bytes.writeInt16LE(-32768);bytes.writeInt16LE(32767,2);c.emit(frame(stream,0,bytes.toString('base64')));
  assert.equal(frames[0][0],-1);assert.equal(frames[0][1],32767/32768);
  c.emit(frame(stream-1,1));assert.equal(frames.length,1);c.emit(frame(stream,2));assert.match(errors[0],/丢帧/);assert.equal(mic.stream,0);assert.equal(c.commands.at(-1).type,'mic_stop');mic.dispose();
});
test('stop while starting cancels timers; restart ignores old frames; disconnect stops',async()=>{
  const c=fake(),frames=[],errors=[],mic=new KeyboardMicrophone(c,f=>frames.push(f),e=>errors.push(e));const pending=mic.start(),old=mic.stream;mic.stop();await pending;assert.equal(mic.watch,undefined);
  await mic.start();c.emit(frame(old,0));assert.equal(frames.length,0);c.emit({type:'disconnected'});assert.match(errors[0],/断开/);assert.equal(mic.stream,0);mic.dispose();
});
test('missing input defaults to system; saved device is preserved without fallback',()=>{
  assert.equal(loadVoiceInput({getItem:()=>null}),'default');assert.equal(loadVoiceInput({getItem:()=>{throw Error()}}),'default');assert.equal(loadVoiceInput({getItem:key=>key===VOICE_INPUT_KEY?'easyinput':null}),'easyinput');assert.equal(loadVoiceInput({getItem:()=> 'missing-device'}),'missing-device');
});
