const tls=require('node:tls');
const {EventEmitter}=require('node:events');
const {CIPHER,PORT,PROTOCOL,derive,deviceId}=require('./wireless-protocol.cjs');

// The only network-exposed service is a single authenticated board connection.
class WirelessReceiver extends EventEmitter {
  constructor(){super();this.pending=new Map();this.nextId=1;this.peers=new Set();this.status={listening:false,connected:false}}
  publish(patch){Object.assign(this.status,patch);this.emit('status',{...this.status})}
  async start(pair,host,port=PORT){
    if(this.server)throw Error('请先关闭当前无线接收');
    if(!pair||!deviceId(pair.device)||!/^[0-9a-f]{64}$/.test(pair.key))throw Error('请先通过 USB 绑定开发板');
    const psk=derive(pair.key,'momo-wifi-v1');this.device=pair.device;
    const server=tls.createServer({minVersion:'TLSv1.2',maxVersion:'TLSv1.2',ciphers:CIPHER,handshakeTimeout:4000,
      pskCallback:(_socket,identity)=>identity===pair.device?psk:null},socket=>this.accept(socket));
    this.server=server;
    server.maxConnections=4;
    server.on('connection',socket=>{this.peers.add(socket);socket.on('close',()=>this.peers.delete(socket))});
    server.on('tlsClientError',()=>{});
    try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);resolve()})})}
    catch(e){this.server=null;server.close();throw Error('无线接收启动失败，请检查地址与端口占用：'+e.code)}
    server.on('error',()=>{void this.stop();this.publish({error:'无线接收发生错误，请重新开启'})});
    this.publish({listening:true,connected:false,host,port:server.address().port,device:pair.device,error:null});
    return {...this.status};
  }
  accept(socket){
    if(this.socket){socket.destroy();return}
    this.socket=socket;this.buffer='';this.lastHello=Date.now();this.verified=false;
    socket.setNoDelay(true);socket.on('error',()=>{});
    socket.on('data',chunk=>this.receive(socket,chunk));
    socket.on('close',()=>{
      if(this.socket!==socket)return;this.socket=null;this.verified=false;clearInterval(this.watch);
      this.reject('无线开发板已断开');this.emit('mic',{type:'disconnected'});this.publish({connected:false});
    });
    this.watch=setInterval(()=>{
      if(Date.now()-this.lastHello>6000){socket.destroy();return}
      try{this.write({type:'wireless_ping'})}catch{socket.destroy()}
    },1500);
  }
  receive(socket,chunk){
    if(socket!==this.socket)return;
    for(const byte of chunk){
      if(byte!==10){if(byte<32||byte>126||this.buffer.length>=512){socket.destroy();return}this.buffer+=String.fromCharCode(byte);continue}
      const line=this.buffer;this.buffer='';if(!line)continue;
      let e;try{e=JSON.parse(line)}catch{socket.destroy();return}
      if(e.protocol!==PROTOCOL){socket.destroy();return}
      if(e.type==='hello'&&e.board==='easyinput-v2'&&e.device===this.device&&e.mic==='pcm16-wifi-v1'){
        this.lastHello=Date.now();this.verified=true;this.publish({connected:true});continue;
      }
      if(!this.verified){socket.destroy();return}
      if(e.type==='mic_state'&&Number.isInteger(e.id)&&Number.isInteger(e.stream)&&e.stream>0&&e.stream<=2147483647&&typeof e.ok==='boolean'&&typeof e.active==='boolean'&&e.rate===16000&&typeof e.error==='string'&&e.error.length<=40){
        const p=this.pending.get(e.id);if(p){this.pending.delete(e.id);clearTimeout(p.timer);if(p.stream!==e.stream)p.reject(Error('无线音源已被另一连接占用'));else p.resolve(e)}
        this.emit('mic',e);continue;
      }
      if(e.type==='mic_audio'&&Number.isInteger(e.stream)&&e.stream>0&&e.stream<=2147483647&&Number.isInteger(e.seq)&&e.seq>=0&&e.seq<=4294967295&&typeof e.pcm==='string'&&/^[A-Za-z0-9+/]{342}==$/.test(e.pcm)){this.emit('mic',e);continue}
      socket.destroy();return;
    }
  }
  write(value){
    if(!this.socket||this.socket.destroyed)throw Error('无线开发板未连接');
    if(this.socket.writableLength>8192){this.socket.destroy();throw Error('无线连接拥塞')}
    this.socket.write(JSON.stringify({protocol:PROTOCOL,...value})+'\n');
  }
  request(type,stream){
    if(!this.verified)return Promise.reject(Error('请先连接无线开发板'));
    if(!['mic_start','mic_ping','mic_stop'].includes(type)||!Number.isInteger(stream)||stream<1||stream>2147483647)return Promise.reject(Error('无效麦克风命令'));
    if(this.pending.size>=8)return Promise.reject(Error('无线命令过多'));
    const id=this.nextId=this.nextId%2147483647+1;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('无线麦克风确认超时'));this.socket?.destroy()},2000);
      this.pending.set(id,{resolve,reject,timer,stream});
      try{this.write({type,id,stream})}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e)}
    });
  }
  reject(message){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error(message))}this.pending.clear()}
  async stop(){
    clearInterval(this.watch);this.reject('无线接收已关闭');
    const server=this.server;this.server=null;this.socket?.destroy();for(const peer of this.peers)peer.destroy();
    if(server)await new Promise(resolve=>server.close(resolve));
    this.publish({listening:false,connected:false});
  }
}
module.exports={WirelessReceiver};
