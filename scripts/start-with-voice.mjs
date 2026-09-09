// Own only the child processes started here; never stop an already-running backend.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
let server,desktop,closing=false;
function stop(code=0){if(closing)return;closing=true;desktop?.kill('SIGINT');server?.kill('SIGINT');process.exitCode=code}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
async function health(){try{const r=await fetch('http://127.0.0.1:12393/health',{signal:AbortSignal.timeout(1500)});if(!r.ok)return false;return (await r.json()).service==='momo-voice'}catch{return false}}
try{
  if(!await health()){
    server=spawn('uv',['run','--locked','--project','voice-server','voice-server/run_momo.py'],{cwd:root,stdio:'inherit'});
    let failure;server.on('error',e=>{failure=e.message});server.on('exit',code=>{if(!closing){failure='语音服务已退出：'+code;if(desktop)stop(1)}});
    const deadline=Date.now()+10*60*1000;
    while(!await health()){
      if(closing)break;
      if(failure)throw Error(failure+'。请先运行 npm run voice:check；旧后端占用 12393 时请先关闭它。');
      if(Date.now()>deadline)throw Error('等待语音服务超时，请单独运行 npm run voice:server 查看下载或启动日志。');
      await new Promise(r=>setTimeout(r,1000));
    }
  }
  if(!closing){desktop=spawn(require('electron'),['.'],{cwd:root,stdio:'inherit'});desktop.on('error',e=>{console.error(e.message);stop(1)});desktop.on('exit',code=>stop(code||0))}
}catch(e){console.error(e.message);stop(1)}
