# 旋钮长按唤回 Momo

2026-09-13：沿用固件的 600 ms `long_press` 事件，通过 USB / BLE 的统一输入入口调用桌面窗口唤回接口。桌面主进程检查请求来自当前主窗口的同源主框架，再恢复最小化窗口、显示窗口并激活 Momo。保留关闭弹窗或取消训练 / 选择的原有行为，不改变窗口置顶设置。应用必须保持运行且已连接键盘；无需更新固件。

## 验证结果

- `npm test`：53 项通过。
- `npx playwright test tests/ui/bluetooth.spec.mjs tests/ui/app.spec.mjs --grep 'Bluetooth|serial handshake'`：2 项通过，覆盖 USB 握手、浏览器无桌面接口时长按关闭面板、BLE 长按调用唤回接口，以及普通 BLE 输入不请求窗口焦点。
- `npm run package:mac`：完成，产物为 `dist/Momo-darwin-arm64/Momo.app`。
- 原生 Electron 集成测试使用真实桌面窗口、preload / IPC 和模拟 USB 事件：隐藏窗口、macOS 隐藏应用、后台窗口均成功唤回；关闭设置弹窗、保持非置顶状态和拒绝其他窗口 IPC 均通过。
- 最小化用例未完成：开发态和打包应用在测试环境执行 `win.minimize()` 后，均未进入 `isMinimized() === true` 状态，测试在前置状态检查超时。尚不能据此确认最小化恢复的系统行为。
- 未进行实体旋钮操作验证；模拟输入不能代替实板验收。

## 复测

开发态：`node scripts/test-window-focus.mjs`。

打包态：设置 `MOMO_TEST_EXECUTABLE` 为 Momo.app 内 `Contents/MacOS/Momo` 的绝对路径，再运行同一脚本。脚本使用临时用户目录和端口 4796，不连接实体设备；全部用例通过才会以成功状态退出。

实体检查：打开新版 Momo，通过 USB 或 BLE 连接键盘，切换到其他应用、隐藏或最小化 Momo 后分别长按旋钮 600 ms，确认窗口回到前台。完全退出 Momo 后不支持由旋钮启动应用。
