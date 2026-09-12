// Bounded 16 kHz PCM for S5 press-to-record / press-to-send (never VAD-submit).
export class ManualRecording {
  constructor(limit=16000*60){this.limit=limit;this.clear()}
  clear(){this.frames=[];this.length=0;this.recording=false}
  start(){this.clear();this.recording=true}
  push(frame){
    if(!this.recording)return true;
    if(this.length+frame.length>this.limit){this.recording=false;return false}
    this.frames.push(frame.slice());this.length+=frame.length;return true;
  }
  pause(){this.recording=false}
  take(){const pcm=new Float32Array(this.length);let offset=0;for(const f of this.frames){pcm.set(f,offset);offset+=f.length}this.clear();return pcm}
}
