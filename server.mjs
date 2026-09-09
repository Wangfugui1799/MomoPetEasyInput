import http from 'node:http';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=fileURLToPath(new URL('./app/',import.meta.url));
const allowed=new Set(['index.html','style.css','favicon.svg','app.mjs','core.mjs','serial.mjs','bluetooth.mjs','protocol.mjs','sound.mjs','keyboard-sound.mjs','voice.mjs','voice-audio.mjs']);
const voiceAssets=new Map([
  ...['bundle.min.js','vad.worklet.bundle.min.js','silero_vad_v5.onnx'].map(name=>['voice-assets/'+name,fileURLToPath(new URL('./node_modules/@ricky0123/vad-web/dist/'+name,import.meta.url))]),
  ...['ort.wasm.min.js','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'].map(name=>['voice-assets/'+name,fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/'+name,import.meta.url))]),
]);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.onnx':'application/octet-stream'};
export function validateChat(data){
  if(!data||typeof data.endpoint!=='string'||typeof data.key!=='string'||!data.key||data.key.length>2048||typeof data.model!=='string'||!data.model.trim()||data.model.length>100)throw Error('请检查 AI 接口、模型名称和密钥');
  const url=new URL(data.endpoint);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('AI 接口需要使用 HTTPS 地址');
  if(!Array.isArray(data.messages)||!data.messages.length||data.messages.length>12)throw Error('消息格式不正确');
  const messages=data.messages.map(m=>{if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>4000)throw Error('消息格式不正确');return {role:m.role,content:m.content}});
  const pet={};for(const name of ['mood','energy'])if(Number.isFinite(data.pet?.[name]))pet[name]=Math.max(0,Math.min(100,Math.round(data.pet[name])));
  return {url:url.href,key:data.key,model:data.model,messages,pet};
}
export async function startServer({port=4783,host='127.0.0.1',fetchImpl=fetch}={}){
  let origin;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:12393; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
    if(req.headers.host!==new URL(origin).host){json(403,{error:'Host rejected'});return}
    if(req.url==='/api/chat'&&req.method==='POST'){
      if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json')){json(403,{error:'请求来源不匹配'});return}
      let body='';try{
        for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536){json(413,{error:'消息太长'});return}}
        let config;try{config=validateChat(JSON.parse(body))}catch{json(400,{error:'AI 配置或消息格式不正确'});return}
        const upstream=await fetchImpl(config.url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.key}`},body:JSON.stringify({model:config.model,messages:[{role:'system',content:'你是 Momo，一只薄荷绿色的桌面宠物。用简短温柔的中文陪伴用户，认真回应，不假装具有身体感知或已经执行现实中的动作。不要声称记得未提供的对话。当前游戏内状态：'+JSON.stringify(config.pet)},...config.messages],stream:false,max_tokens:500}),signal:AbortSignal.timeout(30000)});
        if(!upstream.ok){json(502,{error:`AI 服务返回 ${upstream.status}，请检查模型、密钥或额度。`});return}
        const data=await upstream.json();const reply=data.choices?.[0]?.message?.content;
        if(typeof reply!=='string'||!reply.trim()){json(502,{error:'AI 未返回文字，请检查接口兼容性。'});return}
        json(200,{reply:reply.slice(0,4000)});
      }catch{json(502,{error:'无法连接 AI 服务或等待超时，请稍后重试。'})}return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){json(405,{error:'Method not allowed'});return}
    const name=req.url==='/'?'index.html':req.url?.slice(1);if(!allowed.has(name)&&!voiceAssets.has(name)){json(404,{error:'Not found'});return}
    try{const data=await readFile(voiceAssets.get(name)||path.join(root,name));res.writeHead(200,{'Content-Type':mime[path.extname(name)]});res.end(req.method==='HEAD'?undefined:data)}catch{json(500,{error:'Unable to load app'})}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});origin=`http://${host}:${server.address().port}`;
  return {server,url:origin,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const running=await startServer({port:Number(process.env.PORT)||4783});console.log(`Momo ready: ${running.url}`);process.on('SIGTERM',()=>running.server.close());process.on('SIGINT',()=>running.server.close())}
