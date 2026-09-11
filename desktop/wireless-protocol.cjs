const {createHmac,createCipheriv}=require('node:crypto');
const {isIP}=require('node:net');
const PORT=4786;
const CIPHER='ECDHE-PSK-CHACHA20-POLY1305';
const PROTOCOL='momo-easyinput/1';
const deviceId=value=>typeof value==='string'&&/^[0-9a-f]{12}$/.test(value);
function derive(key,purpose){return createHmac('sha256',Buffer.from(key,'hex')).update(purpose).digest()}
function privateIPv4(host){
  if(isIP(host)!==4)return false;
  const [a,b]=host.split('.').map(Number);
  return a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===169&&b===254);
}
function validateNetwork(value){
  if(!value||typeof value.ssid!=='string'||!Buffer.byteLength(value.ssid)||Buffer.byteLength(value.ssid)>32||value.ssid.includes('\0'))throw Error('Wi-Fi 名称需为 1–32 字节');
  if(typeof value.password!=='string'||!/^[\x20-\x7e]{8,63}$/.test(value.password))throw Error('Wi-Fi 密码需为 8–63 个可打印 ASCII 字符');
  if(!privateIPv4(value.host))throw Error('请选择 Mac 的局域网 IPv4 地址');
  return {ssid:value.ssid,password:value.password,host:value.host,port:PORT};
}
function provisioningChunks(key,status,network){
  const bytes=Buffer.from(status);
  if(bytes.length!==20||bytes[0]!==1)throw Error('蓝牙固件不支持安全配网');
  const nonce=bytes.subarray(8,20);
  const cipher=createCipheriv('aes-256-gcm',derive(key,'momo-ble-v1'),nonce);
  cipher.setAAD(Buffer.from('momo-provision-v1'));
  const payload=Buffer.concat([cipher.update(JSON.stringify(validateNetwork(network))),cipher.final(),cipher.getAuthTag()]);
  const total=Math.ceil(payload.length/17),chunks=[];
  if(total>32)throw Error('配网内容过长');
  for(let i=0;i<total;i++)chunks.push([...Buffer.concat([Buffer.from([1,i,total]),payload.subarray(i*17,(i+1)*17)])]);
  return chunks;
}
module.exports={PORT,CIPHER,PROTOCOL,derive,deviceId,privateIPv4,validateNetwork,provisioningChunks};
