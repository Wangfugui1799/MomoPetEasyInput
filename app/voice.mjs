// Open-LLM-VTuber 1.2.1: frontend VAD, mono Float32 at 16 kHz.
export const VOICE_URL='ws://127.0.0.1:12393/client-ws';
export class VoiceChat {
  constructor({createSocket=url=>new WebSocket(url),createAudio, onState=()=>{},onText=()=>{},onReply=()=>{}}={}) {
    Object.assign(this,{createSocket,createAudio,onState,onText,onReply});
    this.session=null;this.state='off';
  }
  get active(){return !!this.session}
  setState(state,text){this.state=state;this.onState(state,text)}
  send(s,message){if(this.session!==s||s.socket?.readyState!==1)return false;s.socket.send(JSON.stringify(message));return true}
  watch(s,ms,text){clearTimeout(s.timer);s.timer=setTimeout(()=>{if(this.session===s)this.stop(text)},ms)}
  async start({manual=false}={}){
    if(this.active)return;
    const s={manual,queue:[],playing:false,turn:false,synth:false,end:false,ack:false,reply:'',audio:null};this.session=s;
    this.setState('connecting','正在连接语音服务…');
    this.watch(s,20000,'无法连接语音服务，请先启动本机 VTuber（端口 12393），再点击麦克风重试。');
    try{
      // Construct synchronously in the button gesture to unlock audio playback.
      s.audio=this.createAudio({manual,onSpeech:samples=>{if(this.session===s&&!s.manual)return this.submitAudio(samples)},onLimit:()=>{if(this.session===s)this.stop(s.manual?'录音达到 60 秒上限，已停止且未发送；请按 S5 分段重录。':'这一段说得太久了，请重新打开麦克风，分段说。')},onError:message=>{if(this.session===s)this.stop(message)}});
      try{await s.audio.playStartCue?.()}catch{}
      if(this.session!==s){s.audio.dispose();return}
      s.socket=this.createSocket(VOICE_URL);
      s.socket.onmessage=event=>{if(this.session!==s)return;try{this.receive(s,JSON.parse(event.data))}catch{this.stop('语音服务返回了无法读取的消息，请重试。')}};
      s.socket.onerror=()=>{if(this.session===s)this.stop('无法连接语音服务，请先启动本机 VTuber（端口 12393），再点击麦克风重试。')};
      s.socket.onclose=()=>{if(this.session===s)this.stop('语音连接已断开，点击麦克风重新连接。')};
    }catch(e){this.stop(e.name==='AudioInputError'?e.message:'无法启动语音，请检查麦克风与语音服务。')}
  }
  receive(s,m){
    if(m.type==='set-model-and-conf'&&!s.initializing){s.initializing=true;this.send(s,{type:'create-new-history'});return}
    if(m.type==='new-history-created'&&s.initializing&&!s.preparing){s.preparing=true;void this.prepare(s);return}
    if(m.type==='error'){this.stop('语音服务处理失败，请检查 VTuber 的模型与网络后重试。');return}
    // In particular, ignore backend start-mic: only the user's button opens capture.
    if(!s.turn)return;
    if(m.type==='user-input-transcription'&&typeof m.text==='string'){
      if(m.text.trim())this.onText(m.text);else this.stop('没有听清这句话，请重新打开麦克风再试一次。');
    }
    if(m.type==='audio'){
      const text=typeof m.display_text?.text==='string'?m.display_text.text:'';
      if(text){s.reply+=text;this.onReply(s.reply)}
      if(m.audio){if(typeof m.audio!=='string'||m.audio.length>16000000||s.queue.length>=100)throw Error('Invalid audio');s.queue.push(m);void this.drain(s)}
    }
    if(m.type==='backend-synth-complete'){s.synth=true;this.finish(s)}
    if(m.type==='control'&&m.text==='conversation-chain-end'){s.end=true;this.finish(s)}
  }
  async prepare(s){
    this.setState('connecting','正在准备麦克风，首次使用请允许访问…');
    this.watch(s,60000,'麦克风准备超时，请检查权限后重试。');
    try{await s.audio.init();if(this.session!==s){s.audio.dispose();return}await s.audio.listen();if(this.session!==s){s.audio.dispose();return}clearTimeout(s.timer);this.setState('listening',s.manual?'正在录音 · 说完再按 S5 发送；按旋钮查看对话':'正在听 · 说完稍作停顿，我会回答你')}
    catch(e){if(this.session===s)this.stop(e.name==='AudioInputError'?e.message:e.name==='OverconstrainedError'?'所选麦克风不可用，请到设置中重新选择语音输入。':e.name==='NotAllowedError'?'麦克风未获授权，请在系统设置的「隐私与安全性 → 麦克风」中允许 Momo，再重试。':e.name==='NotFoundError'?'没有找到麦克风，请连接麦克风后重试。':e.name==='NotReadableError'?'麦克风无法使用，可能正被其他应用占用。':'麦克风或语音检测加载失败，请重试。')}
  }
  beginTurn(s){s.turn=true;s.synth=false;s.end=false;s.ack=false;s.reply='';this.setState('thinking','正在想 · 请稍等');this.watch(s,120000,'语音回复等待超时，请检查 VTuber 服务与网络后重试。')}
  async pressToTalk(){
    const s=this.session;
    if(!s){await this.start({manual:true});return true}
    if(!s.manual)return false;
    if(this.state==='ready'){
      this.setState('connecting','正在准备录音…');
      try{try{await s.audio.playStartCue?.()}catch{}if(this.session!==s)return false;await s.audio.listen();if(this.session!==s)return false;this.setState('listening','正在录音 · 说完再按 S5 发送；按旋钮查看对话');return true}
      catch(e){if(this.session===s)this.stop(e.message);return false}
    }
    if(this.state!=='listening')return false;
    this.setState('sending','正在结束录音并发送…');
    try{
      const samples=await s.audio.finishRecording();if(this.session!==s)return false;
      if(samples.length<6400){this.setState('ready','录音太短，未发送 · 按 S5 重新录音');return false}
      return await this.submitAudio(samples,true);
    }catch(e){if(this.session===s)this.stop(e.message||'录音发送失败，请重试。');return false}
  }
  async submitAudio(samples,captured=false){
    const s=this.session;if(!s||this.state!==(captured?'sending':'listening')||samples.length<6400)return false;
    if(samples.length>16000*60||!samples.every(n=>Number.isFinite(n)&&Math.abs(n)<=1)){this.stop('录音太长或格式不正确，请分段说。');return false}
    this.beginTurn(s);
    try{if(!captured)await s.audio.pause();if(this.session!==s)return false;
      for(let i=0;i<samples.length;i+=4096)this.send(s,{type:'mic-audio-data',audio:Array.from(samples.subarray(i,i+4096))});
      this.send(s,{type:'mic-audio-end'});return true;
    }catch(e){if(this.session===s)this.stop(e.name==='AudioInputError'?e.message:'录音发送失败，请重试。');return false}
  }
  async submitText(text){
    const s=this.session;if(!s||!['listening','ready'].includes(this.state)||!text.trim())return false;
    this.beginTurn(s);
    try{await s.audio.pause();if(this.session!==s)return false;this.onText(text);this.send(s,{type:'text-input',text});return true}
    catch(e){if(this.session===s)this.stop(e.name==='AudioInputError'?e.message:'消息发送失败，请重试。');return false}
  }
  async drain(s){
    if(s.playing)return;s.playing=true;
    try{while(this.session===s&&s.queue.length){const m=s.queue.shift();this.setState('speaking','正在说 · 听完后可以继续说话');
      await s.audio.play(m.audio,()=>this.send(s,{type:'audio-play-start',display_text:m.display_text}));
    }}catch{if(this.session===s)this.stop('语音播放失败，请检查电脑输出设备后重试。')}
    finally{s.playing=false;if(this.session===s){if(!s.end)this.setState('thinking','正在想 · 请稍等');this.finish(s)}}
  }
  finish(s){
    if(this.session!==s||s.playing||s.queue.length)return;
    if(s.synth&&!s.ack){s.ack=true;this.send(s,{type:'frontend-playback-complete'})}
    if(s.end&&!s.resuming){s.resuming=true;void (async()=>{
      if(s.manual){s.turn=false;s.resuming=false;clearTimeout(s.timer);this.setState('ready','留言已回复 · 按 S5 录下一条；按旋钮查看对话');return}
      // Let loudspeaker echo decay before re-enabling capture.
      await new Promise(r=>setTimeout(r,350));if(this.session!==s)return;
      try{await s.audio.listen();if(this.session!==s)return;s.turn=false;s.resuming=false;clearTimeout(s.timer);this.setState('listening','正在听 · 你可以继续说话')}
      catch(e){if(this.session===s)this.stop(e.name==='AudioInputError'?e.message:'麦克风恢复失败，请重试。')}
    })()}
  }
  stop(message){
    const s=this.session;this.session=null;
    if(s){clearTimeout(s.timer);s.queue=[];try{if(s.socket?.readyState===1)s.socket.send(JSON.stringify({type:'interrupt-signal',text:s.reply}));s.socket?.close()}catch{}try{s.audio?.dispose()}catch{}}
    this.setState(message?'error':'off',message||'麦克风已关闭 · 点击左侧按钮开始语音聊天');
  }
}
