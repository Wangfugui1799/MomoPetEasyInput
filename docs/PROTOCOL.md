# Momo EasyInput 协议 v1

## 传输与握手

115200 baud（UART）；原生 USB Serial/JTAG 为 CDC 字节流。UTF-8、JSON Lines，每帧最长 512 字符，以换行分隔。固件额外发送前导换行，允许传输失败后的后续帧重新同步。

每 2 秒发送：

```json
{"protocol":"momo-easyinput/1","type":"hello","board":"easyinput-v2","firmware":"0.1.0","dropped":0}
```

这是应用协议兼容性握手，不是加密认证或芯片 MAC 验身。固件不接收远程命令，不刷写、不复位。

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

## 硬件映射及未使用外设

S1–S8 = GPIO 2 / 47 / 38 / 41 / 1 / 6 / 7 / 48；编码器 A / B / 按压 = 17 / 16 / 18。全部输入使用上拉、主键低有效。GPIO0 只用于板上 BOOT，USB GPIO19 / 20 不重新配置为普通 IO。

本固件不启动共享外设：GPIO8 预装低再设输出，始终维持关闭；GPIO9 / 10 / 12 / 13 / 14 / 15 预装低后设输出；GPIO11 disabled / floating。无 LED 帧、无 RMT、无 I2S、无电池采样、无深睡眠、无 GPIO8 上电时序。应用“睡觉”只改变宠物状态。

串口事件不是现有 Maker Host Action 合同，也不是普通键盘 HID 报告。本工程未移植或修改任何其他应用工程。
