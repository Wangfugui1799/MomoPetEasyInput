import {createKeyboardVAD} from './keyboard-vad.mjs';
let scripts;
function loadScript(src){return new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>{tag.remove();reject(Error('Audio assets unavailable'))};document.head.append(tag)})}
async function loadVAD(){
  if(!scripts)scripts=(async()=>{await loadScript('/voice-assets/ort.wasm.min.js');await loadScript('/voice-assets/bundle.min.js')})().catch(e=>{scripts=null;throw e});
  await scripts;return window.vad.MicVAD;
}
export function createBrowserAudio({onSpeech,onLimit,onError,input='default',connection}){
  const ctx=new AudioContext();const unlocked=ctx.resume();unlocked.catch(()=>{});
  let stream,vad,disposed=false,source,finishPlay,speechTimer,captureContext;
  const check=()=>{if(disposed)throw Error('Voice stopped')};
  const stopTracks=()=>stream?.getTracks().forEach(t=>t.stop());
  const setEnabled=value=>stream?.getTracks().forEach(t=>{t.enabled=value});
  return {
    async init(){
      await unlocked;check();const MicVAD=await loadVAD();check();
      if(input==='easyinput'){
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
        onSpeechStart:()=>{clearTimeout(speechTimer);speechTimer=setTimeout(onLimit,60000)},
        onVADMisfire:()=>clearTimeout(speechTimer),
        onSpeechEnd:audio=>{clearTimeout(speechTimer);if(!disposed)onSpeech(audio)},
      });
      if(disposed)return;
    },
    async listen(){check();await vad.start();captureContext=vad._audioContext;
      if(disposed){stopTracks();try{vad.destroy()}catch{}await captureContext?.close().catch(()=>{});return}if(vad.errored)throw Error(vad.errored)},
    async pause(){clearTimeout(speechTimer);setEnabled(false);await vad.pause()},
    async play(base64,onStart){
      check();const binary=atob(base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      const buffer=await ctx.decodeAudioData(bytes.buffer);check();await ctx.resume();check();
      await new Promise((resolve,reject)=>{const node=ctx.createBufferSource();source=node;node.buffer=buffer;node.connect(ctx.destination);const timer=setTimeout(()=>reject(Error('Playback timeout')),Math.ceil(buffer.duration*1000)+5000);finishPlay=()=>{clearTimeout(timer);node.disconnect();resolve()};node.onended=finishPlay;node.start();onStart()});source=null;finishPlay=null;
    },
    dispose(){disposed=true;clearTimeout(speechTimer);stopTracks();try{source?.stop()}catch{}finishPlay?.();try{vad?.destroy()}catch{}captureContext=vad?._audioContext||captureContext;captureContext?.close().catch(()=>{});ctx.close().catch(()=>{})},
  };
}
