# Momo EasyInput 协议 v1

## 传输与握手

115200 baud（UART）；原生 USB Serial/JTAG 为 CDC 字节流。UTF-8、JSON Lines，每帧最长 512 字符，以换行分隔。固件额外发送前导换行，允许传输失败后的后续帧重新同步。

每 2 秒发送：

```json
{"protocol":"momo-easyinput/1","type":"hello","board":"easyinput-v2","firmware":"0.2.0","sound":true,"dropped":0}
```

这是应用协议兼容性握手，不是加密认证或芯片 MAC 验身。0.2.0 增加下述音效设置命令；不提供固件写入或复位命令。旧固件缺少 `sound:true` 时，主机禁用音效设置，原有输入仍然可用。

## 输入事件

```json
{"protocol":"momo-easyinput/1","type":"key","key":1}
{"protocol":"momo-easyinput/1","type":"rotate","delta":1}
{"protocol":"momo-easyinput/1","type":"press"}
{"protocol":"momo-easyinput/1","type":"long_press"}
```

- `key`：整数 1–8，稳定按下发送一次；不连发。使用主机映射到八种活动。
- `delta`：仅 +1 / −1；正交相位查表累计四个有效跳变为一步，非法双位跳变清零。物理顺逆时针待实测，应用可反转。
- `press`：旋钮短按释放时发送。
- `long_press`：按住达到 600 ms 发送一次，随后释放不再发送 `press`。
- 输入扫描 1 ms，独立按键消抖 20 ms；开机已按住的键在首次释放前不触发。
- 队列 32 项，采样不等待串口。拥塞时丢弃新事件并增加 `dropped`，没有事件重传保证。

主机忽略不合法 JSON、未知协议/类型、越界按键和步长、过长帧。接入时先收到有效 `hello`，随后才分发事件；每次连接重建解析缓冲。

## 操作音效命令（0.2.0）

USB 与 UART 分别接收有界 JSON Lines，每帧最多 512 字节。回执只发送到请求来源端口，输入事件和 hello 仍向两端发送。请求 id 为 1～2147483647 的整数；主机每次连接后先读取设备配置，不以本地缓存覆盖设备。

```json
{"protocol":"momo-easyinput/1","type":"sound_get","id":1}
{"protocol":"momo-easyinput/1","type":"sound_set","id":2,"enabled":true,"volume":30}
{"protocol":"momo-easyinput/1","type":"sound_preview","id":3}
{"protocol":"momo-easyinput/1","type":"sound_state","id":2,"ok":true,"enabled":true,"volume":30,"ready":true,"error":"none","audio_error":"none","storage_error":"none"}
```

- `sound_set` 必须同时提供布尔 `enabled` 和整数 `volume`（0～100），NVS 写入与提交成功后才应用并回复成功。相同有效配置不重复写入。
- `sound_get` 返回当前设备状态；`ok:true` 只表示读取请求成功，音频与存储健康分别看 `ready`、`audio_error`、`storage_error`。
- `sound_preview` 仅请求设备播放短音，遵守静音、音量和合并规则；回执不证明扬声器物理出声。
- 音频错误包括 `initializing`、`power_enable`、`audio_task`、`audio_allocate`、`audio_initialize`、`audio_enable`、`audio_write`。存储错误包括 `storage_invalid`、`storage_unavailable`、`storage_write`。
- 参数非法返回 `ok:false/error:invalid_settings`；保存失败返回 `ok:false/error:storage_write`。非法协议、未知命令、无效 id、坏 JSON 或超长帧被丢弃，并在下一个换行恢复。
- 主机只接受匹配当前请求 id 的回执，3 秒未确认则断开并提示重新连接。每次只允许一个在途命令。超时或写入失败后，不推断设备是否已经持久化，应重新读取确认。
- 硬件声音在消抖后的 `INPUT_DOWN` 和有效旋转步进处本地触发。旋钮短按仍在释放时向电脑发送 `press`；本地按压音在按下时响，不等电脑，也不在长按判定或释放时重播。
- 八键和旋钮操作合并只影响声音，原有事件队列与丢包计数保持不变。

## 硬件映射及外设


S1–S8 = GPIO 2 / 47 / 38 / 41 / 1 / 6 / 7 / 48；编码器 A / B / 按压 = 17 / 16 / 18。全部输入使用上拉、主键低有效。GPIO0 只用于板上 BOOT，USB GPIO19 / 20 不重新配置为普通 IO。

GPIO8 与下游输出先预装低再设方向，GPIO11 disabled / floating；随后将 GPIO8 拉高，等待项目暂定的 50 毫秒，再初始化扬声器 I2S。50 毫秒不是已测得的板级最短稳定时间，烧录前仍需确认共享电源稳定条件。

扬声器 BCLK / WS / DOUT 为 GPIO14 / 13 / 15，16 kHz、16 bit、Philips I2S、左右声道相同。两块 64 帧 DMA 缓冲自动清零，独立播放任务持续输出短音或零样本；音色长度 20 毫秒，有零端点包络，音量变化用 4 毫秒斜坡平滑。声音邮箱最多保留一个事件，25 毫秒起点间隔，过期事件直接丢弃。

GPIO8 在清醒期间保持开启；静音只改变音频样本，不切断共享电源。尚无 LED 帧、RMT、麦克风采集、电池采样或深睡眠。应用“睡觉”只改变宠物状态。首次默认开启、30% 音量；存储异常时静音，不擦除 NVS。后续增加共享外设消费者时须共同协调电源与音频资源。

串口事件不是现有 Maker Host Action 合同，也不是普通键盘 HID 报告。本工程未移植或修改任何其他应用工程。
