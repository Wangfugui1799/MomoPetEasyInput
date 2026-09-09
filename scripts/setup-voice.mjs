import {copyFile,chmod} from 'node:fs/promises';
import {constants} from 'node:fs';
const root=new URL('../voice-server/',import.meta.url);
for(const [source,target] of [['.env.example','.env'],['conf.example.yaml','conf.yaml']]){
  try{await copyFile(new URL(source,root),new URL(target,root),constants.COPYFILE_EXCL);await chmod(new URL(target,root),0o600);console.log('已创建 voice-server/'+target)}
  catch(e){if(e.code!=='EEXIST')throw e;console.log('已保留现有 voice-server/'+target)}
}
console.log('请编辑 voice-server/.env，填写自己的 MOMO_LLM_API_KEY；然后运行 npm run voice:check。');
