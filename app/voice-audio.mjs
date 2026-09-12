import {createKeyboardVAD} from './keyboard-vad.mjs';
import {KeyboardMicrophone} from './keyboard-microphone.mjs';
import {ManualRecording} from './manual-recording.mjs';
let scripts;
export const VOICE_CUE_OPTIONS=[['soft','柔和双音'],['bright','清脆上扬'],['bubble','气泡啫声'],['classic','经典滴声']];
export function normalizeVoiceCue(value){return VOICE_CUE_OPTIONS.some(([id])=>id===value)?value:'soft'}
export function createVoiceCue(ctx,style='soft'){
  const plans={
    soft:[['sine',0,.2,523.25,659.25,.1],['sine',.1,.24,659.25,783.99,.085]],
    bright:[['sine',0,.19,659.25,880,.14]],
    bubble:[['triangle',0,.25,620,240,.13]],
    classic:[['square',0,.09,784,784,.05],['square',.12,.1,988,988,.045]],
  }[normalizeVoiceCue(style)];
  const start=ctx.currentTime+.01,nodes=[];
  const done=Promise.all(plans.map(([type,offset,duration,from,to,peak])=>new Promise(resolve=>{
    const oscillator=ctx.createOscillator(),gain=ctx.createGain(),at=start+offset;let finished=false;
    oscillator.type=type;oscillator.frequency.setValueAtTime(from,at);if(to!==from)oscillator.frequency.exponentialRampToValueAtTime(to,at+duration*.75);
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(peak,at+.018);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    oscillator.connect(gain);gain.connect(ctx.destination);const finish=()=>{if(finished)return;finished=true;oscillator.disconnect();gain.disconnect();resolve()};
    oscillator.onended=finish;nodes.push({oscillator,finish});oscillator.start(at);oscillator.stop(at+duration+.01);
  })));
  return {done,stop(){for(const {oscillator,finish} of nodes){try{oscillator.stop()}catch{}finish()}}};
}
function loadScript(src){return new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>{tag.remove();reject(Error('Audio assets unavailable'))};document.head.append(tag)})}
async function loadVAD(){
  if(!scripts)scripts=(async()=>{await loadScript('/voice-assets/ort.wasm.min.js');await loadScript('/voice-assets/bundle.min.js')})().catch(e=>{scripts=null;throw e});
  await scripts;return window.vad.MicVAD;
}
export function createBrowserAudio({onSpeech,onLimit,onError,input='default',connection,manual=false,cueStyle='soft'}){
  const ctx=new AudioContext();const unlocked=ctx.resume();unlocked.catch(()=>{});
  let stream,vad,disposed=false,source,finishPlay,cuePlayback,speechTimer,captureContext;
  const recording=new ManualRecording();
  const capture=frame=>{if(!disposed&&!recording.push(frame))onLimit()};
  const check=()=>{if(disposed)throw Error('Voice stopped')};
  const stopTracks=()=>stream?.getTracks().forEach(t=>t.stop());
  const setEnabled=value=>stream?.getTracks().forEach(t=>{t.enabled=value});
  return {
    async init(){
      await unlocked;check();
      if(manual&&(input==='easyinput'||input==='easyinput-wifi')){
        const mic=new KeyboardMicrophone(connection,capture,onError);
        vad={start:()=>mic.start(),pause:()=>mic.stop(),destroy:()=>mic.dispose()};return;
      }
      const MicVAD=await loadVAD();check();
      if(input==='easyinput'||input==='easyinput-wifi'){
        try{vad=await createKeyboardVAD(connection,{onSpeech,onLimit,onError})}catch(e){e.name='AudioInputError';throw e}
        if(disposed)vad.destroy();return;
      }
      stream=await navigator.mediaDevices.getUserMedia({audio:{...(input!=='default'?{deviceId:{exact:input}}:{}),channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(disposed){stopTracks();return}
      stream.getAudioTracks().forEach(t=>t.addEventListener('ended',()=>{if(!disposed)onError('麦克风已断开，请检查设备后重试。')}));
      // vad-web 0.0.29 owns its capture AudioContext. Retain it here so failed
      // or cancelled initialization also closes the context.
      vad=await MicVAD.new({model:'v5',startOnLoad:false,baseAssetPath:'/voice-assets/',onnxWASMBasePath:'/voice-assets/',
        ortConfig:ort=>{ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false},
        getStream:async()=>{check();return stream},pauseStream:async()=>setEnabled(false),resumeStream:async()=>{check();setEnabled(true);return stream},
        redemptionMs:900,minSpeechMs:400,preSpeechPadMs:300,submitUserSpeechOnPause:false,
        onFrameProcessed:(_probabilities,frame)=>{if(manual)capture(frame)},
        onSpeechStart:()=>{if(!manual){clearTimeout(speechTimer);speechTimer=setTimeout(onLimit,60000)}},
        onVADMisfire:()=>{if(!manual)clearTimeout(speechTimer)},
        onSpeechEnd:audio=>{if(!manual){clearTimeout(speechTimer);if(!disposed)onSpeech(audio)}},
      });
      if(disposed)return;
    },
    async listen(){check();if(manual)recording.start();try{await vad.start()}catch(e){e.name='AudioInputError';throw e}captureContext=vad._audioContext;
      if(manual&&!disposed){clearTimeout(speechTimer);speechTimer=setTimeout(onLimit,60000)}
      if(disposed){stopTracks();try{vad.destroy()}catch{}await captureContext?.close().catch(()=>{});return}if(vad.errored)throw Error(vad.errored)},
    async pause(){recording.pause();clearTimeout(speechTimer);setEnabled(false);try{await vad.pause()}catch(e){e.name='AudioInputError';throw e}},
    async finishRecording(){await this.pause();return recording.take()},
    async playStartCue(){
      check();await ctx.resume();check();
      cuePlayback=createVoiceCue(ctx,typeof cueStyle==='function'?cueStyle():cueStyle);await cuePlayback.done;cuePlayback=null;
    },
    async play(base64,onStart){
      check();const binary=atob(base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      const buffer=await ctx.decodeAudioData(bytes.buffer);check();await ctx.resume();check();
      await new Promise((resolve,reject)=>{const node=ctx.createBufferSource();source=node;node.buffer=buffer;node.connect(ctx.destination);const timer=setTimeout(()=>reject(Error('Playback timeout')),Math.ceil(buffer.duration*1000)+5000);finishPlay=()=>{clearTimeout(timer);node.disconnect();resolve()};node.onended=finishPlay;node.start();onStart()});source=null;finishPlay=null;
    },
    dispose(){disposed=true;recording.clear();clearTimeout(speechTimer);stopTracks();cuePlayback?.stop();try{source?.stop()}catch{}finishPlay?.();try{vad?.destroy()}catch{}captureContext=vad?._audioContext||captureContext;captureContext?.close().catch(()=>{});ctx.close().catch(()=>{})},
  };
}
