export const MODES = [
  {id:'feed', name:'喂食', sub:'一口小幸福', icon:'🍪', title:'今天想吃点什么？', hint:'转动旋钮挑选点心，按下请 Momo 吃。', options:['曲奇饼干','甜甜草莓','温热牛奶'], symbols:['🍪','🍓','🥛'], verb:'开饭啦'},
  {id:'pet', name:'摸摸', sub:'靠近一点点', icon:'🤏', title:'把温柔分给我一点。', hint:'转动旋钮调整力度，按下送出摸摸。', options:['轻轻摸头','暖暖拥抱','舒服按摩'], symbols:['👋','🫂','✨'], verb:'摸摸 Momo'},
  {id:'train', name:'训练', sub:'一起变厉害', icon:'🎯', title:'来玩一个默契小游戏。', hint:'选择难度。开始后，光点进入绿色区时按下旋钮。', options:['慢慢来','有点挑战','默契满分'], symbols:['🌱','🎯','🏆'], verb:'开始训练'},
  {id:'explore', name:'探索', sub:'发现小惊喜', icon:'🧭', title:'附近藏着什么小美好？', hint:'挑一个散步的地方，按下旋钮一起出发。', options:['窗边花园','云朵小径','星光池塘'], symbols:['🌿','☁️','🌌'], verb:'一起出发'},
  {id:'chat', name:'聊天', sub:'按一下录音，再按发送', icon:'💬', title:'你的碎碎念，我都在听。', hint:'按 S5 开始录音，说完再按 S5 发送。按下旋钮查看对话。', options:['查看对话'], symbols:['💬'], verb:'查看对话'},
  {id:'dress', name:'装扮', sub:'今天也可爱', icon:'🎩', title:'今天戴哪顶帽子？', hint:'转动旋钮预览，按下就穿上。', options:['原来的我','小小绅士','花园来客','派对时间'], symbols:['✨','🎩','🌼','🥳'], verb:'就穿这一套'},
  {id:'music', name:'音乐', sub:'给生活配个乐', icon:'🎵', title:'一起把日子放慢一点。', hint:'选择一种声音，按下播放，再按一次停止。', options:['云端钢琴','午后风铃','晚安星河'], symbols:['🎹','🎐','🌙'], verb:'播放这一首'},
  {id:'sleep', name:'睡觉', sub:'做个好梦吧', icon:'🌙', title:'休息也是很重要的事。', hint:'按下进入休息，再次确认就会醒来。', options:['眯一小会儿','午后小睡','好好睡一觉'], symbols:['☁️','🛏️','🌙'], verb:'晚安，Momo'}
];
export const clamp = (n,min=0,max=100) => Math.min(max,Math.max(min,n));
export function initialState(now=Date.now()) {
  return {version:1,createdAt:now,updatedAt:now,hunger:65,mood:70,energy:80,bond:12,outfit:0,sleeping:false,diary:[],lastExplore:0};
}
export function restoreState(raw,now=Date.now()) {
  const base=initialState(now);
  if(!raw || raw.version!==1) return base;
  for(const k of ['hunger','mood','energy','bond']) if(Number.isFinite(raw[k])) base[k]=clamp(raw[k]);
  for(const k of ['createdAt','updatedAt','lastExplore']) if(Number.isFinite(raw[k])) base[k]=clamp(raw[k],0,now);
  base.outfit=Number.isInteger(raw.outfit)?clamp(raw.outfit,0,3):0;
  base.sleeping=raw.sleeping===true;
  base.diary=Array.isArray(raw.diary)?raw.diary.filter(e=>e && Number.isFinite(e.at) && typeof e.text==='string').slice(-200).map(e=>({at:e.at,text:e.text.slice(0,300)})):[];
  return ageState(base,now);
}
export function ageState(s,now=Date.now()) {
  const hours=clamp((now-s.updatedAt)/3600000,0,8);
  return {...s,updatedAt:now,hunger:clamp(s.hunger-hours*2),mood:clamp(s.mood-hours*.5),energy:clamp(s.energy+hours*(s.sleeping?14:-2))};
}
export function addDiary(s,text,now=Date.now()) { return {...s,diary:[...s.diary,{at:now,text}].slice(-200)}; }
export function act(state,mode,choice=0,{now=Date.now(),random=Math.random(),win=true}={}) {
  let s=ageState(state,now); const m=MODES.find(m=>m.id===mode);
  if(!m || !Number.isInteger(choice) || choice<0 || choice>=m.options.length) return {state:s,text:'先选一个想做的事情吧。',effect:'idle'};
  if(s.sleeping && mode!=='sleep') return {state:s,text:'Momo 正在做梦。先按「睡觉」把它叫醒吧。',effect:'sleep'};
  let text='',effect=mode;
  switch(mode) {
    case 'feed':
      if(s.hunger>=95) return {state:s,text:'小肚子已经圆滚滚啦，晚点再吃吧。',effect:'idle'};
      s.hunger=clamp(s.hunger+[15,10,12][choice]); s.mood=clamp(s.mood+3); s.bond=clamp(s.bond+1);
      text=`啊呜！${m.options[choice]}好好吃，留一口给你。`; break;
    case 'pet': s.mood=clamp(s.mood+4+choice*2); s.bond=clamp(s.bond+2); text=['你的手暖暖的，好喜欢。','抱住了！今天也站在你这边。','呼噜呼噜……再摸一下嘛。'][choice]; break;
    case 'train':
      if(s.energy<8) return {state:s,text:'有点累啦，先休息一会儿再玩吧。',effect:'idle'};
      s.energy=clamp(s.energy-8); s.mood=clamp(s.mood+(win?8:2)); s.bond=clamp(s.bond+(win?3:1));
      text=win?'击中了！我们真是默契搭档！':'就差一点点！和你一起玩就很开心。'; break;
    case 'explore':
      if(now-s.lastExplore<30000) return {state:s,text:'刚散完步，让我回味一下。30 秒后再出发吧。',effect:'idle'};
      if(s.energy<10) return {state:s,text:'小脚脚有点累，睡一会儿再出门吧。',effect:'idle'};
      s.lastExplore=now;s.energy=clamp(s.energy-10);s.mood=clamp(s.mood+7);
      text=[['在花园捡到一片心形叶子，送给你。','蝴蝶停在我头上啦！今天运气真好。'],['云朵像一块曲奇，我看了好久。','听到了风的悄悄话：你已经很棒了。'],['池塘里有一整片星空！下次还和你来。','捡到一颗发光的小石头，替你许了愿。']][choice][random<.5?0:1]; break;
    case 'dress': s.outfit=choice;text=`换好啦！${m.options[choice]}，你觉得好看吗？`;break;
    case 'sleep': s.sleeping=!s.sleeping;text=s.sleeping?'晚安。我会梦到和你一起散步。':'睡醒啦！又是可以陪着你的一刻。';effect=s.sleeping?'sleep':'wake';break;
    default: return {state:s,text:'我在这里，陪着你。',effect:mode};
  }
  return {state:addDiary(s,text,now),text,effect};
}
export function localReply(input) {
  if(/累|烦|难过|压力|焦虑/.test(input)) return '听起来今天不太轻松。我们先一起慢慢呼吸一下，好吗？你愿意的话，可以接着说，我在。';
  if(/开心|喜欢|成功|完成/.test(input)) return '这件事值得放进今天的小幸福里！我也跟着开心起来啦。最让你高兴的是哪个瞬间？';
  if(/你好|早|嗨/.test(input)) return '你来啦！我刚刚还在想，今天可以陪你做点什么呢。';
  if(/晚安|睡/.test(input)) return '今天辛苦啦。把还没做完的事留给明天，我们先好好休息。';
  return '嗯嗯，我在听。可以再和我说一点吗？哪怕是很小的事，也可以在这里慢慢讲。';
}
