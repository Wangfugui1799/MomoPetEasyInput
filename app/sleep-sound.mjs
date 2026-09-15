// 睡眠助眠音：与 Soundscape 一样全部用 Web Audio 现场合成，不引入任何音频文件。
// 设计目标：音量低、变化慢、没有突发瞬态，适合戴着耳机长时间循环。
export const SLEEP_SOUND_OPTIONS = [
  ['lullaby', '摇篮曲 + 呼吸声'],
  ['snore', 'Momo 的打呼噜'],
  ['off', '安静睡觉'],
];
export const normalizeSleepSound = value => SLEEP_SOUND_OPTIONS.some(([id]) => id === value) ? value : 'lullaby';

// 四个和弦缓慢互转，避免任何一次换和弦被听成"断句"。
export const PAD_CHORDS = [
  [174.61, 220, 261.63, 329.63],
  [196, 246.94, 293.66, 349.23],
  [146.83, 196, 220, 293.66],
  [164.81, 220, 246.94, 329.63],
];
// 摇篮曲旋律：五声音阶内的级进为主，落音回到主音，听感更"哄睡"。
export const LULLABY_NOTES = [659.25, 783.99, 880, 783.99, 659.25, 587.33, 523.25, 587.33];
// 一次呼吸（吸气+呼气）的时长；打呼噜与呼吸声共用这个周期，保证两者同相。
export const BREATH_SECONDS = 3.6;
export const PAD_MORPH_MS = 9000;
export const BELL_INTERVAL_MS = 2600;

const wrap = (list, step) => list[((step % list.length) + list.length) % list.length];
export const padChordAt = step => wrap(PAD_CHORDS, step);
export const lullabyNoteAt = step => wrap(LULLABY_NOTES, step);
export const clampVolume = value => Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 30;

// 每种风格的配比。snore 保留极少量垫底和弦，否则单独的低频轰鸣会显得干硬。
// 数值按「满音量 100 时整体峰值不越过 0.95」实测标定，见 docs/SLEEP-SOUND.md。
export const SLEEP_MIX = {
  lullaby: { pad: .55, bell: .5, breath: .07, rasp: 0 },
  snore: { pad: .09, bell: 0, breath: .31, rasp: .31 },
};
// 锯齿与噪声进 raspGain 之前先各自衰减，否则两个满幅锯齿相加会直接把峰值推过 1。
const RASP_VOICE = .5;
const RASP_LEVEL = .8;
const RASP_NOISE_LEVEL = .3;

// 布朗噪声比白噪声柔和，更像呼吸的气流而不是"嘶——"。
function noiseBuffer(context, seconds = 4) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + .02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

export class SleepAmbience {
  context = null; master = null; padGain = null; bellGain = null; breathGain = null; raspGain = null;
  padOscillators = []; sources = []; timers = []; fadeTimer = null;
  style = 'lullaby'; volume = 30; playing = false; step = 0; bellStep = 0;

  get gainTarget() { return clampVolume(this.volume) / 100 * .9; }

  setVolume(value) {
    this.volume = clampVolume(value);
    if (this.master && this.playing) {
      const t = this.context.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(this.gainTarget, t + .3);
    }
  }

  // 始终返回 Promise<boolean>：正在播放时立刻换成新风格，否则只记住选择。
  async setStyle(style) {
    const next = normalizeSleepSound(style);
    if (next === this.style) return this.playing;
    this.style = next;
    if (this.playing) return this.start(next);
    if (next === 'off') this.stop();
    return false;
  }

  async start(style = this.style) {
    const next = normalizeSleepSound(style);
    if (next === 'off') { this.style = 'off'; this.stop(); return false; }
    this.style = next;
    this.context ??= new AudioContext();
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('请先点击页面，再播放助眠声音');
    clearTimeout(this.fadeTimer);
    this.teardown();
    this.build();
    this.playing = true;
    const t = this.context.currentTime;
    this.master.gain.setValueAtTime(0, t);
    this.master.gain.linearRampToValueAtTime(this.gainTarget, t + 1.5);
    this.timers.push(setInterval(() => this.morphPad(), PAD_MORPH_MS));
    if (SLEEP_MIX[this.style].bell > 0) this.timers.push(setInterval(() => this.bell(), BELL_INTERVAL_MS));
    return true;
  }

  stop() {
    this.playing = false;
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    clearTimeout(this.fadeTimer);
    const context = this.context, master = this.master;
    if (!context || !master) return;
    const t = context.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + .5);
    this.fadeTimer = setTimeout(() => {
      if (this.playing) return;
      this.teardown();
      if (this.context?.state === 'running') this.context.suspend().catch(() => {});
    }, 620);
  }

  build() {
    const context = this.context, mix = SLEEP_MIX[this.style];
    const master = this.master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);

    // 持续垫底和弦：四个正弦音只做频率缓移，不重新起音，所以永远不会有咔哒声。
    const padGain = this.padGain = context.createGain();
    padGain.gain.value = mix.pad;
    const padFilter = context.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 900;
    padGain.connect(padFilter).connect(master);
    this.padOscillators = padChordAt(0).map(frequency => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const voice = context.createGain();
      voice.gain.value = .25;
      oscillator.connect(voice).connect(padGain);
      oscillator.start();
      this.sources.push(oscillator);
      return oscillator;
    });

    const bellGain = this.bellGain = context.createGain();
    bellGain.gain.value = mix.bell;
    bellGain.connect(master);

    // 呼吸：布朗噪声过低通，音量由一个与呼吸同周期的正弦 LFO 推成 0 → 峰值。
    const breathGain = this.breathGain = context.createGain();
    breathGain.gain.value = mix.breath;
    breathGain.connect(master);
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer(context);
    noise.loop = true;
    const breathFilter = context.createBiquadFilter();
    breathFilter.type = 'lowpass';
    breathFilter.frequency.value = 520;
    noise.connect(breathFilter).connect(breathGain);
    noise.start();
    this.sources.push(noise);
    this.sources.push(this.breathLfo(context, breathGain.gain, mix.breath));

    if (mix.rasp > 0) {
      // 打呼噜：两个略微失谐的锯齿波过低通，得到带颗粒感的低频轰鸣，再用同相 LFO 开合。
      const raspGain = this.raspGain = context.createGain();
      raspGain.gain.value = mix.rasp;
      raspGain.connect(master);
      const raspFilter = context.createBiquadFilter();
      raspFilter.type = 'lowpass';
      raspFilter.frequency.value = 340;
      const raspLevel = context.createGain();
      raspLevel.gain.value = RASP_LEVEL;
      raspFilter.connect(raspLevel).connect(raspGain);
      for (const frequency of [74, 74 * 1.006]) {
        const oscillator = context.createOscillator();
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = frequency;
        const voice = context.createGain();
        voice.gain.value = RASP_VOICE;
        oscillator.connect(voice).connect(raspFilter);
        oscillator.start();
        this.sources.push(oscillator);
      }
      const raspNoise = context.createBufferSource();
      raspNoise.buffer = noise.buffer;
      raspNoise.loop = true;
      const raspBand = context.createBiquadFilter();
      raspBand.type = 'bandpass';
      raspBand.frequency.value = 140;
      raspBand.Q.value = .8;
      const raspNoiseLevel = context.createGain();
      raspNoiseLevel.gain.value = RASP_NOISE_LEVEL;
      raspNoise.connect(raspBand).connect(raspNoiseLevel).connect(raspLevel);
      raspNoise.start();
      this.sources.push(raspNoise);
      this.sources.push(this.breathLfo(context, raspGain.gain, mix.rasp));
    }
  }

  // 单向呼吸包络：基础值 = 深度，LFO 再叠加 ±深度，于是增益在 0 与 2×深度 之间来回。
  breathLfo(context, param, depth) {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 1 / BREATH_SECONDS;
    const gain = context.createGain();
    gain.gain.value = depth;
    oscillator.connect(gain).connect(param);
    oscillator.start();
    return oscillator;
  }

  morphPad() {
    const context = this.context;
    if (!context || !this.padOscillators.length) return;
    const chord = padChordAt(++this.step), t = context.currentTime;
    this.padOscillators.forEach((oscillator, index) => {
      oscillator.frequency.cancelScheduledValues(t);
      oscillator.frequency.setValueAtTime(oscillator.frequency.value, t);
      oscillator.frequency.linearRampToValueAtTime(chord[index], t + 4.5);
    });
  }

  bell() {
    const context = this.context;
    if (!context || !this.bellGain) return;
    const t = context.currentTime, oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = lullabyNoteAt(this.bellStep++);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(.5, t + .05);
    gain.gain.exponentialRampToValueAtTime(.0001, t + 3.2);
    oscillator.connect(gain).connect(this.bellGain);
    oscillator.start(t);
    oscillator.stop(t + 3.4);
    this.sources.push(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      const index = this.sources.indexOf(oscillator);
      if (index >= 0) this.sources.splice(index, 1);
    };
  }

  teardown() {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    for (const node of this.sources) {
      try { node.stop(); } catch {}
      try { node.disconnect(); } catch {}
    }
    this.sources = [];
    this.padOscillators = [];
    this.padGain = this.bellGain = this.breathGain = this.raspGain = null;
  }
}
