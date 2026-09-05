export class Soundscape {
  context=null;timer=null;track=-1;volume=.25;step=0;
  async play(track) {
    if(this.track===track){this.stop();return false}
    this.stop();this.context??=new AudioContext();await this.context.resume();
    if(this.context.state!=='running')throw new Error('请先点击页面，再播放音乐');
    this.track=track;this.step=0;this.note();this.timer=setInterval(()=>this.note(),[850,1400,1600][track]);return true;
  }
  note(){
    if(this.track<0)return;
    const notes=[[261.63,329.63,392,523.25,392,329.63,293.66,349.23],[523.25,659.25,783.99,1046.5,783.99,659.25],[220,329.63,440,554.37,440,329.63]];
    const ctx=this.context,t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();
    o.type='sine';o.frequency.value=notes[this.track][this.step++%notes[this.track].length];g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(this.volume*.12,t+.035);g.gain.exponentialRampToValueAtTime(.0001,t+1.8);o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+2);o.onended=()=>{o.disconnect();g.disconnect()};
  }
  stop(){clearInterval(this.timer);this.timer=null;this.track=-1;if(this.context?.state==='running')this.context.suspend().catch(()=>{})}
}
