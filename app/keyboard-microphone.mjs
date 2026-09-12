// Bounded USB/Wi-Fi PCM transport. A new lease/sequence is used for every listen.
let nextStream=Math.floor(Math.random()*1000000000)+1;
export class KeyboardMicrophone {
  constructor(connection,onFrame,onError){Object.assign(this,{connection,onFrame,onError});this.stream=0;this.generation=0;this.unsubscribe=connection.subscribeMic(e=>this.receive(e))}
  async start(){
    const generation=++this.generation,stream=nextStream=nextStream%2147483647+1;
    try{
      // Wi-Fi stop replies can arrive after the next turn's playback completes.
      // Never open a new lease until the preceding one is confirmed closed.
      if(this.stopping)await this.stopping;
      if(this.generation!==generation)return;
      this.stream=stream;this.seq=0;this.lastFrame=Date.now();this.pinging=false;
      const reply=await this.connection.requestMic('mic_start',stream);
      if(this.generation!==generation)return;
      if(!reply.ok||!reply.active||reply.stream!==stream)throw Error('键盘麦克风启动失败：'+reply.error);
      this.watch=setInterval(()=>{if(Date.now()-this.lastFrame>1500)this.fail('键盘麦克风音频中断，请重新连接。')},500);
      this.ping=setInterval(()=>{if(this.pinging)return;this.pinging=true;void this.connection.requestMic('mic_ping',stream).then(r=>{if(this.generation===generation&&(!r.ok||!r.active||r.stream!==stream))this.fail('键盘麦克风已停止，请重试。')}).catch(e=>{if(this.generation===generation)this.fail(e.message)}).finally(()=>{if(this.generation===generation)this.pinging=false})},1000);
    }catch(e){if(this.generation===generation){this.stop();throw e}}
  }
  receive(e){
    if(!this.stream)return;
    if(e.type==='disconnected'){this.fail(e.message||'EasyInput 已断开，键盘麦克风已关闭。');return}
    if(e.stream!==this.stream)return;
    if(e.type==='mic_state'&&!e.ok){this.fail('键盘麦克风已停止：'+e.error);return}
    if(e.type!=='mic_audio')return;
    if(e.seq!==this.seq){this.fail('键盘音频丢帧，请检查连接后重试。');return}
    this.seq=(this.seq+1)>>>0;this.lastFrame=Date.now();
    try{const bytes=Uint8Array.from(atob(e.pcm),c=>c.charCodeAt(0));if(bytes.length!==256)throw Error();const view=new DataView(bytes.buffer),frame=new Float32Array(128);for(let i=0;i<128;i++)frame[i]=view.getInt16(i*2,true)/32768;this.onFrame(frame)}
    catch{this.fail('键盘音频格式错误，请升级固件后重试。')}
  }
  fail(message){this.stop();this.onError(message)}
  stop(){
    const stream=this.stream;this.stream=0;++this.generation;clearInterval(this.watch);clearInterval(this.ping);
    if(stream){
      this.stopping=(async()=>{
        const reply=await this.connection.requestMic('mic_stop',stream);
        if(!reply.ok||reply.active||reply.stream!==stream)throw Error('键盘麦克风暂停失败：'+(reply.error||'invalid_reply'));
      })();
      // Dispose/error paths are deliberately fire-and-forget; pause/start await it.
      void this.stopping.catch(()=>{});
    }
    return this.stopping||Promise.resolve();
  }
  dispose(){this.stop();this.unsubscribe()}
}
