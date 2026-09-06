import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEvent,LineDecoder,PROTOCOL} from '../app/protocol.mjs';
import {KeyboardConnection} from '../app/serial.mjs';
const state={protocol:PROTOCOL,type:'sound_state',id:1,ok:true,enabled:true,volume:30,ready:true,error:'none',audio_error:'none',storage_error:'none'};
test('sound replies validate every state field and preserve stream recovery',()=>{
  assert.equal(parseEvent(JSON.stringify(state)).volume,30);
  for(const invalid of [{volume:101},{volume:-1},{volume:1.5},{enabled:1},{ready:1},{ok:'true'},{id:0},{id:2147483648},{audio_error:null}])assert.equal(parseEvent(JSON.stringify({...state,...invalid})),null);
  const d=new LineDecoder();assert.deepEqual(d.push('x'.repeat(513)+'\n'+JSON.stringify(state)+'\n'),[parseEvent(JSON.stringify(state))]);
});
test('settings require capable handshake; writes are framed and only matching replies resolve',async()=>{
  const k=new KeyboardConnection(()=>{},()=>{});await assert.rejects(k.requestSound('sound_get'));
  let readerController,written;
  const port={readable:new ReadableStream({start(c){readerController=c}}),writable:new WritableStream({write(bytes){written=new TextDecoder().decode(bytes)}}),close:async()=>{}};
  k.port=port;k.verified=true;k.soundSupported=true;k.readPromise=k.readLoop(port,0);
  const pending=k.requestSound('sound_set',{enabled:false,volume:42});
  await new Promise(r=>setTimeout(r,0));const command=JSON.parse(written.trim());assert.equal(command.type,'sound_set');assert.equal(command.volume,42);assert.ok(written.startsWith('\n'));
  readerController.enqueue(new TextEncoder().encode(JSON.stringify({...state,id:command.id+1})+'\n'));
  await new Promise(r=>setTimeout(r,0));assert.equal(k.pending.size,1);
  readerController.enqueue(new TextEncoder().encode(JSON.stringify({...state,id:command.id,enabled:false,volume:42})+'\n'));
  assert.equal((await pending).enabled,false);
  const next=k.requestSound('sound_get');const rejected=assert.rejects(next,/断开/);await k.disconnect();await rejected;assert.equal(k.pending.size,0);
});
test('failed serial write rejects without claiming settings saved',async()=>{
  const k=new KeyboardConnection(()=>{},()=>{});k.verified=k.soundSupported=true;
  k.port={writable:new WritableStream({write(){throw Error('unplugged')}})};
  await assert.rejects(k.requestSound('sound_set',{enabled:true,volume:30}),/发送失败/);
  assert.equal(k.pending.size,0);
});
