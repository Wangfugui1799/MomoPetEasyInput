const {networkInterfaces}=require('node:os');
const {randomBytes}=require('node:crypto');
const {readFile,writeFile,mkdir,rename}=require('node:fs/promises');
const path=require('node:path');
const {WirelessReceiver}=require('./wireless-receiver.cjs');
const {privateIPv4,deviceId,provisioningChunks}=require('./wireless-protocol.cjs');

class WirelessManager {
  constructor({directory,safeStorage,send}){
    Object.assign(this,{directory,safeStorage,send});this.receiver=new WirelessReceiver();this.delivered=0;this.acknowledged=0;
    this.receiver.on('status',()=>{if(!this.receiver.status.connected)this.acknowledged=this.delivered;send('status',this.status())});
    this.receiver.on('mic',event=>{
      if(event.type==='mic_audio'){
        if(this.delivered-this.acknowledged>=64){this.receiver.socket?.destroy();return}
        send('mic',{...event,delivery:++this.delivered});
      }else send('mic',event);
    });
  }
  addresses(){return Object.entries(networkInterfaces()).flatMap(([name,list])=>list.filter(a=>a.family==='IPv4'&&!a.internal&&privateIPv4(a.address)).map(a=>({name,host:a.address})))}
  status(){return {...this.receiver.status,bound:!!this.pair,device:this.pair?.device,addresses:this.addresses()}}
  async init(){
    try{const data=await readFile(path.join(this.directory,'wireless-pair.enc'));const pair=JSON.parse(this.safeStorage.decryptString(data));if(!deviceId(pair.device)||!/^[0-9a-f]{64}$/.test(pair.key))throw Error();this.pair=pair}
    catch(e){if(e.code!=='ENOENT')this.loadError='绑定信息无法读取，请通过 USB 重新绑定'}
  }
  async action(action,value){
    if(action==='ack'){
      if(Number.isSafeInteger(value)&&value>this.acknowledged&&value<=this.delivered)this.acknowledged=value;
      return;
    }
    if(action==='status')return {...this.status(),error:this.loadError||this.receiver.status.error};
    if(action==='prepareBind'){
      if(!deviceId(value))throw Error('请连接支持无线语音的 0.6.0 原生 USB 固件');
      if(!this.safeStorage.isEncryptionAvailable())throw Error('系统安全存储不可用，无法保存绑定');
      await this.receiver.stop();this.pending={device:value,key:randomBytes(32).toString('hex')};
      return {...this.pending};
    }
    if(action==='commitBind'){
      if(!this.pending||this.pending.device!==value)throw Error('绑定请求已失效，请重试');
      await mkdir(this.directory,{recursive:true});
      const file=path.join(this.directory,'wireless-pair.enc');
      await writeFile(file+'.tmp',this.safeStorage.encryptString(JSON.stringify(this.pending)),{mode:0o600});await rename(file+'.tmp',file);
      this.pair=this.pending;this.pending=null;this.loadError=null;return this.status();
    }
    if(action==='start'){
      if(!this.addresses().some(a=>a.host===value))throw Error('所选 Mac 网络地址已失效，请刷新');
      await this.receiver.start(this.pair,value);return this.status();
    }
    if(action==='stop'){await this.receiver.stop();return this.status()}
    if(action==='provision'){
      if(!this.pair||!this.receiver.status.listening)throw Error('请先绑定开发板并开启无线接收');
      if(!Array.isArray(value?.status)||value.status.length!==20||!value.status.every(b=>Number.isInteger(b)&&b>=0&&b<=255))throw Error('无效配网状态');
      if(Buffer.from(value.status.slice(2,8)).toString('hex')!==this.pair.device||value.status[1]===0)throw Error('蓝牙设备与已绑定开发板不一致');
      return provisioningChunks(this.pair.key,value.status,{...value.network,host:this.receiver.status.host});
    }
    if(action==='mic')return this.receiver.request(value?.type,value?.stream);
    throw Error('无效无线操作');
  }
}
module.exports={WirelessManager};
