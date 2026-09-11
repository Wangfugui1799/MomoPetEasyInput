import test from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import {once} from 'node:events';
import {createDecipheriv} from 'node:crypto';
import protocol from '../desktop/wireless-protocol.cjs';
import receiverModule from '../desktop/wireless-receiver.cjs';
import managerModule from '../desktop/wireless-manager.cjs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const {derive,provisioningChunks,validateNetwork,CIPHER,PROTOCOL}=protocol;
const {WirelessReceiver}=receiverModule;
const pair={device:'010203040506',key:'42'.repeat(32)};
const network={ssid:'测试 WiFi',password:'test-password',host:'192.168.1.8'};

test('binding commits only the selected device and reloads through safe storage',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'momo-pair-test-'));
  // A reversible test double verifies safeStorage is used, not OS cryptography itself.
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(b=>b^90),decryptString:b=>Buffer.from(b).map(v=>v^90).toString()};
  const make=()=>new managerModule.WirelessManager({directory,safeStorage,send:()=>{}});
  try{
    const manager=make();await manager.init();assert.equal(manager.status().bound,false);
    const pending=await manager.action('prepareBind',pair.device);
    assert.equal(pending.key.length,64);assert.equal(manager.status().bound,false);
    await assert.rejects(manager.action('commitBind','112233445566'));
    assert.equal((await manager.action('commitBind',pair.device)).bound,true);
    assert.equal((await readFile(path.join(directory,'wireless-pair.enc'))).includes(Buffer.from(pending.key)),false);
    const reloaded=make();await reloaded.init();assert.deepEqual(reloaded.pair,pending);assert.equal(reloaded.status().listening,false);
    assert.equal('key' in reloaded.status(),false);
    await assert.rejects(reloaded.action('start','8.8.8.8'));
    reloaded.receiver.status.listening=true;reloaded.receiver.status.host=network.host;
    await assert.rejects(reloaded.action('provision',{status:[1,1,...Array(18).fill(0)],network}));
  }finally{await rm(directory,{recursive:true,force:true})}
});

test('renderer backlog is bounded and invalid acknowledgements cannot clear it',async()=>{
  const events=[];let destroyed=0;
  const manager=new managerModule.WirelessManager({send:(kind,event)=>events.push({kind,event})});
  manager.receiver.socket={destroy:()=>destroyed++};
  for(let i=0;i<64;i++)manager.receiver.emit('mic',{type:'mic_audio'});
  await manager.action('ack',65);await manager.action('ack',-1);
  manager.receiver.emit('mic',{type:'mic_audio'});assert.equal(destroyed,1);assert.equal(events.length,64);
  await manager.action('ack',64);manager.receiver.emit('mic',{type:'mic_audio'});assert.equal(events.at(-1).event.delivery,65);
});

test('BLE provisioning uses authenticated encryption and bounded 20-byte fragments',()=>{
  const status=[1,1,1,2,3,4,5,6,...Array(12).fill(19)];
  const chunks=provisioningChunks(pair.key,status,network);
  const payload=Buffer.concat(chunks.map((c,i)=>{assert.equal(c[1],i);assert.equal(c[2],chunks.length);assert.ok(c.length<=20);return Buffer.from(c.slice(3))}));
  const decrypt=(bytes,nonce=status.slice(8))=>{const d=createDecipheriv('aes-256-gcm',derive(pair.key,'momo-ble-v1'),Buffer.from(nonce));d.setAAD(Buffer.from('momo-provision-v1'));d.setAuthTag(bytes.subarray(-16));return Buffer.concat([d.update(bytes.subarray(0,-16)),d.final()])};
  assert.deepEqual(JSON.parse(decrypt(payload)),{...network,port:4786});
  const tampered=Buffer.from(payload);tampered[0]^=1;assert.throws(()=>decrypt(tampered));
  assert.throws(()=>decrypt(payload,Array(12).fill(20))); // consumed challenge cannot be replayed
  assert.notDeepEqual(derive(pair.key,'momo-ble-v1'),derive(pair.key,'momo-wifi-v1'));
  for(const patch of [{host:'8.8.8.8'},{host:'127.0.0.1'},{ssid:'你'.repeat(11)},{password:'short'},{password:'12345678\n'}])assert.throws(()=>validateNetwork({...network,...patch}));
});

async function board(receiver,key=pair.key){
  const socket=tls.connect({host:'127.0.0.1',port:receiver.status.port,minVersion:'TLSv1.2',maxVersion:'TLSv1.2',ciphers:CIPHER,checkServerIdentity:()=>undefined,
    pskCallback:()=>({identity:pair.device,psk:derive(key,'momo-wifi-v1')})});
  socket.on('error',()=>{});await once(socket,'secureConnect');return socket;
}
const send=(socket,event)=>socket.write(JSON.stringify({protocol:PROTOCOL,...event})+'\n');
const hello={type:'hello',device:pair.device,board:'easyinput-v2',firmware:'0.6.0',mic:'pcm16-wifi-v1'};
test('real TLS authenticates a board, transfers three PCM turns, and stops on disconnect',async()=>{
  const receiver=new WirelessReceiver();await receiver.start(pair,'127.0.0.1',0);let socket;
  try{
    socket=await board(receiver);const connected=once(receiver,'status');send(socket,hello);await connected;
    assert.equal(receiver.status.connected,true);assert.equal(socket.getCipher().standardName,'TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256');
    let input='';socket.on('data',chunk=>{input+=chunk;let n;while((n=input.indexOf('\n'))>=0){const m=JSON.parse(input.slice(0,n));input=input.slice(n+1);if(!m.type.startsWith('mic_'))continue;send(socket,{type:'mic_state',id:m.id,stream:m.stream,active:m.type!=='mic_stop',ok:true,rate:16000,error:'none'})}});
    for(let stream=1;stream<=3;stream++){
      assert.equal((await receiver.request('mic_start',stream)).active,true);
      const data=once(receiver,'mic');send(socket,{type:'mic_audio',stream,seq:0,pcm:Buffer.alloc(256).toString('base64')});
      assert.equal((await data)[0].pcm.length,344);
      assert.equal((await receiver.request('mic_stop',stream)).active,false);
    }
    const disconnected=once(receiver,'status');socket.destroy();await disconnected;assert.equal(receiver.status.connected,false);
    await assert.rejects(receiver.request('mic_start',4));
  }finally{socket?.destroy();await receiver.stop()}
});
test('wrong TLS secret and malformed application data cannot inject audio',async()=>{
  const receiver=new WirelessReceiver();await receiver.start(pair,'127.0.0.1',0);let socket;let events=0;receiver.on('mic',e=>{if(e.type==='mic_audio')events++});
  try{
    await assert.rejects(board(receiver,'43'.repeat(32)));
    socket=await board(receiver);const closed=once(socket,'close');send(socket,{type:'mic_audio',stream:1,seq:0,pcm:Buffer.alloc(256).toString('base64')});await closed;
    assert.equal(events,0);
  }finally{socket?.destroy();await receiver.stop()}
});
