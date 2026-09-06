import {LineDecoder,PROTOCOL} from './protocol.mjs';
export class KeyboardConnection {
  constructor(onEvent,onStatus){this.onEvent=onEvent;this.onStatus=onStatus;this.port=null;this.reader=null;this.verified=false;this.busy=false;this.epoch=0;this.soundSupported=false;this.pending=new Map();this.nextId=Math.floor(Math.random()*1000000000)+1}
  async connect() {
    if(this.busy||this.port)return;
    if(!navigator.serial){this.onStatus('error','请使用 Momo 桌面版或 Chrome 连接键盘');return}
    this.busy=true;const epoch=++this.epoch;
    try {
      const port=await navigator.serial.requestPort();
      await port.open({baudRate:115200});
      if(epoch!==this.epoch){await port.close();return}
      this.port=port;this.lastHello=0;this.verified=false;
      this.onStatus('waiting','正在确认 Momo 固件…');
      this.timer=setTimeout(()=>{if(!this.verified)this.disconnect('没有收到 Momo 固件握手，请先安装本项目固件')},5000);
      this.watch=setInterval(()=>{if(this.verified && Date.now()-this.lastHello>6000)this.disconnect('键盘失去响应，请重新连接')},2000);
      this.readPromise=this.readLoop(port,epoch);
    }catch(e){this.onStatus('error',e.name==='NotFoundError'?'已取消连接':`连接失败：${e.message}`)}
    finally{this.busy=false}
  }
  async readLoop(port,epoch) {
    const decoder=new TextDecoder();const lines=new LineDecoder();
    try {
      this.reader=port.readable.getReader();
      while(epoch===this.epoch){
        const {value,done}=await this.reader.read();if(done)break;
        for(const e of lines.push(decoder.decode(value,{stream:true}))){
          if(e.type==='hello'){this.soundSupported=e.sound;this.verified=true;this.lastHello=Date.now();clearTimeout(this.timer);this.onStatus('connected',`EasyInput · ${e.firmware}`)}
          else if(this.verified&&e.type==='sound_state'){
            const pending=this.pending.get(e.id);if(pending){clearTimeout(pending.timer);this.pending.delete(e.id);pending.resolve(e)}
          }else if(this.verified)this.onEvent(e);
        }
      }
    }catch{if(epoch===this.epoch)this.onStatus('error','键盘已断开，点击重新连接')}
    finally {
      this.rejectRequests('键盘已断开，设置状态未知，请重新连接确认');this.soundSupported=false;
      try{await this.writer?.abort()}catch{}
      try{await this.writePromise}catch{}
      try{this.reader?.releaseLock()}catch{}this.reader=null;
      try{await port.close()}catch{}
      if(epoch===this.epoch){this.port=null;this.verified=false;clearTimeout(this.timer);clearInterval(this.watch);this.onStatus('disconnected','键盘已断开，点击重新连接')}
    }
  }
  rejectRequests(message){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error(message))}this.pending.clear()}
  requestSound(type,settings={}){
    if(!this.verified||!this.port?.writable||!this.soundSupported)return Promise.reject(Error('请连接支持操作音效的新版固件'));
    if(this.pending.size||this.writer)return Promise.reject(Error('上一项设置正在处理，请稍后重试'));
    if(!['sound_get','sound_set','sound_preview'].includes(type))return Promise.reject(Error('无效命令'));
    if(type==='sound_set'&&(typeof settings.enabled!=='boolean'||!Number.isInteger(settings.volume)||settings.volume<0||settings.volume>100))return Promise.reject(Error('无效音量设置'));
    const id=this.nextId=this.nextId%2147483647+1;
    const frame={protocol:PROTOCOL,type,id,...(type==='sound_set'?{enabled:settings.enabled,volume:settings.volume}:{})};
    const promise=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('设备确认超时，设置状态未知，请重新连接确认'));void this.disconnect('设备确认超时，请重新连接')},3000);
      this.pending.set(id,{resolve,reject,timer});
    });
    this.writePromise=(async()=>{
      try{this.writer=this.port.writable.getWriter();await this.writer.write(new TextEncoder().encode('\n'+JSON.stringify(frame)+'\n'))}
      catch{this.rejectRequests('发送失败，设置未确认，请重新连接')}
      finally{try{this.writer?.releaseLock()}catch{}this.writer=null}
    })();
    return promise;
  }
  async disconnect(message='键盘已断开') {
    this.busy=true;
    ++this.epoch;clearTimeout(this.timer);clearInterval(this.watch);this.verified=false;this.soundSupported=false;this.rejectRequests(message);
    try{await this.reader?.cancel()}catch{}
    await this.readPromise;
    // The read loop owns releaseLock/close; do not race a second close with it.
    this.port=null;this.busy=false;this.onStatus('disconnected',message);
  }
}
