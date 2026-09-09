# EasyInput 麦克风与 S5 语音操作

2026-09-09 实现范围（应用区已烧录并校验，重启运行与实板收音待验证）。

- S5 选择聊天活动，旋钮切换「语音聊天 / 文字聊天 / 关闭麦克风」，短按确认。语音聊天打开对话并开启已保存的默认音源；已开启时仅回到原会话。其他 S 键仍切换活动，关闭对话不停止语音。
- 设置中选择系统默认麦克风、电脑具体音频输入设备、EasyInput 板载麦克风（原生 USB）。选择自动保存；切换音源先停止当前语音，下一次开始使用新音源，不暗中回退到另一支麦克风。
- 键盘音源使用当前 Momo 的 USB Serial/JTAG 连接；UART 桥接或 BLE 不提供音频能力。0.4.0 及以前固件不支持，界面提示需升级固件。
- 回复仍从电脑播放。保留现有 VTuber 后端与自动轮流对话，不增加板载扬声器 TTS。

## 板端与传输

板型 EasyInput V2.0 / AI Keyboard V2.1。麦克风 BCLK/WS/DIN 为 GPIO9/10/11。保留 GPIO8 共享电源、GPIO12 与 BOOT 逻辑。接收器使用独立 I2S 控制器与 32-bit 标准 I2S 时隙，转换为 16 kHz、16-bit、单声道 PCM。

原生 USB 专用能力 `mic: "pcm16-usb-v1"`。命令 `mic_start / mic_ping / mic_stop` 带请求 id 与 stream；回复 `mic_state`，数据 `mic_audio` 带 stream、递增 seq 和 128 个样本的 Base64 小端 PCM。每帧小于原有 512 字符上限，由主循环统一写 USB，音频不复制到 115200 UART 或 BLE。

麦克风默认不采集。启用后客户端每秒续租，板端超时自动停止；思考/播放时停止上传，下一轮用新的 stream 开始。旧 stream、乱序、丢包、队列溢出与超时不能作为正常音频继续识别。USB 硬件吞吐必须实测，不能把配置的虚拟串口 baudRate 当作真实 USB 吞吐。

## 验收

电脑测试覆盖输入源持久化、设备丢失、S5 两步操作、串口数据校验、乱序/断连/停止以及原有语音。固件先宿主测试再 ESP-IDF build。烧录必须另获明确授权；需要实板验证左右时隙、音量、噪声、连续三轮、断线停止与按键同时使用。

## 已完成验证（2026-09-09）

- `npm test`：30 项电脑逻辑测试通过，包含 PCM 帧边界、声道解码、丢帧、停止中的启动竞争和输入源读取。
- `MOMO_TEST_BROWSER=bundled npm run test:ui`：19 项浏览器回归通过；后续补测输入源重启持久化和精确设备缺失后不回退。
- 固件宿主测试：原按键、操作音、音效命令通过；新增麦克风租约、时钟回绕、过期命令、PCM 编码与麦克风命令测试通过。I2S 宿主桩仅验证软件控制路径，不代表电气波形或真实音频。
- `MOMO_VOICE_FIXTURE=/tmp/momo-voice-loop.wav node scripts/test-keyboard-voice.mjs`：独立 Electron 窗口使用合成中文 WAV 模拟 USB PCM，实际加载 Silero v5／ONNX 模型并连接本机 VTuber，连续完成三轮；2152 帧，4 次启用与 4 次停止（含最后恢复倾听后手动停止），页面错误 0。关闭聊天对话框后仍完成后续轮次。未打开真实串口或电脑麦克风。
- ESP-IDF v5.5.5，ESP32-S3，固件 0.5.0 构建成功，产物在 `firmware/build-ble/`。
- 经用户确认后，已通过原生 USB 写入应用区 `0x10000–0x8C8AF`（510128 字节），实际擦除扇区 `0x10000–0x8CFFF`；工具报告 `Hash of data verified`。板上分区表与构建一致，保留引导程序、分区表、NVS 与 PHY 数据。固件 SHA-256：`c890b547c8cfd39d15b4f8eb9393ed28e3f804eda1efc83efcbf7b5c0c7f5378`。
- 手动进入下载模式后完成写入，已提示关机再开机；尚未收到恢复完成反馈，未验证本版正常运行或真实麦克风收音。

## 实现与待实板确认

- `app/voice-input.mjs` 保存默认输入，`app/keyboard-microphone.mjs` 管理 USB 流与续租，`app/keyboard-vad.mjs` 将每四帧合并为 Silero 的 512 样本输入。仍只通过 VTuber 的 `mic-audio-data` / `mic-audio-end` 提交完整句子。
- 串口命令共享一个写队列，避免续租与音效设置争用 writer；USB 音频输出仅由固件主任务写入。主任务缓冲区使用静态存储，避免压缩已有 4 KB 任务栈余量。
- I2S TX 固定使用控制器 0，麦克风 RX 使用控制器 1。DMA 溢出、USB 写入不足或 3 秒未续租立即关闭接收；默认不开启接收。正常停止发生在思考／播放前和关闭麦克风时。
- 硬件依据是当前板原理图 U12（ZTS6672，SELECT 接高，GPIO9/10/11），引脚与共享电源未改动。[Renesas 官方参考电路](https://www.renesas.com/en/document/sch/renesas-assp-easy-voice-hmi-kit-schematics)也采用 ZTS6672 I2S 麦克风。本次供应商数据手册链接返回 404，因此 **16 kHz、32-bit 双时隙取右路高 16 位是当前项目配置，仍需实板验证时隙、幅度与有效采样率**，不能将软件构建视为芯片时序验收。
- 实板验收还需：真人连续三轮，远近距离／背景噪声／回声，USB 连续吞吐与同时旋转按键，拔线／退出时自动停采，以及麦克风与既有操作音共存。不修改 GPIO8 电源策略，不用其做静音开关；未启用 LED，未变更 BOOT。
