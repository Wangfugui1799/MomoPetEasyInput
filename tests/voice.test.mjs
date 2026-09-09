import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceChat} from '../app/voice.mjs';
import {allowMicrophone} from '../desktop/media-policy.cjs';
const tick=()=>new Promise(r=>setTimeout(r,0));
function harness(overrides={}){
  const sent=[],states=[],texts=[],replies=[],players=[];
  const socket={readyState:1,send:s=>sent.push(JSON.parse(s)),close(){this.readyState=3}};
  const audio={listens:0,pauses:0,disposed:0,init:async()=>{},async listen(){this.listens++},async pause(){this.pauses++},dispose(){this.disposed++},play:(data,start)=>{start();return new Promise(resolve=>players.push({data,resolve}))},...overrides};
  const chat=new VoiceChat({createSocket:()=>socket,createAudio:()=>audio,onState:s=>states.push(s),onText:s=>texts.push(s),onReply:s=>replies.push(s)});
  const receive=m=>socket.onmessage({data:JSON.stringify(m)});
  const ready=async()=>{await chat.start();receive({type:'set-model-and-conf'});receive({type:'new-history-created'});await tick()};
  return {chat,audio,sent,states,texts,replies,players,receive,ready,socket};
}
test('three automatic turns: ordered audio, one submission, completion before listening',async()=>{
  const h=harness();try{
    await h.chat.start();assert.equal(h.audio.listens,0);h.receive({type:'control',text:'start-mic'});assert.equal(h.audio.listens,0);
    h.receive({type:'set-model-and-conf'});assert.deepEqual(h.sent,[{type:'create-new-history'}]);h.receive({type:'new-history-created'});await tick();
    for(let turn=0;turn<3;turn++){
      const samples=new Float32Array(16000).fill(.2);
      assert.equal(await h.chat.submitAudio(samples),true);assert.equal(await h.chat.submitAudio(samples),false);
      assert.equal(h.audio.pauses,turn+1);
      h.receive({type:'user-input-transcription',text:'你好'});
      h.receive({type:'audio',audio:'first',display_text:{text:'你'}});
      h.receive({type:'audio',audio:'second',display_text:{text:'好'}});
      h.receive({type:'backend-synth-complete'});h.receive({type:'backend-synth-complete'});
      assert.equal(h.players.length,turn*2+1);assert.equal(h.sent.filter(m=>m.type==='frontend-playback-complete').length,turn);
      h.players[turn*2].resolve();await tick();assert.equal(h.players.length,turn*2+2);
      h.players[turn*2+1].resolve();await tick();assert.equal(h.sent.filter(m=>m.type==='frontend-playback-complete').length,turn+1);
      h.receive({type:'control',text:'conversation-chain-end'});await new Promise(r=>setTimeout(r,370));assert.equal(h.chat.state,'listening');
    }
    assert.equal(h.sent.filter(m=>m.type==='mic-audio-end').length,3);
    assert.equal(h.sent.filter(m=>m.type==='mic-audio-data').flatMap(m=>m.audio).length,48000);
    assert.deepEqual(h.replies,['你','你好','你','你好','你','你好']);assert.equal(h.audio.listens,4);
  }finally{h.chat.stop()}
});
test('stop during playback drops queued and late replies; retry gets a new session',async()=>{
  const h=harness();await h.ready();await h.chat.submitText('你好');h.receive({type:'audio',audio:'one',display_text:{text:'答'}});h.receive({type:'audio',audio:'two'});
  const late=h.socket.onmessage;h.chat.stop();h.players[0].resolve();await tick();late({data:JSON.stringify({type:'audio',audio:'late',display_text:{text:'迟到'}})});
  assert.equal(h.audio.disposed,1);assert.equal(h.players.length,1);assert.deepEqual(h.replies,['答']);assert.equal(h.chat.state,'off');assert.equal(h.sent.at(-1).type,'interrupt-signal');
});
test('closing during pending permission disposes late capture and never listens',async()=>{
  let done;const h=harness({init:()=>new Promise(r=>{done=r})});await h.chat.start();h.receive({type:'set-model-and-conf'});h.receive({type:'new-history-created'});h.chat.stop();done();await tick();assert.equal(h.audio.listens,0);assert.equal(h.chat.active,false);
});
test('permission, network and playback errors stop the session and allow retry',async()=>{
  const h=harness({init:async()=>{throw Object.assign(Error(),{name:'NotAllowedError'})}});await h.ready();assert.equal(h.chat.state,'error');assert.equal(h.chat.active,false);
  const p=harness({play:async()=>{throw Error('decode')}});await p.ready();await p.chat.submitText('hi');p.receive({type:'audio',audio:'broken'});await tick();assert.equal(p.chat.state,'error');assert.equal(p.audio.disposed,1);
  const n=harness();await n.ready();n.socket.onclose();assert.equal(n.chat.active,false);assert.equal(n.chat.state,'error');
});
test('short audio never submits and null audio still completes',async()=>{
  const h=harness();try{await h.ready();await h.chat.submitAudio(new Float32Array(100));assert.equal(h.sent.some(m=>m.type==='mic-audio-end'),false);await h.chat.submitText('hi');h.receive({type:'audio',audio:null,display_text:{text:'你好'}});h.receive({type:'backend-synth-complete'});assert.equal(h.sent.at(-1).type,'frontend-playback-complete')}finally{h.chat.stop()}
});
test('Electron microphone permission rejects cameras, frames, other windows and origins',()=>{
  const origin='http://127.0.0.1:4784',owner={id:1,getURL:()=>origin+'/'};
  const allowed=(changes={},request=true)=>allowMicrophone(changes.owner||owner,changes.permission||'media',changes.origin||origin,1,origin,changes.details||{isMainFrame:true,mediaTypes:['audio']},request);
  assert.equal(allowed(),true);assert.equal(allowed({details:{mediaType:'audio'}},false),true);
  for(const changes of [{owner:{id:2,getURL:()=>origin+'/'}},{origin:'https://example.com'},{permission:'videoCapture'},{details:{isMainFrame:false,mediaTypes:['audio']}},{details:{isMainFrame:true,mediaTypes:['audio','video']}},{details:{isMainFrame:true,mediaTypes:[]}}])assert.equal(allowed(changes),false);
});
