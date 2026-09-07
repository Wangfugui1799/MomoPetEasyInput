export const PROTOCOL='momo-easyinput/1';
export function parseEvent(line) {
  if(typeof line!=='string'||line.length>512) return null;
  let e;try{e=JSON.parse(line)}catch{return null}
  if(!e || e.protocol!==PROTOCOL) return null;
  if(e.type==='hello' && e.board==='easyinput-v2' && typeof e.firmware==='string') return {type:'hello',firmware:e.firmware.slice(0,32),sound:e.sound===true};
  if(e.type==='sound_state' && Number.isInteger(e.id) && e.id>0 && e.id<=2147483647 && typeof e.ok==='boolean' && typeof e.enabled==='boolean' && Number.isInteger(e.volume) && e.volume>=0 && e.volume<=100 && typeof e.ready==='boolean' && ['error','audio_error','storage_error'].every(k=>typeof e[k]==='string' && e[k].length<=40)) return {type:e.type,id:e.id,ok:e.ok,enabled:e.enabled,volume:e.volume,ready:e.ready,error:e.error,audio_error:e.audio_error,storage_error:e.storage_error};
  if(e.type==='battery'&&Number.isInteger(e.percent)&&e.percent>=-1&&e.percent<=100)return {type:'battery',percent:e.percent};
  if(e.type==='key' && Number.isInteger(e.key) && e.key>=1 && e.key<=8) return {type:'key',key:e.key};
  if(e.type==='rotate' && (e.delta===1||e.delta===-1)) return {type:'rotate',delta:e.delta};
  if(e.type==='press'||e.type==='long_press') return {type:e.type};
  return null;
}
export class LineDecoder {
  buffer='';dropping=false;
  push(chunk) {
    const events=[];
    for(const c of chunk) {
      if(c==='\n') {
        if(!this.dropping){const e=parseEvent(this.buffer.trim());if(e)events.push(e)}
        this.buffer='';this.dropping=false;
      } else if(!this.dropping) {
        this.buffer+=c;
        if(this.buffer.length>512){this.buffer='';this.dropping=true}
      }
    }
    return events;
  }
}
