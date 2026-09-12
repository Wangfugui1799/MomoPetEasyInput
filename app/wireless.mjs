export const BLE_CONFIG='4d4d0000-0000-0000-0000-000000000003';
export class WirelessConnection {
  constructor(api=window.momoDesktop,onStatus=()=>{}){
    this.api=api;this.listeners=new Set();this.verified=false;
    api?.onWireless?.((kind,event)=>{
      if(kind==='status'){this.verified=event.connected===true;onStatus(event)}
      if(kind==='mic'){
        for(const listener of this.listeners)listener(event);
        if(event.delivery)void api.wireless('ack',event.delivery).catch(()=>{});
      }
    });
  }
  subscribeMic(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn)}
  requestMic(type,stream){return this.api.wireless('mic',{type,stream})}
}

const states=['尚未绑定','等待配网','正在保存配网','Wi-Fi 已连接，等待 Momo','无线语音已连接','网络断开，正在重试','配网验证失败，请重试','配网参数不正确','配网保存失败'];
export class WirelessSettings {
  constructor({usb,bluetooth,connection,onChange,api=window.momoDesktop}){
    Object.assign(this,{usb,bluetooth,connection,onChange,api});
    const section=document.createElement('section');section.className='voice-input-settings wireless-settings';section.setAttribute('aria-label','无线麦克风设置');
    section.innerHTML=`<h3>EasyInput 无线麦克风</h3><p>首次通过 USB 绑定这台 Mac，再通过蓝牙配网。日常使用 Wi-Fi 语音，无需插 USB；Mac 和开发板需在同一局域网。</p>
      <button type="button" class="secondary-button" id="wireless-bind">通过 USB 绑定这台 Mac</button>
      <label for="wireless-host">Mac 局域网地址</label><select id="wireless-host"></select>
      <div class="form-actions"><button type="button" class="secondary-button" id="wireless-refresh">刷新状态</button><button type="button" class="secondary-button" id="wireless-toggle">开启无线接收</button></div>
      <p id="wireless-auto-help">开启后会记住接收设置，下次打开 Momo 自动恢复；关闭接收会取消自动恢复。连接不会自动开启麦克风。</p>
      <form id="wireless-form"><label for="wireless-ssid">2.4 GHz Wi-Fi 名称</label><input id="wireless-ssid" autocomplete="off" maxlength="32" required>
      <label for="wireless-password">Wi-Fi 密码</label><input id="wireless-password" type="password" autocomplete="off" minlength="8" maxlength="63" required>
      <button class="primary-button" type="submit">通过蓝牙配置 Wi-Fi</button></form>
      <p id="wireless-status" role="status" aria-live="polite">正在读取无线状态…</p>`;
    document.querySelector('.voice-input-settings').after(section);this.section=section;
    this.$=id=>section.querySelector('#wireless-'+id);
    const action=fn=>async event=>{event?.preventDefault();if(this.busy)return;this.busy=true;this.lock();try{await fn()}catch(e){this.$('status').textContent=e.message}finally{this.busy=false;this.lock()}};
    this.$('refresh').onclick=action(()=>this.refresh());
    this.$('bind').onclick=action(async()=>{
      if(!usb.verified||!usb.wirelessDevice)throw Error('请先用原生 USB 连接运行 0.6.0 或更新固件的 EasyInput');
      onChange();const pair=await api.wireless('prepareBind',usb.wirelessDevice);
      const reply=await usb.request('wireless_bind',{key:pair.key});
      if(!reply.ok||reply.device!==pair.device)throw Error('开发板绑定失败：'+reply.error);
      this.render(await api.wireless('commitBind',pair.device));this.$('status').textContent='已绑定。请选择 Mac 地址并开启无线接收，然后通过蓝牙配网。';
    });
    this.$('toggle').onclick=action(async()=>{if(this.state?.listening)onChange();this.render(await api.wireless(this.state?.listening?'stop':'start',this.$('host').value))});
    this.$('form').onsubmit=action(async()=>{
      if(!this.state?.listening)throw Error('请先开启无线接收');
      if(!bluetooth.verified)throw Error('请先关闭设置，在顶部连接 EasyInput 蓝牙，然后回来配网');
      onChange();const characteristic=await bluetooth.service.getCharacteristic(BLE_CONFIG);
      const value=await characteristic.readValue();
      const status=Array.from(new Uint8Array(value.buffer,value.byteOffset,value.byteLength));
      const chunks=await api.wireless('provision',{status,network:{ssid:this.$('ssid').value,password:this.$('password').value}});
      this.$('password').value='';
      for(const chunk of chunks)await characteristic.writeValueWithResponse(Uint8Array.from(chunk));
      this.$('status').textContent='配网已发送，正在连接。连接成功后可选择 Wi-Fi 麦克风。';
      // Poll only while this bounded user-requested provisioning operation is active.
      for(let i=0;i<15;i++){
        await new Promise(resolve=>setTimeout(resolve,1000));
        const result=await characteristic.readValue();
        if(result.byteLength!==20||result.getUint8(0)!==1)throw Error('蓝牙配网状态异常');
        const code=result.getUint8(1);this.$('status').textContent=states[code]||'正在连接';
        if(code===4){await this.refresh();return}
        if(code>=6)throw Error(states[code]);
      }
      this.$('status').textContent='仍未连上 Momo。请检查 Wi-Fi 名称和密码、Mac 地址及系统防火墙，再刷新状态。';
    });
    document.querySelector('#voice-input-help').textContent='聊天使用已保存的输入。EasyInput 可选 USB 或配网后的 Wi-Fi 麦克风；回复从电脑播放。';
    if(!api?.wireless){this.$('status').textContent='无线麦克风请使用 Momo Mac 桌面版。';this.lock();return}
    api.onWireless((kind,event)=>{if(kind==='status')this.render(event)});void this.refresh().catch(e=>{this.$('status').textContent=e.message});
  }
  lock(){for(const el of this.section.querySelectorAll('button,input,select'))el.disabled=!!this.busy||!this.api?.wireless;this.$('host').disabled=!!this.busy||!this.api?.wireless||!!this.state?.listening}
  async refresh(){this.render(await this.api.wireless('status'))}
  render(state){
    this.state=state;this.connection.verified=state.connected===true;
    const selected=state.host||this.$('host').value;
    this.$('host').replaceChildren(...(state.addresses||[]).map(a=>new Option(`${a.host} · ${a.name}`,a.host)));
    if([...this.$('host').options].some(o=>o.value===selected))this.$('host').value=selected;
    this.$('toggle').textContent=state.listening?'关闭无线接收':'开启无线接收';
    this.$('status').textContent=state.error||(state.connected?'EasyInput 无线语音已连接，可以选择 Wi-Fi 麦克风。':state.listening?'无线接收已开启，等待开发板连接。':state.bound?'已绑定开发板。开启无线接收后连接。':'请先通过原生 USB 绑定开发板。');this.lock();
  }
}
