import {LineDecoder} from './protocol.mjs';
export class KeyboardConnection {
  constructor(onEvent,onStatus){this.onEvent=onEvent;this.onStatus=onStatus;this.port=null;this.reader=null;this.verified=false;this.busy=false;this.epoch=0}
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
          if(e.type==='hello'){this.verified=true;this.lastHello=Date.now();clearTimeout(this.timer);this.onStatus('connected',`EasyInput · ${e.firmware}`)}
          else if(this.verified)this.onEvent(e);
        }
      }
    }catch{if(epoch===this.epoch)this.onStatus('error','键盘已断开，点击重新连接')}
    finally {
      try{this.reader?.releaseLock()}catch{}this.reader=null;
      try{await port.close()}catch{}
      if(epoch===this.epoch){this.port=null;this.verified=false;clearTimeout(this.timer);clearInterval(this.watch);this.onStatus('disconnected','键盘已断开，点击重新连接')}
    }
  }
  async disconnect(message='键盘已断开') {
    this.busy=true;
    ++this.epoch;clearTimeout(this.timer);clearInterval(this.watch);this.verified=false;
    try{await this.reader?.cancel()}catch{}
    await this.readPromise;
    // The read loop owns releaseLock/close; do not race a second close with it.
    this.port=null;this.busy=false;this.onStatus('disconnected',message);
  }
}
