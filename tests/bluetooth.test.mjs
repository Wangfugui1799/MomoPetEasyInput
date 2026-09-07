import test from 'node:test';
import assert from 'node:assert/strict';
import {BluetoothConnection,decodeBluetooth,BLE_SERVICE,BLE_EVENT} from '../app/bluetooth.mjs';
import policy from '../desktop/serial-policy.cjs';
const packet=(...bytes)=>new DataView(Uint8Array.from(bytes).buffer);
test('BLE packets validate version, length, key range and signed rotation',()=>{
 for(let key=1;key<=8;key++)assert.deepEqual(decodeBluetooth(packet(1,1,key)),{type:'key',key});
 assert.deepEqual(decodeBluetooth(packet(1,2,255)),{type:'rotate',delta:-1});
 assert.deepEqual(decodeBluetooth(packet(1,3,0)),{type:'press'});
 assert.deepEqual(decodeBluetooth(packet(1,4,0)),{type:'long_press'});
 for(const data of [[2,1,1],[1,1,0],[1,1,9],[1,2,2],[1,0,1],[1,3],[1,3,0,0]])assert.equal(decodeBluetooth(packet(...data)),null);
});
test('BLE verifies handshake before input and removes notifications on disconnect',async()=>{
 const characteristic=new EventTarget();characteristic.startNotifications=async()=>characteristic;characteristic.readValue=async()=>packet(1,0,0);
 const device=new EventTarget();let disconnected=0;
 device.gatt={connect:async()=>({getPrimaryService:async uuid=>{assert.equal(uuid,BLE_SERVICE);return {getCharacteristic:async uuid=>{assert.equal(uuid,BLE_EVENT);return characteristic}}}}),disconnect:()=>{disconnected++}};
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{bluetooth:{requestDevice:async options=>{assert.deepEqual(options,{filters:[{services:[BLE_SERVICE]}]});return device}}}});
 const events=[],statuses=[];const connection=new BluetoothConnection(e=>events.push(e),(s)=>statuses.push(s));
 try{
  connection.receive(packet(1,1,1));assert.equal(events.length,0);
  await connection.connect();assert.equal(connection.verified,true);assert.equal(connection.port,device);
  const event=new Event('characteristicvaluechanged');characteristic.value=packet(1,2,255);characteristic.dispatchEvent(event);
  assert.deepEqual(events,[{type:'rotate',delta:-1}]);
  await connection.disconnect();characteristic.dispatchEvent(event);assert.equal(events.length,1);assert.equal(disconnected,1);assert.equal(connection.verified,false);
  assert.deepEqual(statuses,['waiting','connected','disconnected']);
 }finally{await connection.disconnect();if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator}
});
test('Bluetooth access remains limited to the owning local application',()=>{
 const origin='http://127.0.0.1:4784';assert.equal(policy.allowSerial({id:7},'bluetooth',origin,7,origin),true);
 assert.equal(policy.allowSerial({id:8},'bluetooth',origin,7,origin),false);
 assert.equal(policy.allowSerial({id:7},'bluetooth','https://example.com',7,origin),false);
});
test('battery telemetry supports unknown and rejects invalid percentages',()=>{
 assert.deepEqual(decodeBluetooth(packet(1,5,85)),{type:'battery',percent:85});
 assert.deepEqual(decodeBluetooth(packet(1,5,255)),{type:'battery',percent:-1});
 assert.equal(decodeBluetooth(packet(1,5,101)),null);
});
