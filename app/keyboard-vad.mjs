import {KeyboardMicrophone} from './keyboard-microphone.mjs';
// Adapter for the public FrameProcessor from pinned vad-web 0.0.29 and Silero v5.
// PCM arrives directly over USB; it must never also enter getUserMedia/VAD.
export async function createKeyboardVAD(connection,{onSpeech,onLimit,onError}){
  const ort=window.ort,{FrameProcessor,Message}=window.vad;
  ort.env.wasm.wasmPaths='/voice-assets/';ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  const session=await ort.InferenceSession.create('/voice-assets/silero_vad_v5.onnx');
  const sr=new ort.Tensor('int64',[16000n]);let state;
  const reset=()=>{state?.dispose();state=new ort.Tensor('float32',new Float32Array(256),[2,1,128])};
  let running=false,destroyed=false,generation=0,queue=[],partial=[],processing=Promise.resolve(),busy=false,timer;
  const event=e=>{
    if(!running||destroyed)return;
    if(e.msg===Message.SpeechStart){clearTimeout(timer);timer=setTimeout(onLimit,60000)}
    if(e.msg===Message.VADMisfire)clearTimeout(timer);
    if(e.msg===Message.SpeechEnd){clearTimeout(timer);onSpeech(e.audio)}
  };
  const processor=new FrameProcessor(async frame=>{
    const input=new ort.Tensor('float32',frame,[1,512]);
    try{const out=await session.run({input,state,sr});state.dispose();state=out.stateN;const isSpeech=out.output.data[0];out.output.dispose();return {isSpeech,notSpeech:1-isSpeech}}finally{input.dispose()}
  },reset,{positiveSpeechThreshold:0.3,negativeSpeechThreshold:0.25,redemptionMs:900,preSpeechPadMs:300,minSpeechMs:400,submitUserSpeechOnPause:false},32);
  const mic=new KeyboardMicrophone(connection,frame=>{
    if(!running||destroyed)return;
    partial.push(frame);if(partial.length<4)return;
    const full=new Float32Array(512);partial.forEach((f,i)=>full.set(f,i*128));partial=[];
    if(queue.length>=32){onError('键盘音频处理跟不上，请关闭其他高负载应用后重试。');return}
    queue.push(full);pump();
  },onError);
  function pump(){
    if(busy)return;busy=true;const current=generation;
    processing=(async()=>{while(running&&!destroyed&&current===generation&&queue.length)await processor.process(queue.shift(),e=>{if(current===generation)event(e)})})()
      .catch(()=>{if(!destroyed)onError('键盘语音检测失败，请重试。')})
      .finally(()=>{busy=false});
  }
  return {
    async start(){if(destroyed)throw Error('Voice stopped');await processing;if(destroyed)return;++generation;partial=[];queue=[];processor.reset();processor.resume();running=true;try{await mic.start()}catch(e){e.name='AudioInputError';throw e}},
    async pause(){running=false;++generation;queue=[];partial=[];clearTimeout(timer);mic.stop();await processing;processor.pause(()=>{})},
    destroy(){if(destroyed)return;destroyed=true;running=false;++generation;queue=[];partial=[];clearTimeout(timer);mic.dispose();void processing.finally(async()=>{processor.pause(()=>{});state.dispose();sr.dispose();await session.release()})},
  };
}
