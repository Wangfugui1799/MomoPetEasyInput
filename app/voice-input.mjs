export const VOICE_INPUT_KEY='momo.voice.input.v1';
export function loadVoiceInput(storage){try{const id=storage.getItem(VOICE_INPUT_KEY);return typeof id==='string'&&id.length>0&&id.length<=512?id:'default'}catch{return 'default'}}
export class VoiceInputSettings {
  constructor({select,refresh,status,onChange,storage=localStorage,media=navigator.mediaDevices}){
    Object.assign(this,{select,refresh,status,onChange,storage,media});this.value=loadVoiceInput(storage);this.devices=[];this.render();
    select.onchange=()=>{this.value=select.value;let saved=true;try{storage.setItem(VOICE_INPUT_KEY,this.value)}catch{saved=false}onChange(this.value);status.textContent=saved?'已保存为默认语音输入，下次聊天使用此麦克风。':'本次已切换；本地存储不可用，无法保存默认输入。'};
    refresh.onclick=()=>this.update(true);media?.addEventListener('devicechange',()=>void this.update(false));void this.update(false);
  }
  render(){
    const options=[['default','电脑 · 系统默认麦克风'],['easyinput','EasyInput · 板载麦克风（USB）'],...this.devices.filter(d=>d.deviceId&&d.deviceId!=='default'&&d.deviceId!=='communications').map((d,i)=>[d.deviceId,d.label||`电脑麦克风 ${i+1}`])];
    if(!options.some(([id])=>id===this.value))options.push([this.value,'已保存的麦克风（当前不可用）']);
    this.select.replaceChildren(...options.map(([id,label])=>new Option(label,id)));this.select.value=this.value;
  }
  async update(requestPermission){
    if(this.loading)return;this.loading=true;this.refresh.disabled=true;let stream;
    try{
      if(requestPermission){stream=await this.media.getUserMedia({audio:true,video:false});stream.getTracks().forEach(t=>t.stop())}
      this.devices=(await this.media.enumerateDevices()).filter(d=>d.kind==='audioinput');this.render();
      if(requestPermission)this.status.textContent='设备列表已刷新，请选择默认语音输入。';
    }catch{if(requestPermission)this.status.textContent='无法读取麦克风列表，请检查系统麦克风权限。'}
    finally{stream?.getTracks().forEach(t=>t.stop());this.loading=false;this.refresh.disabled=false}
  }
}
