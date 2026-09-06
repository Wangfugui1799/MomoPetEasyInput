# Momo 0.2.0 操作音效烧录与启动验证

2026-09-06，用户授权“烧录”并在验证中断后要求“继续”。

## 已验证

- 释放旧 Momo 的串口连接后，确认目标为 ESP32-S3、MAC 尾号 D6:80，与写入前后身份一致。
- 读取现有分区表并与本地构建逐字节比较，一致。因此只写应用，不改启动程序、分区表或 NVS，不整片擦除。
- 应用 256864 字节写入地址 0x10000，擦写扇区范围 0x10000–0x4EFFF；工具报告 `Hash of data verified`。
- 自动进入下载与恢复流程。先前验证会话在额度中断期间过期，续做时按正式流程重新 prepare，随后 verify 成功。
- `POST_FLASH_READY=yes`、`EXPECT_MATCH=yes`、`APPLICATION_EVIDENCE=matched`、`ROM_DOWNLOAD_MODE=no`。启动完成后未再运行 esptool 或读 MAC。
- 应用协议实际返回 `firmware:0.2.0`、`sound:true`、`dropped:0`。
- 通过 `sound_get` 实际读取：`enabled:true`、`volume:30`、`ready:true`，`error/audio_error/storage_error` 均为 `none`。
- 已重新打开新版 Mac Momo 并恢复 cu.usbmodem1101 连接，界面实际显示 EasyInput · 0.2.0；设置显示音效开启、30% 和“已读取键盘设置”。已返回主界面。

固件 SHA-256：`351888c526202ce4ae14667c43442ddca0a5d5380343dfb9a2e193e9558b178b`。

## 用户反馈与后续验收

用户随后反馈“不错”，已初步认可本轮使用效果；尚未记录逐键、旋钮旋转及按压的完整试听矩阵、延迟测量、断电保存和外设共存验收。共享电源 50 毫秒等待已随固件运行，但仍没有电源波形资格测量证据。

---

# Momo 0.1.0 烧录与启动验证

2026-09-05，用户明确授权开始烧录，并先后完成 BOOT 与关机再开机操作。

## 已验证

- 原生 USB 端口识别目标为 ESP32-S3；写入前及最终恢复前核对 MAC，匹配本轮目标。
- 启动程序、分区表和 Momo 应用三段写入均报告 Hash of data verified。
- 擦写扇区：0x00000000–0x00005FFF、0x00008000–0x00008FFF、0x00010000–0x00041FFF；未整片擦除。
- 关机再开机后收到应用协议 momo-easyinput/1、board easyinput-v2、firmware 0.1.0 的完整 hello。
- 启动检查：POST_FLASH_READY=yes、EXPECT_MATCH=yes、APPLICATION_EVIDENCE=matched、ROM_DOWNLOAD_MODE=no。恢复后未运行 esptool 或重新读取 MAC。
- 桌面 Momo 实际连接 cu.usbmodem1101，界面显示 EasyInput 已连接，帮助文字显示 EasyInput · 0.1.0。

## 本轮电脑端修复

- Electron 权限检查改为比较规范化的 origin，处理 origin 带末尾斜杠的情况；仍限制同一应用窗口、同源地址和 serial 权限。
- 焦点在按钮/链接上时，Enter 交给当前控件，避免被全局宠物确认快捷键拦截。
- 新增同源斜杠、不同端口、不同窗口、无窗口、其他权限和伪造域名测试；11 项电脑逻辑/API测试通过。
- 已重新打包、启动并在真实桌面界面完成设备选择与握手。

## 证据边界

写入校验、应用正常启动、桌面应用连接三步均有各自证据。尚未逐个观察实体 S1–S8、旋钮每格相位数/方向、短按/长按与拔插恢复；不能用握手或模拟事件测试宣称实体功能矩阵通过。

固件应用 SHA-256：31d85bc8c604946f04db3ac9b553a99246d0c360f50297466ef25f2ddc086e8b。
