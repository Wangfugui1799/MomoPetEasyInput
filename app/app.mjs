import {VoiceChat} from './voice.mjs';
import {createBrowserAudio} from './voice-audio.mjs';
import {KeyboardSoundPanel} from './keyboard-sound.mjs';
import {MODES,initialState,restoreState,ageState,act,localReply,addDiary} from './core.mjs';
import {BluetoothConnection} from './bluetooth.mjs';
import {KeyboardConnection} from './serial.mjs';import {Soundscape} from './sound.mjs';
const $=s=>document.querySelector(s),storageKey='momo.pet.v1';
let state=initialState(),mode=5,choice=0,reverse=false,ai=null,history=[],chatBusy=false,game=null,toastTimer,animationTimer;
try{state=restoreState(JSON.parse(localStorage.getItem(storageKey)))}catch{}
choice=state.outfit;
const music=new Soundscape();
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4500)}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(state))}catch{$('#save-label').textContent='本地存储不可用，关闭前请导出日记'}}
function speak(text){$('#speech').textContent=text}
function cancelGame(){if(game)cancelAnimationFrame(game.frame);game=null;$('#training').classList.add('hidden');$('.control-panel').classList.remove('playing')}
function select(index){cancelGame();mode=index;choice=MODES[mode].id==='dress'?state.outfit:0;render();speak(state.sleeping&&mode!==7?'我在梦里散步呢……按「睡觉」叫醒我吧。':MODES[mode].hint)}
function rotate(delta){if(game)return;choice=(choice+delta+MODES[mode].options.length)%MODES[mode].options.length;render()}
function render(){
  const m=MODES[mode];$('#mode-counter').textContent=`${String(mode+1).padStart(2,'0')} / 08`;$('#mode-icon').textContent=m.icon;$('#mode-name').textContent=`${m.name}时间`;$('#mode-title').textContent=m.title;$('#mode-hint').textContent=m.hint;
  $('#option-symbol').textContent=m.symbols[choice];$('#option-name').textContent=m.options[choice];$('#knob-indicator').style.transform=`rotate(${choice*270/Math.max(1,m.options.length-1)-135}deg)`;
  $('#confirm').replaceChildren(document.createTextNode(game?'就是现在！':m.id==='sleep'&&state.sleeping?'早安，叫醒 Momo':m.id==='music'&&music.track===choice?'停止播放':m.verb));
  const arrow=document.createElement('span');arrow.textContent='↵';$('#confirm').append(arrow);
  $('#option-dots').replaceChildren(...m.options.map((name,i)=>{const b=document.createElement('button');b.className=i===choice?'active':'';b.setAttribute('aria-label',name);b.setAttribute('aria-pressed',String(i===choice));b.onclick=()=>{if(!game){choice=i;render()}};return b}));
  document.querySelectorAll('.key').forEach((b,i)=>{b.classList.toggle('active',i===mode);b.setAttribute('aria-pressed',String(i===mode))});
  for(const k of ['hunger','mood','energy','bond']){$(`#${k}-bar`).style.width=`${state[k]}%`;$(`#${k}-value`).textContent=Math.round(state[k])}
  $('.pet-room').classList.toggle('sleeping',state.sleeping);$('#mood-label').textContent=state.sleeping?'☾ 正在做一个好梦':state.hunger<25?'🍪 想吃一点小点心':state.energy<20?'☁ 有一点点困了':'✦ 今天心情晴朗';
  const outfit=m.id==='dress'&&!state.sleeping?choice:state.outfit;$('#outfit').textContent=['','🎩','🌼','🥳'][outfit];
  $('#day-count').textContent=Math.max(1,Math.floor((Date.now()-state.createdAt)/86400000)+1);
}
function feedback(result){state=result.state;speak(result.text);save();render();const el=$('#pet-wrap');el.classList.remove('bounce');clearTimeout(animationTimer);if(!state.sleeping&&result.effect!=='idle'){void el.offsetWidth;el.classList.add('bounce');animationTimer=setTimeout(()=>el.classList.remove('bounce'),1400)}const burst=$('#effect-burst');burst.textContent={feed:'💕',pet:'💚',train:'⭐',explore:'🍃',dress:'✨',wake:'☀️'}[result.effect]||'';burst.classList.remove('pop');void burst.offsetWidth;burst.classList.add('pop')}
function startTraining(){
  game={start:performance.now(),position:0,difficulty:choice,frame:0};const widths=[30,20,12],w=widths[choice];$('#training-target').style.left=`${50-w/2}%`;$('#training-target').style.width=`${w}%`;$('#training').classList.remove('hidden');$('.control-panel').classList.add('playing');
  function tick(t){if(!game)return;game.position=(Math.sin((t-game.start)/[720,500,330][game.difficulty]-Math.PI/2)+1)*50;$('#training-dot').style.left=`${game.position}%`;game.frame=requestAnimationFrame(tick)}game.frame=requestAnimationFrame(tick);render();speak('盯住那颗光点！进入绿色区域时按下旋钮。');
}
async function confirm(){
  const m=MODES[mode];if(state.sleeping&&m.id!=='sleep'){speak('先叫醒我，再一起玩吧。');return}
  if(m.id==='train'&&state.energy>=8){if(!game){startTraining();return}const win=Math.abs(game.position-50)<=[15,10,6][game.difficulty];cancelGame();feedback(act(state,m.id,choice,{win}));return}
  if(m.id==='chat'){openChat();return}
  if(m.id==='music'){try{const playing=await music.play(choice);speak(playing?`正在播放「${m.options[choice]}」。就这样，慢慢待一会儿。`:'音乐轻轻停下了。');render()}catch(e){toast(e.message)}return}
  feedback(act(state,m.id,choice));if(state.sleeping){music.stop();render()}
}
function openDialog(id){if(!$(id).open)$(id).showModal()}
function addMessage(role,text,error=false){const e=document.createElement('div');e.className=`message ${role}${error?' error':''}`;e.textContent=text;$('#messages').append(e);$('#messages').scrollTop=$('#messages').scrollHeight;return e}
function openChat(){if(!history.length){const text='嗨，我是 Momo。今天想和我聊些什么？';addMessage('assistant',text);history.push({role:'assistant',content:text})}openDialog('#chat-dialog');$('#chat-input').placeholder=['今天过得怎么样？','今天有什么让你开心的小事？','有什么事情想让我陪你一起面对？'][choice];$('#chat-input').focus()}
function renderDiary(){const list=$('#diary-list');list.replaceChildren();if(!state.diary.length){const p=document.createElement('p');p.className='empty-diary';p.textContent='🌱\n我们的故事，才刚刚开始。\n给 Momo 一次摸摸，写下第一个小瞬间。';p.style.whiteSpace='pre-line';list.append(p);return}for(const entry of [...state.diary].reverse()){const item=document.createElement('div');item.className='diary-entry';const time=document.createElement('time');time.textContent=new Date(entry.at).toLocaleString('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});const p=document.createElement('p');p.textContent=entry.text;item.append(time,p);list.append(item)}}
for(const [i,m]of MODES.entries()){const b=document.createElement('button');b.className='key';b.setAttribute('aria-label',`${i+1} ${m.name}`);b.innerHTML=`<span class="key-number">${String(i+1).padStart(2,'0')}</span><span class="key-icon">${m.icon}</span><strong>${m.name}</strong><small>${m.sub}</small>`;b.onclick=()=>select(i);$('#keys').append(b)}
$('#previous').onclick=()=>rotate(-1);$('#next').onclick=()=>rotate(1);$('#confirm').onclick=confirm;$('#knob').onclick=confirm;
$('#knob').addEventListener('wheel',e=>{e.preventDefault();if(Math.abs(e.deltaY)>2)rotate(e.deltaY>0?1:-1)},{passive:false});
document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||e.target.matches('input,textarea,select')||e.metaKey||e.ctrlKey||e.altKey)return;if(e.repeat)return;if(e.key==='Enter'&&e.target.closest('button,a'))return;if(/^[1-8]$/.test(e.key)){e.preventDefault();select(Number(e.key)-1)}else if(e.key==='ArrowLeft'){e.preventDefault();rotate(-1)}else if(e.key==='ArrowRight'){e.preventDefault();rotate(1)}else if(e.key==='Enter'){e.preventDefault();confirm()}else if(e.key==='Escape'){cancelGame();choice=MODES[mode].id==='dress'?state.outfit:0;render();speak('不着急，我们慢慢选。')}});
let batteryTimer;
const handleKeyboardEvent=e=>{if(e.type==='battery'){const el=$('#battery-level');el.hidden=false;el.textContent=e.percent<0?'电量未知':`电量 ${e.percent}%`;el.title='键盘电量';clearTimeout(batteryTimer);batteryTimer=setTimeout(()=>{el.textContent='电量待更新'},25000);return}const dialog=document.querySelector('dialog[open]');if(e.type==='long_press'){if(dialog)dialog.close();else{cancelGame();choice=MODES[mode].id==='dress'?state.outfit:0;render();speak('回来啦，我们换一件事做吧。')}return}if(dialog)return;if(e.type==='key')select(e.key-1);if(e.type==='rotate')rotate(e.delta*(reverse?-1:1));if(e.type==='press')confirm()};
const handleKeyboardStatus=(status,text)=>{if(status!=='connected'){clearTimeout(batteryTimer);$('#battery-level').hidden=true}$('#connection').classList.toggle('connected',status==='connected');$('#connection span').textContent=status==='connected'?'EasyInput 已连接':status==='waiting'?'正在连接…':'连接 EasyInput';$('#connection').title=text;if(status!=='connected')toast(text);soundPanel.connectionChanged(status)};
const usbKeyboard=new KeyboardConnection(handleKeyboardEvent,handleKeyboardStatus);
const bluetoothKeyboard=new BluetoothConnection(handleKeyboardEvent,handleKeyboardStatus);
let keyboard=usbKeyboard;
const soundPanel=new KeyboardSoundPanel(()=>keyboard);
$('#connection').onclick=()=>{if(keyboard.busy)return;if(keyboard.port)return keyboard.disconnect();keyboard=usbKeyboard;return keyboard.connect()};
$('#bluetooth-connect').onclick=()=>{if(keyboard.busy)return;if(keyboard.port){toast('请先点击连接状态断开当前键盘');return}keyboard=bluetoothKeyboard;return keyboard.connect()};
$('#diary-open').onclick=()=>{renderDiary();openDialog('#diary-dialog')};$('#settings-open').onclick=()=>openDialog('#settings-dialog');
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));
let voiceReply=null;
const voice=new VoiceChat({createAudio:createBrowserAudio,
  onState:(status,text)=>{
    const active=voice.active;$('#voice-toggle').setAttribute('aria-pressed',String(active));$('#voice-toggle').setAttribute('aria-label',active?'关闭麦克风':'打开麦克风');$('#voice-toggle').title=active?'关闭麦克风':'打开麦克风';
    $('#voice-status').textContent=text;$('#voice-status').dataset.state=status;
    $('#chat-input').disabled=active&&status!=='listening';$('#send-chat').disabled=chatBusy||(active&&status!=='listening');
    $('#chat-badge').textContent=active?'语音聊天 · VTuber':ai?'AI 对话 · '+ai.model:'本地陪伴 · 预设回复';
    if(status==='listening')voiceReply=null;
  },
  onText:text=>addMessage('user',text),
  onReply:text=>{if(!voiceReply)voiceReply=addMessage('assistant','');voiceReply.textContent=text;$('#messages').scrollTop=$('#messages').scrollHeight;speak(text)},
});
$('#voice-toggle').onclick=()=>{if(voice.active){voice.stop();return}if(chatBusy){toast('请等当前文字回复结束，再打开麦克风');return}music.stop();render();voiceReply=null;void voice.start()};
$('#chat-dialog').addEventListener('cancel',()=>voice.stop());
$('#chat-dialog').addEventListener('close',()=>{voice.stop();voiceReply=null});
window.addEventListener('beforeunload',()=>voice.stop());
$('#chat-form').onsubmit=async e=>{
  e.preventDefault();const input=$('#chat-input').value.trim();if(!input||chatBusy)return;if(voice.active){if(await voice.submitText(input))$('#chat-input').value='';return}chatBusy=true;$('#send-chat').disabled=true;$('#chat-input').value='';addMessage('user',input);history.push({role:'user',content:input});history=history.slice(-24);const pending=addMessage('assistant','Momo 正在想……');
  try{let reply;if(ai){const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...ai,messages:history.slice(-12),pet:{mood:Math.round(state.mood),energy:Math.round(state.energy)}}),signal:AbortSignal.timeout(35000)});const data=await res.json();if(!res.ok)throw Error(data.error||'AI 暂时没有回应');reply=data.reply}else{await new Promise(r=>setTimeout(r,450));reply=localReply(input)}pending.textContent=reply;history.push({role:'assistant',content:reply});state=addDiary(state,'我们聊了一会儿天。被听见的感觉，真好。');state.mood=Math.min(100,state.mood+2);save();render();speak('谢谢你愿意和我分享。我一直在这里。')}
  catch(err){pending.textContent=`${err.name==='TimeoutError'?'等待 AI 超时，请稍后再试。':err.message}（可在设置中恢复本地陪伴）`;pending.classList.add('error')}
  finally{chatBusy=false;$('#send-chat').disabled=false;$('#messages').scrollTop=$('#messages').scrollHeight}
};
$('#export-diary').onclick=()=>{const text=`# Momo · 陪伴日记\n\n${state.diary.map(e=>`- ${new Date(e.at).toLocaleString('zh-CN')}：${e.text}`).join('\n')||'我们的故事，才刚刚开始。'}\n`;const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`Momo-日记-${new Date().toISOString().slice(0,10)}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('#volume').oninput=e=>music.volume=Number(e.target.value)/100;$('#reverse-knob').onchange=e=>reverse=e.target.checked;
$('#always-top').disabled=!window.momoDesktop;$('#always-top').onchange=async e=>{try{await window.momoDesktop.setAlwaysOnTop(e.target.checked)}catch{e.target.checked=false;toast('暂时无法设置窗口置顶')}};
$('#ai-form').onsubmit=e=>{e.preventDefault();try{const endpoint=new URL($('#ai-endpoint').value.trim());if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('请填写不含账号、查询参数的 HTTPS 完整接口地址');const model=$('#ai-model').value.trim(),key=$('#ai-key').value.trim();if(!model||!key)throw Error('请填写模型名称和 API 密钥');ai={endpoint:endpoint.href,model,key};$('#chat-badge').textContent='AI 对话 · '+model;$('#ai-status').textContent='已启用。下一条消息将发往此服务；关闭应用后密钥自动清除。';$('#ai-key').value='';toast('AI 配置已启用，发送消息后会验证连接')}catch(err){$('#ai-status').textContent=err.message}};
$('#ai-clear').onclick=()=>{ai=null;$('#ai-key').value='';$('#ai-status').textContent='已恢复本地预设回复。';$('#chat-badge').textContent='本地陪伴 · 预设回复'};
$('#clear-data').onclick=()=>{if(!window.confirm('确定清除 Momo 的全部养成状态和陪伴日记吗？此操作无法恢复。'))return;state=initialState();history=[];$('#messages').replaceChildren();cancelGame();music.stop();choice=0;save();render();speak('你好呀。我们的故事，从这里重新开始。');$('#settings-dialog').close();toast('已清除本地宠物与日记数据')};
setInterval(()=>{state=ageState(state);save();render()},60000);window.addEventListener('beforeunload',save);
$('#date-label').textContent=`${new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})} · A LITTLE COMPANY, EVERY DAY`;
save();render();
