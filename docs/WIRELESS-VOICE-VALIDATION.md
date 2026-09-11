# 无线语音 0.6.0 验证记录

日期：2026-09-11。本记录覆盖软件、构建及随后经用户明确确认的烧录/启动验证，不是完整无线实体验收结论。

## 已完成

| 层次 | 命令 / 方法 | 结果 |
| --- | --- | --- |
| 桌面纯逻辑与网络 | `npm test` | 35/35 通过；包含原功能、绑定存储、错误密钥拒绝、帧校验及渲染积压上限 |
| 固件宿主测试 | `test:firmware`、`:sound`、`:commands`、`:mic`、`:mic-commands`、`:wireless` | 六套通过；麦克风 USB/Wi-Fi 互斥、租约、分包/过期/乱序与参数校验 |
| 实际跨语言加密与 TLS | `npm run test:wireless:interop` | 使用当前 ESP-IDF 的 Mbed TLS 3.6.6 编译原生测试，真实固件解密函数读取桌面加密配网；篡改被拒绝；C 客户端对 Node 与 Electron 接收端各完成三轮 PCM 开始/收帧/停止 |
| 界面回归 | `MOMO_TEST_BROWSER=bundled MOMO_TEST_PORT=4787 npm run test:ui` | 24/24 通过；其中无线 5 项涵盖三轮、断线、不回退、接收开关与 USB 绑定→BLE 配网成功流程；设备、VAD 和语音后端为模拟 |
| 原生应用 | `node scripts/smoke-wireless-desktop.mjs` | 独立临时配置和测试端口 4788；八键、无线设置、默认不监听、IPC 校验与渲染器隔离通过，无页面错误 |
| ESP-IDF | 5.5.5，目标 ESP32-S3，体积优化配置 | 完整构建成功；随后应用区烧录及哈希校验通过 |
| Apple Silicon 应用打包 | Electron 40.0.0 / arm64 | `dist/wireless/Momo-darwin-arm64/Momo.app`，未进行 Developer ID 签名、公证 |

跨语言测试是实际 TLS/密码库互操作，但运行在电脑上；不覆盖 ESP32 无线射频、网络吞吐、板载麦克风电声质量或真实 AI 识别回答。界面模拟三轮也不等于真人三轮。

## 固件产物

- 配置：`firmware/build-wireless/sdkconfig-release`，`CONFIG_COMPILER_OPTIMIZATION_SIZE=y`。
- 应用：`firmware/build-wireless/momo_easyinput.bin`。
- 二进制大小：`0xed9c0`（973,248 字节），原有 `0x100000` 应用分区剩余 `0x12640`（75,328 字节，约 7%）。
- 应用 SHA-256：`69e141f82f7cf0cc4414b366d9e021550e68e72e2a3cdc9971ac5ba11ac253c3`。
- 分区表 SHA-256：`7f00b6c042a89b15b0cac534f82ed988caf29278ff5700b0c511eb1b5bb7c820`，与既有 `firmware/build-ble` 分区表字节一致。
- 调试优化配置曾超过应用分区，已采用体积优化；没有通过扩大分区、擦 NVS 或改 GPIO 来绕过。

产物被 Git 忽略；重新构建可能改变哈希。烧录前另行从实板 `0x8000` 读取了 4 KB，确认其中分区表与当前构建匹配：NVS `0x9000/24K`、PHY `0xf000/4K`、factory `0x10000/1M`。

## 已完成的烧录与启动验证

- 用户明确确认目标 D680 后，重新读取芯片与 MAC 并匹配；目标 ESP32-S3，16 MB Flash，原生 USB Serial/JTAG。
- 仅写 `0x10000` 起的 973,248 字节，擦写扇区范围 `0x10000–0xfdfff`。没有写启动程序、分区表、NVS 或 PHY 数据，没有整片擦除。
- esptool 4.12.0 返回 `Hash of data verified`，写入成功。
- 自动下载路径，随后完成 post-flash prepare 身份复核和 verify 串口采集。结果 `POST_FLASH_READY=yes`、`APPLICATION_EVIDENCE=matched`、`ROM_DOWNLOAD_MODE=no`。
- 运行日志出现 `SPI_FAST_FLASH_BOOT`，应用 hello 包含 `firmware:0.6.0`、`mic:pcm16-usb-v1`、`wireless:true`、`dropped:0`。
- 重新通过 Momo 连接原生 USB，原生窗口显示 `EasyInput 已连接`，版本 `0.6.0`，电量 98%。这只证明短时启动及协议/UI 链路，不代表长期稳定性或电声验收。
- 本轮自动恢复成功，不要求用户再次按 BOOT。最终恢复后没有再运行 identify/esptool。

## 仍待实体验证

1. USB 初次绑定、BLE 配网、密码错误/认证失败提示；关机重启后保存的配置可用。
2. **拔掉 USB，板子电池供电，真人连续说三轮并收到 Mac 回复**。分别记录有效采样、识别、端到端延迟、回声和收音距离。
3. 同时按键、旋钮和操作音，检查 BLE/Wi-Fi 共存、音频丢帧、供电及既有活动不回归。
4. Wi-Fi 断开、Mac 接收关闭、应用退出、重连；确认录音停止，不自动恢复或改用电脑麦克风。

本轮没有提交或推送 Git，没有修改既有 GPIO8 共享电源、GPIO12 或 BOOT 操作。仅升级了用户明确确认的开发板应用固件。
