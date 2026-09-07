// The device is the source of truth. Local pet data and computer music are separate.
export class KeyboardSoundPanel {
  constructor(getKeyboard,root=document){
    this.getKeyboard=getKeyboard;this.root=root;this.state=null;this.busy=false;this.epoch=-1;
    this.enabled=root.querySelector('#input-sound-enabled');this.volume=root.querySelector('#input-sound-volume');
    this.label=root.querySelector('#input-sound-value');this.message=root.querySelector('#input-sound-status');
    this.preview=root.querySelector('#input-sound-preview');this.retry=root.querySelector('#input-sound-refresh');
    this.enabled.onchange=()=>this.run('sound_set',{enabled:this.enabled.checked,volume:Number(this.volume.value)});
    this.volume.oninput=()=>{this.label.textContent=`${this.volume.value}%`;this.message.textContent='松开滑块后保存到键盘'};
    this.volume.onchange=()=>this.run('sound_set',{enabled:this.enabled.checked,volume:Number(this.volume.value)});
    this.preview.onclick=()=>this.run('sound_preview');this.retry.onclick=()=>this.run('sound_get');this.render();
  }
  render(){
    const available=this.getKeyboard()?.verified&&this.getKeyboard()?.soundSupported;
    this.enabled.disabled=this.volume.disabled=!available||this.busy||!this.state;
    this.preview.disabled=!available||this.busy||!this.state?.ready||!this.state?.enabled||!this.state?.volume;
    this.retry.disabled=!available||this.busy;
    if(this.state&&!this.busy){this.enabled.checked=this.state.enabled;this.volume.value=this.state.volume;this.label.textContent=`${this.state.volume}%`}
  }
  connectionChanged(status){
    const keyboard=this.getKeyboard();
    if(status!=='connected'){
      this.state=null;this.epoch=-1;this.busy=false;this.message.textContent='连接键盘后可设置；声音从键盘播放';this.render();return;
    }
    if(!keyboard.soundSupported){this.state=null;this.message.textContent=keyboard.device?'蓝牙控制已连接；请通过 USB 调整键盘音效':'当前固件不支持操作音效，请更新固件';this.render();return}
    if(this.epoch!==keyboard.epoch){this.epoch=keyboard.epoch;void this.run('sound_get')}
  }
  async run(type,settings){
    if(this.busy)return;
    this.busy=true;this.render();const epoch=this.getKeyboard().epoch;
    this.message.textContent=type==='sound_get'?'正在读取键盘设置…':type==='sound_set'?'正在保存到键盘…':'正在请求键盘试听…';
    try{
      const result=await this.getKeyboard().requestSound(type,settings);
      if(epoch!==this.getKeyboard().epoch)return;
      this.state=result;
      if(!result.ok)throw Error(result.error==='storage_write'?'设备保存失败，请重新读取确认':'设备未完成请求，请重试');
      const text=type==='sound_get'?'已读取键盘设置':type==='sound_set'?'已保存到键盘':'已发送试听，请听键盘声音';
      this.message.textContent=text+(!result.ready?'；声音模块不可用（'+result.audio_error+'）':result.storage_error!=='none'?'；设置存储异常，当前使用静音保护':'');
    }catch(error){if(epoch===this.getKeyboard().epoch){this.message.textContent=error.message;this.state=null}}
    finally{if(epoch===this.getKeyboard().epoch){this.busy=false;this.render()}}
  }
}
