export const PROTOCOL='momo-easyinput/1';
export function parseEvent(line) {
  if(typeof line!=='string'||line.length>512) return null;
  let e;try{e=JSON.parse(line)}catch{return null}
  if(!e || e.protocol!==PROTOCOL) return null;
  if(e.type==='hello' && e.board==='easyinput-v2' && typeof e.firmware==='string') return {type:'hello',firmware:e.firmware.slice(0,32)};
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
