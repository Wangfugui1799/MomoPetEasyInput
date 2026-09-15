import test from 'node:test';
import assert from 'node:assert/strict';
import {SLEEP_SOUND_OPTIONS,normalizeSleepSound,padChordAt,lullabyNoteAt,clampVolume,PAD_CHORDS,LULLABY_NOTES,BREATH_SECONDS,SLEEP_MIX,SleepAmbience} from '../app/sleep-sound.mjs';

class FakeParam{constructor(value=0){this.value=value;this.calls=[]}
  setValueAtTime(v,t){this.calls.push(['set',v,t]);return this}
  linearRampToValueAtTime(v,t){this.calls.push(['linear',v,t]);return this}
  exponentialRampToValueAtTime(v,t){this.calls.push(['exp',v,t]);return this}
  cancelScheduledValues(t){this.calls.push(['cancel',t]);return this}}
class FakeNode{constructor(context){this.context=context;this.gain=new FakeParam();this.frequency=new FakeParam();this.Q=new FakeParam();this.type='sine';this.started=0;this.stopped=0;this.disconnected=0}
  connect(destination){this.target=destination;return destination}
  disconnect(){this.disconnected++}
  start(){this.started++}
  stop(){this.stopped++}}
class FakeContext{
  constructor(state='running'){this.state=state;this.sampleRate=8000;this.currentTime=0;this.destination=new FakeNode(this);this.nodes=[]}
  resume(){this.state='running';return Promise.resolve()}
  suspend(){this.state='suspended';return Promise.resolve()}
  track(node){this.nodes.push(node);return node}
  createGain(){return this.track(new FakeNode(this))}
  createOscillator(){return this.track(new FakeNode(this))}
  createBiquadFilter(){return this.track(new FakeNode(this))}
  createBufferSource(){return this.track(new FakeNode(this))}
  createBuffer(channels,length){const data=new Float32Array(length);return {length,getChannelData:()=>data}}
}

test('unknown or corrupt sleep sound values fall back to the lullaby',()=>{
  assert.equal(normalizeSleepSound('snore'),'snore');
  assert.equal(normalizeSleepSound('off'),'off');
  for(const invalid of ['',null,undefined,'LULLABY',0,{},['lullaby'],true]) assert.equal(normalizeSleepSound(invalid),'lullaby');
  assert.deepEqual(SLEEP_SOUND_OPTIONS.map(([id])=>id),['lullaby','snore','off']);
});

test('chord and melody tables are finite, in range and wrap without drift',()=>{
  for(const chord of PAD_CHORDS){assert.equal(chord.length,4);for(const frequency of chord){assert.ok(Number.isFinite(frequency));assert.ok(frequency>100&&frequency<400)}}
  for(const note of LULLABY_NOTES){assert.ok(Number.isFinite(note));assert.ok(note>400&&note<1000)}
  assert.deepEqual(padChordAt(0),padChordAt(PAD_CHORDS.length));
  assert.deepEqual(lullabyNoteAt(0),lullabyNoteAt(LULLABY_NOTES.length));
  assert.equal(padChordAt(-1),PAD_CHORDS[PAD_CHORDS.length-1]);
  assert.equal(lullabyNoteAt(-3),LULLABY_NOTES[LULLABY_NOTES.length-3]);
  assert.equal(lullabyNoteAt(LULLABY_NOTES.length*7+2),LULLABY_NOTES[2]);
  assert.equal(BREATH_SECONDS,3.6);
});

test('every playable style has a mix, with only the documented layers active',()=>{
  const playable=SLEEP_SOUND_OPTIONS.filter(([id])=>id!=='off').map(([id])=>id);
  assert.deepEqual(Object.keys(SLEEP_MIX),playable);
  for(const style of playable){
    const mix=SLEEP_MIX[style];
    assert.deepEqual(Object.keys(mix),['pad','bell','breath','rasp'],style);
    for(const [layer,value] of Object.entries(mix)){assert.ok(Number.isFinite(value),`${style}.${layer}`);assert.ok(value>=0&&value<=1,`${style}.${layer}`)}
    assert.ok(mix.pad>0,`${style} 需要一点垫底，否则听感干硬`);
  }
  assert.equal(SLEEP_MIX.lullaby.rasp,0);
  assert.equal(SLEEP_MIX.snore.bell,0);
});

test('volume clamps to a whole percentage and defaults when unusable',()=>{
  assert.equal(clampVolume(0),0);assert.equal(clampVolume(100),100);
  assert.equal(clampVolume(-40),0);assert.equal(clampVolume(999),100);
  assert.equal(clampVolume(30.6),31);
  for(const invalid of [NaN,Infinity,-Infinity,undefined,null,'60',{}]) assert.equal(clampVolume(invalid),30);
});

test('silent style never opens an audio context, unusable names fall back to playing',async()=>{
  const ambience=new SleepAmbience();
  assert.equal(ambience.playing,false);
  assert.equal(await ambience.start('off'),false);
  assert.equal(ambience.context,null);
  assert.equal(ambience.style,'off');
  assert.equal(ambience.playing,false);
  ambience.stop();
  assert.equal(ambience.timers.length,0);

  const previous=globalThis.AudioContext;
  globalThis.AudioContext=FakeContext;
  try{
    assert.equal(await ambience.start('nonsense'),true);
    assert.equal(ambience.style,'lullaby');
    assert.equal(ambience.playing,true);
    ambience.stop();
    assert.equal(ambience.playing,false);
    assert.equal(ambience.timers.length,0);
  } finally { globalThis.AudioContext=previous; }
});

test('blocked autoplay is reported instead of pretending to play',async()=>{
  const previous=globalThis.AudioContext;
  globalThis.AudioContext=class extends FakeContext{constructor(){super('suspended')}resume(){return Promise.resolve()}};
  try{
    const ambience=new SleepAmbience();
    await assert.rejects(ambience.start('lullaby'),/请先点击页面/);
    assert.equal(ambience.playing,false);
    assert.equal(ambience.sources.length,0);
  } finally { globalThis.AudioContext=previous; }
});

test('lullaby and snore build the right graph, mix and lifecycle',async()=>{
  const previous=globalThis.AudioContext;
  globalThis.AudioContext=FakeContext;
  try{
    const ambience=new SleepAmbience();
    ambience.setVolume(40);
    assert.equal(await ambience.start('lullaby'),true);
    assert.equal(ambience.playing,true);
    assert.equal(ambience.style,'lullaby');
    assert.equal(ambience.padOscillators.length,4);
    assert.equal(ambience.raspGain,null);
    assert.equal(ambience.timers.length,2);
    assert.equal(ambience.sources.length,6);
    assert.equal(ambience.padGain.gain.value,.55);
    assert.equal(ambience.breathGain.gain.value,.07);
    assert.deepEqual(ambience.master.gain.calls.at(-1).slice(0,1),['linear']);
    assert.equal(ambience.master.gain.calls.at(-1)[2],1.5);
    assert.ok(Math.abs(ambience.master.gain.calls.at(-1)[1]-40/100*.9)<1e-9);
    assert.equal(ambience.padOscillators[0].started,1);

    ambience.setVolume(200);
    assert.equal(ambience.volume,100);
    assert.deepEqual(ambience.master.gain.calls.at(-1),['linear',.9,.3]);

    ambience.morphPad();
    assert.equal(ambience.step,1);
    const morph=ambience.padOscillators[0].frequency.calls.at(-1);
    assert.deepEqual(morph,['linear',PAD_CHORDS[1][0],4.5]);

    const before=ambience.sources.length;
    ambience.bell();
    assert.equal(ambience.bellStep,1);
    assert.equal(ambience.sources.length,before+1);
    assert.equal(ambience.sources.at(-1).stopped,1);

    assert.equal(await ambience.setStyle('snore'),true);
    assert.equal(ambience.style,'snore');
    assert.equal(ambience.padGain.gain.value,.09);
    assert.equal(ambience.breathGain.gain.value,.31);
    assert.equal(ambience.raspGain.gain.value,.31);
    assert.equal(ambience.timers.length,1);

    ambience.stop();
    assert.equal(ambience.playing,false);
    assert.equal(ambience.timers.length,0);
    assert.deepEqual(ambience.master.gain.calls.at(-1),['linear',0,.5]);
    // 淡出期间音源仍然存在，避免立刻断开造成爆音；620ms 后才真正拆掉。
    assert.ok(ambience.sources.length>0);
    await new Promise(resolve=>setTimeout(resolve,700));
    assert.equal(ambience.padGain,null);
    assert.equal(ambience.sources.length,0);
    assert.equal(ambience.context.state,'suspended');
    assert.equal(await ambience.setStyle('lullaby'),false);
    assert.equal(ambience.style,'lullaby');
    assert.equal(ambience.playing,false);
  } finally { globalThis.AudioContext=previous; }
});
