// 把助眠音在真实 Chrome 里实时渲染成 WAV，供耳朵验收；同时给出客观指标。
// 用途：agent 听不到声音，但可以给出可播放的文件 + 可核对的数字（峰值、咔哒、呼吸周期）。
// 跑法：node scripts/render-sleep-sound.mjs [秒数] [风格,风格] [音量]
// 满音量下峰值超过 CEILING 会以非零码退出——这是防止「调完混音悄悄削波」的硬闸门。
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {startServer} from '../server.mjs';

const seconds = Number(process.argv[2]) || 30;
const styles = (process.argv[3] || 'lullaby,snore').split(',').filter(Boolean);
const volume = process.argv[4] === undefined ? 100 : Number(process.argv[4]);
const CEILING = .95;
const targetRate = 16000;
const outDir = fileURLToPath(new URL('../docs/sleep-sound-preview/', import.meta.url));
const chromePath = process.env.MOMO_TEST_BROWSER === 'bundled' ? undefined : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const page$ = (selector, root = document) => root.querySelector(selector);

function encodeWav(samples, rate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples.length * 2, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}

function decimate(samples, factor) {
  if (factor <= 1) return samples;
  const length = Math.floor(samples.length / factor);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += samples[i * factor + k];
    out[i] = sum / factor;
  }
  return out;
}

// 每 50ms 一个 RMS 窗口；再用自相关找主周期（应等于 BREATH_SECONDS = 3.6s）。
function envelope(samples, rate, windowMs = 50) {
  const size = Math.round(rate * windowMs / 1000);
  const frames = Math.floor(samples.length / size);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let k = 0; k < size; k++) { const v = samples[i * size + k]; sum += v * v; }
    out[i] = Math.sqrt(sum / size);
  }
  return out;
}

function dominantPeriod(env, windowMs = 50) {
  const maxLag = Math.floor(env.length / 2);
  let best = 0, bestScore = -Infinity;
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  for (let lag = Math.round(1000 / windowMs); lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < env.length; i++) sum += (env[i] - mean) * (env[i + lag] - mean);
    const score = sum / (env.length - lag);
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  return best * windowMs / 1000;
}

function analyse(samples, rate) {
  let peak = 0, sumSquares = 0, sum = 0, maxJump = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    peak = Math.max(peak, Math.abs(v));
    sumSquares += v * v; sum += v;
    if (i) maxJump = Math.max(maxJump, Math.abs(v - samples[i - 1]));
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  const env = envelope(samples, rate);
  const db = value => (value > 0 ? (20 * Math.log10(value)).toFixed(1) : '-inf');
  return {
    peak: peak.toFixed(4), peakDb: db(peak),
    rms: rms.toFixed(4), rmsDb: db(rms),
    dcOffset: (sum / samples.length).toFixed(6),
    maxJump: maxJump.toFixed(4),
    breathPeriod: dominantPeriod(env).toFixed(2),
  };
}

const server = await startServer({port: 0});
const browser = await chromium.launch({executablePath: chromePath, args: ['--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage();
// 服务器页面带 CSP 且白名单很严；这里由测试自己喂一个页面，只为注入模块，不改动 app/。
await page.route('**/sleep-render.html', route => route.fulfill({
  contentType: 'text/html; charset=utf-8',
  body: '<!doctype html><meta charset="utf-8"><script type="module">import {SleepAmbience} from "/sleep-sound.mjs";window.SleepAmbience=SleepAmbience;</script>',
}));
await page.goto(`${server.url}/sleep-render.html`);
await page.waitForFunction(() => typeof window.SleepAmbience === 'function');

await mkdir(outDir, {recursive: true});
const report = [];
try {
  for (const style of styles) {
    const captured = await page.evaluate(async ({style, seconds, volume}) => {
      const ambience = new window.SleepAmbience();
      ambience.volume = volume;
      await ambience.start(style);
      const context = ambience.context;
      const frames = [];
      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = event => frames.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      ambience.master.connect(processor);
      processor.connect(context.destination);
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      processor.disconnect();
      ambience.stop();
      const total = frames.reduce((n, frame) => n + frame.length, 0);
      const merged = new Float32Array(total);
      let offset = 0;
      for (const frame of frames) { merged.set(frame, offset); offset += frame.length; }
      let binary = '';
      const bytes = new Uint8Array(merged.buffer);
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return {rate: context.sampleRate, base64: btoa(binary)};
    }, {style, seconds, volume});

    const raw = new Float32Array(Buffer.from(captured.base64, 'base64').buffer);
    const factor = Math.max(1, Math.round(captured.rate / targetRate));
    const samples = decimate(raw, factor);
    const rate = Math.round(captured.rate / factor);
    const file = path.join(outDir, `${style}.wav`);
    await writeFile(file, encodeWav(samples, rate));
    const stats = analyse(samples, rate);
    const silent = samples.every(value => value === 0);
    report.push({style, file, rate, seconds: (samples.length / rate).toFixed(1), silent, ...stats});
  }
} finally {
  await browser.close();
  await server.close();
}

for (const row of report) {
  console.log(`\n${row.style}  ${row.file}`);
  if (row.silent) { console.log('  ⚠️ 整段是静音：headless 下音频图没有被拉动，这份录音不可用。'); continue; }
  console.log(`  ${row.seconds}s @ ${row.rate}Hz  音量 ${volume}`);
  console.log(`  峰值 ${row.peak} (${row.peakDb} dBFS)   整体 RMS ${row.rms} (${row.rmsDb} dBFS)`);
  console.log(`  直流偏移 ${row.dcOffset}   相邻采样最大跳变 ${row.maxJump}`);
  console.log(`  包络主周期 ${row.breathPeriod}s（30 秒窗口只有约 8 次呼吸，这个数字仅供参考）`);
}

const clipped = report.filter(row => !row.silent && Number(row.peak) > CEILING);
const silent = report.filter(row => row.silent);
if (silent.length) { console.error(`\n✗ 有 ${silent.length} 段是静音，录音无效。`); process.exit(2); }
if (clipped.length) { console.error(`\n✗ ${clipped.map(row => row.style).join('、')} 在音量 ${volume} 下峰值超过 ${CEILING}，会削波。`); process.exit(1); }
console.log(`\n✓ 全部风格在音量 ${volume} 下峰值均未超过 ${CEILING}。`);
