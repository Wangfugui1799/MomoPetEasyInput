import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {resolve} from 'node:path';
import protocol from '../desktop/wireless-protocol.cjs';
import receiverModule from '../desktop/wireless-receiver.cjs';
const binary=resolve('.cache/wireless-interop');
const pair={device:'010203040506',key:'42'.repeat(32)};
const network={ssid:'测试 WiFi',password:'test-password',host:'192.168.1.8'};
const chunks=protocol.provisioningChunks(pair.key,[1,1,1,2,3,4,5,6,...Array(12).fill(19)],network);
const ciphertext=Buffer.concat(chunks.map(c=>Buffer.from(c.slice(3))));
const decrypted=spawnSync(binary,[],{input:ciphertext,encoding:'utf8'});
assert.equal(decrypted.status,0,decrypted.stderr);assert.deepEqual(JSON.parse(decrypted.stdout),{...network,port:4786});
ciphertext[0]^=1;assert.equal(spawnSync(binary,[],{input:ciphertext}).status,2);
console.log('Actual firmware crypto: Electron/Node AES-GCM payload decoded by Mbed TLS; tampering rejected');
const receiver=new receiverModule.WirelessReceiver();await receiver.start(pair,'127.0.0.1',0);
let child;const timeout=setTimeout(()=>{child?.kill();void receiver.stop()},15000);
try{
  const connected=once(receiver,'status');child=spawn(binary,[String(receiver.status.port)],{stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  const exited=once(child,'exit');await connected;assert.equal(receiver.status.connected,true);
  for(let stream=1;stream<=3;stream++){
    const frame=new Promise(resolve=>{const handler=e=>{if(e.type==='mic_audio'){receiver.off('mic',handler);resolve(e)}};receiver.on('mic',handler)});
    assert.equal((await receiver.request('mic_start',stream)).active,true);
    assert.equal((await frame).stream,stream);assert.equal((await receiver.request('mic_stop',stream)).active,false);
  }
  const [code]=await exited;assert.equal(code,0,output);console.log(output.trim());
}finally{clearTimeout(timeout);child?.kill();await receiver.stop()}
