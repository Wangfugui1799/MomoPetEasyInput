# 麦克风聊天实现与验证

日期：2026-09-08。

## 使用

先启动本机 Open-LLM-VTuber，再打开 Momo 聊天窗口，点击输入框左侧麦克风。允许系统麦克风权限后说话，停顿约 900 ms 自动提交。回答结束并显示「正在听」后继续。再次点击麦克风、Escape 或关闭聊天窗口会停止采集、清除待播音频并断开当前语音会话。

本轮新版打包在 `dist/voice/Momo-darwin-arm64/Momo.app`。需退出原来运行的 Momo，再启动新版；原版本仍在 `dist/Momo-darwin-arm64/Momo.app`。

## 实际后端与协议

- 本机 Open-LLM-VTuber 1.2.1，源码 HEAD `992309c`，`ws://127.0.0.1:12393/client-ws`。
- ASR：sherpa-onnx SenseVoice；LLM：当前配置的 DeepSeek；TTS：Edge TTS，`zh-CN-XiaoxiaoNeural`。角色设定沿用后端，未修改为 Momo 人设。
- 收到 `set-model-and-conf` 后创建历史，收到 `new-history-created` 后准备麦克风；忽略后端 `start-mic` 的自动开启指令。
- 本地 `@ricky0123/vad-web` 0.0.29 + ONNX Runtime 1.22.0；VAD v5 自动断句，输出 16 kHz 单声道 Float32，范围 [-1, 1]。
- 每段按 4096 样本发送 `mic-audio-data`，末尾仅一次 `mic-audio-end`。不走 `raw-audio-data`，不同时触发原有 `/api/chat`。
- 显示 `user-input-transcription.text` 及 `audio.display_text.text`；解码 `audio.audio` 的 Base64 WAV，按序播放。
- 开始播放时发 `audio-play-start`；收到 `backend-synth-complete` 且队列播完后发 `frontend-playback-complete`；收到 `conversation-chain-end` 后等待 350 ms 再恢复收音。
- 思考与播放时禁用输入音轨并暂停 VAD；关闭时停止全部音轨、关闭音频上下文、清空队列并发中断。
- 一段话最多一分钟；连接、准备、等待回复有超时；拒绝麦克风、断网、解码失败都可重新点击重试。
- Electron 仅允许当前本机主窗口的音频输入请求，拒绝摄像头及其他页面。打包包含麦克风用途说明。

## 验证结果

- Node 自动化：26 项通过，覆盖原功能、连续三轮协议、顺序播放、重复发送防护、关闭/迟到消息、异常、权限边界与静态资产。
- UI：原有 8 项通过；新增 4 项通过。修复了 Escape 关闭与录音清理的时间差。聊天窄屏没有横向溢出。
- 真实后端文字探测：收到中文模型回答、3 段有效 RIFF/WAV 音频、完整轮次结束。
- Chrome 实际 VAD + 真实后端：合成中文 WAV 作为虚拟麦克风，3 次提交、3 次播放确认、3 次轮次结束，浏览器错误 0。实际音频通过 AudioContext 解码并依次播放，测试进程输出静音。
- 合成测试第一轮识别「你好，请用一句简短的中文问候我。」；后两轮识别为「短的中文问候我。」。循环音频在禁用收音期间仍前进，所以恢复时可能从句中开始；应在界面恢复「正在听」后再开始真人下一句话。
- Electron 40 桌面渲染链路：Web Audio 合成音频流 → 实际 VAD → 真实 ASR/LLM/TTS → 播放完成并恢复倾听，成功一轮；关闭后所有输入音轨 `ended`，页面错误 0。此测试替代了 `getUserMedia` 的音源，不代表系统麦克风权限或实体收音已验证。Electron 原生虚拟文件输入测试读到全零样本，未将其计入通过结果。
- Mac 应用已打包，并比对 8 个运行源码文件与工作区一致；确认包含 VAD 模型、worklet、WASM 与 `NSMicrophoneUsageDescription`。

这些结果不代表真人麦克风三轮验收已完成。尚需用户开口验证：真实麦克风权限、环境噪声、扬声器实际可听、回声抑制和连续三轮体验。

## 复现

常规测试：`npm test`、`npm run test:ui`。

可选真实后端测试（会调用后端配置的模型服务，并在 VTuber 保存测试历史）：

```sh
say -v Tingting -o /tmp/momo-voice-fixture.aiff '你好，请用一句简短的中文问候我。'
afconvert /tmp/momo-voice-fixture.aiff /tmp/momo-voice-fixture.wav -f WAVE -d LEI16@16000 -c 1
# 为 WAV 前后添加静音，确保循环播放时给回复留下时间。
python3 - <<'PYTHON'
import wave
with wave.open('/tmp/momo-voice-fixture.wav', 'rb') as r:
    params, data = r.getparams(), r.readframes(r.getnframes())
with wave.open('/tmp/momo-voice-loop.wav', 'wb') as w:
    w.setparams(params)
    w.writeframes(bytes(16000 * 2) + data + bytes(16000 * 2 * 13))
PYTHON
MOMO_VOICE_FIXTURE=/tmp/momo-voice-loop.wav node scripts/test-voice-browser.mjs
MOMO_VOICE_FIXTURE=/tmp/momo-voice-loop.wav node scripts/test-voice-electron.mjs
```

参考：[VAD 本地资产与音频接口](https://docs.vad.ricky0123.com/user-guide/browser/)、[Electron 权限接口](https://www.electronjs.org/docs/latest/api/session)。后端消息字段以本机源码为准。
