import test from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import {once} from 'node:events';
import {createDecipheriv} from 'node:crypto';
import protocol from '../desktop/wireless-protocol.cjs';
import receiverModule from '../desktop/wireless-receiver.cjs';
import managerModule from '../desktop/wireless-manager.cjs';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const {derive,provisioningChunks,validateNetwork,CIPHER,PROTOCOL}=protocol;
const {WirelessReceiver}=receiverModule;
const pair={device:'010203040506',key:'42'.repeat(32)};
const network={ssid:'测试 WiFi',password:'test-password',host:'192.168.1.8'};

async function autoReceiveFixture(run){
  const directory=await mkdtemp(path.join(tmpdir(),'momo-auto-receive-test-'));
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
  const make=()=>{
    const manager=new managerModule.WirelessManager({directory,safeStorage,send:()=>{}});
    manager.addresses=()=>[{host:network.host}];manager.starts=[];
    manager.receiver.start=async(_pair,host)=>{manager.starts.push(host);manager.receiver.publish({listening:true,host})};
    manager.receiver.request=()=>{throw Error('automatic receive must never start recording')};
    return manager;
  };
  try{await run({directory,make})}finally{await rm(directory,{recursive:true,force:true})}
}

test('enabled receiver restores after application restart without starting the microphone',async()=>autoReceiveFixture(async({directory,make})=>{
  const first=make();await first.init();await first.restoreReceiver();assert.equal(first.starts.length,0);
  await first.action('prepareBind',pair.device);await first.action('commitBind',pair.device);
  await first.action('start',network.host);assert.equal(first.status().autoReceive,true);
  const saved=JSON.parse(await readFile(path.join(directory,'wireless-receiver.json'),'utf8'));
  assert.deepEqual(saved,{version:1,enabled:true,host:network.host});
  await first.receiver.stop(); // application exit is not an explicit opt-out
  const next=make();await next.init();await next.restoreReceiver();
  assert.deepEqual(next.starts,[network.host]);assert.equal(next.status().listening,true);
  assert.equal(next.status().connected,false); // listening is not a board handshake
}));

test('explicit receiver shutdown persists opt-out across restart',async()=>autoReceiveFixture(async({make})=>{
  const first=make();await first.init();await first.action('prepareBind',pair.device);await first.action('commitBind',pair.device);
  await first.action('start',network.host);await first.action('stop');
  assert.equal(first.status().autoReceive,false);
  const next=make();await next.init();await next.restoreReceiver();assert.deepEqual(next.starts,[]);
}));

test('automatic receive never switches interfaces when the saved address is unavailable',async()=>autoReceiveFixture(async({make})=>{
  const manager=make();manager.pair=pair;manager.receivePreference={version:1,enabled:true,host:'192.168.1.9'};
  await manager.restoreReceiver();assert.deepEqual(manager.starts,[]);assert.match(manager.status().error,/地址暂不可用/);
}));

test('automatic receive requires a binding and reports startup failure without claiming connection',async()=>autoReceiveFixture(async({make})=>{
  const manager=make();manager.receivePreference={version:1,enabled:true,host:network.host};
  await manager.restoreReceiver();assert.deepEqual(manager.starts,[]);
  manager.pair=pair;manager.receiver.start=async()=>{throw Error('端口占用')};
  await manager.restoreReceiver();assert.equal(manager.status().listening,false);assert.match(manager.status().error,/端口占用/);
}));

test('invalid persisted automatic receive settings fail closed',async()=>autoReceiveFixture(async({directory,make})=>{
  for(const data of ['invalid json',JSON.stringify({version:1,enabled:true,host:'0.0.0.0'}),JSON.stringify({version:1,enabled:'yes',host:network.host})]){
    await writeFile(path.join(directory,'wireless-receiver.json'),data);
    const manager=make();await manager.init();manager.pair=pair;await manager.restoreReceiver();
    assert.equal(manager.status().autoReceive,false);assert.deepEqual(manager.starts,[]);assert.match(manager.status().error,/设置无法读取/);
  }
}));

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

test('a coalesced Wi-Fi burst waits for renderer ACKs instead of disconnecting',async()=>{
  const events=[];let destroyed=0,paused=0,resumed=0;
  const manager=new managerModule.WirelessManager({send:(kind,event)=>events.push({kind,event})});
  manager.receiver.socket={destroy:()=>destroyed++,pause:()=>paused++,resume:()=>resumed++};
  // ACKs cannot run inside the synchronous receive loop for a coalesced burst.
  for(let seq=0;seq<96;seq++)manager.receiver.emit('mic',{type:'mic_audio',seq});
  assert.equal(destroyed,0,'ordinary batched delivery must not close the TLS session');
  assert.equal(events.length,64);assert.equal(paused,1);
  await manager.action('ack',64);assert.equal(events.length,96);
  await manager.action('ack',96);assert.equal(resumed,1);
  assert.deepEqual(events.map(x=>x.event.seq),Array.from({length:96},(_,i)=>i));
});

test('renderer backlog is bounded and invalid acknowledgements cannot clear it',async()=>{
  const events=[];let destroyed=0;
  const manager=new managerModule.WirelessManager({send:(kind,event)=>events.push({kind,event})});
  manager.receiver.socket={destroy:()=>destroyed++,pause:()=>{},resume:()=>{}};
  for(let i=0;i<64;i++)manager.receiver.emit('mic',{type:'mic_audio'});
  await manager.action('ack',65);await manager.action('ack',-1);
  for(let i=0;i<128;i++)manager.receiver.emit('mic',{type:'mic_audio'});
  assert.equal(destroyed,0);assert.equal(events.length,64);
  manager.receiver.emit('mic',{type:'mic_audio'});assert.equal(destroyed,1);
  assert.match(manager.receiver.disconnectReason,/积压/);
});

test('disconnect discards buffered audio and stale ACKs cannot reach a new connection',async()=>{
  const events=[];const socket={destroy:()=>{},pause:()=>{},resume:()=>{}};
  const manager=new managerModule.WirelessManager({send:(kind,event)=>{if(kind==='mic')events.push(event)}});
  manager.receiver.socket=socket;
  for(let seq=0;seq<96;seq++)manager.receiver.emit('mic',{type:'mic_audio',stream:1,seq});
  manager.receiver.publish({connected:false});manager.receiver.publish({connected:true});
  manager.receiver.emit('mic',{type:'mic_audio',stream:2,seq:0});
  await manager.action('ack',64);
  assert.equal(events.length,65);assert.equal(events.at(-1).stream,2);
  assert.equal(manager.acknowledged,64);assert.equal(manager.audioQueue.length,0);
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
test('real TLS backpressure preserves burst PCM across three turns with delayed renderer ACKs',async()=>{
  const received=[];const acknowledgements=new Set();let manager;
  manager=new managerModule.WirelessManager({send:(kind,event)=>{
    if(kind!=='mic'||event.type!=='mic_audio')return;
    received.push(event);
    const timer=setTimeout(()=>{acknowledgements.delete(timer);void manager.action('ack',event.delivery)},80);
    acknowledgements.add(timer);
  }});
  const receiver=manager.receiver;await receiver.start(pair,'127.0.0.1',0);let socket;
  try{
    socket=await board(receiver);const connected=once(receiver,'status');send(socket,hello);await connected;
    let input='';socket.on('data',chunk=>{input+=chunk;let n;while((n=input.indexOf('\n'))>=0){const m=JSON.parse(input.slice(0,n));input=input.slice(n+1);if(m.type==='wireless_ping'){send(socket,hello);continue}send(socket,{type:'mic_state',id:m.id,stream:m.stream,active:m.type!=='mic_stop',ok:true,rate:16000,error:'none'})}});
    for(let stream=1;stream<=3;stream++){
      await receiver.request('mic_start',stream);
      socket.write(Array.from({length:160},(_,seq)=>JSON.stringify({protocol:PROTOCOL,type:'mic_audio',stream,seq,pcm:Buffer.alloc(256).toString('base64')})+'\n').join(''));
      const deadline=Date.now()+2000;
      while(manager.acknowledged<stream*160&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
      assert.equal(manager.acknowledged,stream*160);assert.equal(receiver.status.connected,true);
      assert.deepEqual(received.filter(e=>e.stream===stream).map(e=>e.seq),Array.from({length:160},(_,i)=>i));
      assert.equal((await receiver.request('mic_stop',stream)).active,false);
    }
    const disconnected=once(receiver,'mic');receiver.disconnect('测试断开原因');
    assert.equal((await disconnected)[0].message,'测试断开原因');
  }finally{for(const timer of acknowledgements)clearTimeout(timer);socket?.destroy();await receiver.stop()}
});
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
