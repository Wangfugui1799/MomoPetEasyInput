export const BLE_SERVICE='4d4d0000-0000-0000-0000-000000000001';
export const BLE_EVENT='4d4d0000-0000-0000-0000-000000000002';
export function decodeBluetooth(value){
 if(value.byteLength!==3||value.getUint8(0)!==1)return null;
 const type=value.getUint8(1),v=value.getInt8(2);
 if(type===5&&(value.getUint8(2)<=100||value.getUint8(2)===255))return {type:'battery',percent:value.getUint8(2)===255?-1:value.getUint8(2)};
 if(type===0&&v===0)return {type:'hello'};
 if(type===1&&v>=1&&v<=8)return {type:'key',key:v};
 if(type===2&&(v===1||v===-1))return {type:'rotate',delta:v};
 if(type===3&&v===0)return {type:'press'};
 if(type===4&&v===0)return {type:'long_press'};
 return null;
}
export class BluetoothConnection {
 constructor(onEvent,onStatus){this.onEvent=onEvent;this.onStatus=onStatus;this.epoch=0;this.soundSupported=false;this.pending=new Map()}
 requestSound(){return Promise.reject(Error('蓝牙模式下请通过 USB 调整键盘音效'))}
 async connect(){
  if(this.busy||this.port)return;
  if(!navigator.bluetooth){this.onStatus('error','请使用 Momo 桌面版或 Chrome 连接蓝牙');return}
  this.busy=true;const epoch=++this.epoch;
  try{
   const device=await navigator.bluetooth.requestDevice({filters:[{services:[BLE_SERVICE]}]});
   if(epoch!==this.epoch)return;
   this.device=device;this.lost=()=>this.disconnect('蓝牙已断开，点击重新连接');device.addEventListener('gattserverdisconnected',this.lost);
   this.onStatus('waiting','正在连接 Momo 蓝牙…');
   this.timer=setTimeout(()=>{if(epoch===this.epoch)this.disconnect('蓝牙连接超时，请重新连接')},15000);
   const server=await device.gatt.connect();
   if(epoch!==this.epoch){device.gatt.disconnect();return}
   const service=await server.getPrimaryService(BLE_SERVICE);
   const characteristic=await service.getCharacteristic(BLE_EVENT);
   if(epoch!==this.epoch)return;
   this.characteristic=characteristic;
   this.notify=e=>{if(epoch===this.epoch)this.receive(e.target.value)};
   characteristic.addEventListener('characteristicvaluechanged',this.notify);
   await characteristic.startNotifications();
   if(epoch!==this.epoch)return;
   this.port=device;
   clearTimeout(this.timer);
   this.timer=setTimeout(()=>{if(!this.verified)this.disconnect('未收到 Momo 蓝牙握手')},5000);
   this.watch=setInterval(()=>{if(this.verified&&Date.now()-this.lastHello>6000)this.disconnect('蓝牙失去响应，请重新连接')},2000);
   const hello=await characteristic.readValue();
   if(epoch===this.epoch)this.receive(hello);
  }catch(e){if(epoch===this.epoch)await this.disconnect(e.name==='NotFoundError'?'已取消蓝牙连接':`蓝牙连接失败：${e.message}`)}
  finally{if(epoch===this.epoch)this.busy=false}
 }
 receive(value){const e=decodeBluetooth(value);if(!e)return;if(e.type==='hello'){this.lastHello=Date.now();this.verified=true;clearTimeout(this.timer);this.onStatus('connected','EasyInput · 蓝牙')}else if(this.verified)this.onEvent(e)}
 async disconnect(message='蓝牙已断开'){
  ++this.epoch;clearTimeout(this.timer);clearInterval(this.watch);
  this.characteristic?.removeEventListener('characteristicvaluechanged',this.notify);
  this.device?.removeEventListener('gattserverdisconnected',this.lost);
  this.device?.gatt.disconnect();this.device=null;this.characteristic=null;this.port=null;this.verified=false;this.busy=false;this.onStatus('disconnected',message);
 }
}
