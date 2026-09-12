const {networkInterfaces}=require('node:os');
const {randomBytes}=require('node:crypto');
const {readFile,writeFile,mkdir,rename}=require('node:fs/promises');
const path=require('node:path');
const {WirelessReceiver}=require('./wireless-receiver.cjs');
const {privateIPv4,deviceId,provisioningChunks}=require('./wireless-protocol.cjs');

class WirelessManager {
  constructor({directory,safeStorage,send}){
    Object.assign(this,{directory,safeStorage,send});this.receiver=new WirelessReceiver();this.delivered=0;this.acknowledged=0;this.audioQueue=[];this.audioPaused=false;this.audioFailed=false;
    this.receiver.on('status',()=>{if(!this.receiver.status.connected){this.acknowledged=this.delivered;this.audioQueue=[];this.audioPaused=false;this.audioFailed=false}send('status',this.status())});
    this.receiver.on('mic',event=>{
      if(event.type==='mic_audio'){
        if(this.audioFailed)return;
        // A TLS data callback can contain many frames; renderer ACKs only run
        // after it yields. Pause TCP and bound the remainder of that callback.
        if(this.delivered-this.acknowledged>=64){
          if(this.audioQueue.length>=128){this.audioFailed=true;this.audioQueue=[];this.receiver.disconnect('无线音频处理积压，请关闭占用资源的程序后重试。');return}
          this.audioQueue.push(event);
        }else this.deliverAudio(event);
      }else send('mic',event);
    });
  }
  deliverAudio(event){
    this.send('mic',{...event,delivery:++this.delivered});
    if(this.delivered-this.acknowledged>=64&&!this.audioPaused){this.audioPaused=true;this.receiver.socket?.pause()}
  }
  drainAudio(){
    if(this.audioFailed)return;
    while(this.audioQueue.length&&this.delivered-this.acknowledged<64)this.deliverAudio(this.audioQueue.shift());
    if(this.audioPaused&&!this.audioQueue.length&&this.delivered-this.acknowledged<32){this.audioPaused=false;this.receiver.socket?.resume()}
  }
  addresses(){return Object.entries(networkInterfaces()).flatMap(([name,list])=>list.filter(a=>a.family==='IPv4'&&!a.internal&&privateIPv4(a.address)).map(a=>({name,host:a.address})))}
  status(){return {...this.receiver.status,bound:!!this.pair,device:this.pair?.device,addresses:this.addresses(),autoReceive:this.receivePreference?.enabled===true}}
  async init(){
    try{const data=await readFile(path.join(this.directory,'wireless-pair.enc'));const pair=JSON.parse(this.safeStorage.decryptString(data));if(!deviceId(pair.device)||!/^[0-9a-f]{64}$/.test(pair.key))throw Error();this.pair=pair}
    catch(e){if(e.code!=='ENOENT')this.loadError='绑定信息无法读取，请通过 USB 重新绑定'}
    try{
      const pref=JSON.parse(await readFile(path.join(this.directory,'wireless-receiver.json'),'utf8'));
      if(pref.version!==1||typeof pref.enabled!=='boolean'||!privateIPv4(pref.host))throw Error();
      this.receivePreference=pref;
    }catch(e){if(e.code!=='ENOENT')this.receiver.publish({error:'无线自动接收设置无法读取，请重新开启无线接收'})}
  }
  async saveReceivePreference(enabled,host){
    const pref={version:1,enabled,host};
    await mkdir(this.directory,{recursive:true});
    const file=path.join(this.directory,'wireless-receiver.json');
    await writeFile(file+'.tmp',JSON.stringify(pref),{mode:0o600});await rename(file+'.tmp',file);
    this.receivePreference=pref;
  }
  async restoreReceiver(){
    // Restore only the previously selected private interface, never all NICs.
    // No microphone command is sent here; recording still requires user intent.
    const pref=this.receivePreference;
    if(!pref?.enabled||!this.pair||this.receiver.server)return;
    if(!this.addresses().some(a=>a.host===pref.host)){
      this.receiver.publish({error:'上次的 Mac 地址暂不可用。联网后重新开启无线接收；地址变化时需重新配网。'});return;
    }
    try{await this.receiver.start(this.pair,pref.host)}catch(e){this.receiver.publish({error:e.message})}
  }
  async action(action,value){
    if(action==='ack'){
      if(Number.isSafeInteger(value)&&value>this.acknowledged&&value<=this.delivered){this.acknowledged=value;this.drainAudio()}
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
      await this.receiver.start(this.pair,value);
      try{await this.saveReceivePreference(true,value)}catch{await this.receiver.stop();throw Error('自动接收设置保存失败，请重试')}
      return this.status();
    }
    if(action==='stop'){
      const host=this.receiver.status.host||this.receivePreference?.host;
      await this.receiver.stop();
      if(host)try{await this.saveReceivePreference(false,host)}catch{throw Error('接收已关闭，但自动接收设置保存失败，请重试')}
      return this.status();
    }
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
