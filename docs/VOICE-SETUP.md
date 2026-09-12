# Momo 语音聊天：从下载到使用

本教程对应 Momo 0.5.0。仓库现在同时包含桌面应用、EasyInput 固件和 `voice-server/` 配套服务端源码。下载 ZIP 或 `git clone` 一次即可，不需要另外克隆 Open-LLM-VTuber，也不需要初始化 Live2D 前端子模块。

**需要使用者自己的 AI 服务密钥。** 源码不包含作者的密钥、聊天记录或已下载模型。第一次使用仍要安装依赖、填写配置并下载语音识别模型；不是无需配置的托管语音服务。

## 1. 先了解各部分做什么

| 部分 | 作用 | 是否必需 |
| --- | --- | --- |
| Momo 桌面应用 | 显示宠物、采集麦克风、自动断句、播放回复 | 必需 |
| `voice-server/` | 将一句音频识别成文字，调用 AI，合成回复语音 | 语音聊天必需 |
| SenseVoice int8 模型 | 在本机识别语音，默认 CPU 运行 | 第一次启动自动下载 |
| AI 服务 | 生成回答，默认配置为 DeepSeek | 需自备密钥、可用额度和网络 |
| Edge TTS | 将回答合成为中文声音 | 需要网络；无需另填 TTS 密钥 |
| EasyInput 键盘 | 八键旋钮控制及可选板载麦克风 | 可选；先用电脑麦克风也能聊天 |

默认流程是：麦克风 → Momo 本地断句 → 本机语音识别 → AI 回答 → 在线语音合成 → 电脑扬声器。不是完全离线。语音识别在本机完成；识别文字和对话上下文发给配置的 AI 服务，待朗读文本发给 Edge TTS。

## 2. 安装运行环境

### macOS（主要验证平台：Apple Silicon）

需要 Node.js 22 或更新版本、uv、FFmpeg。Python 由 uv 根据仓库的 `.python-version` 安装／选择，默认 3.10；无需使用系统自带 Python，不支持 Python 3.13/3.14。

如果已经有 Homebrew：

```sh
brew install node uv ffmpeg
```

没有 Homebrew 时，可分别使用 [Node.js 官方安装包](https://nodejs.org/en/download)、[uv 官方安装说明](https://docs.astral.sh/uv/getting-started/installation/)和 [FFmpeg 官方下载入口](https://ffmpeg.org/download.html)。安装后重新打开终端，确认以下命令都能运行：

```sh
node --version
npm --version
uv --version
ffmpeg -version
ffprobe -version
```

FFmpeg 和 ffprobe 都必须能从终端找到。它们用于把语音合成音频转换成前端可播放的 WAV；只安装 Python 包不能代替 FFmpeg。

### Windows / Linux

源码包含跨平台启动命令，但本次完整回归是在 Apple Silicon Mac 上完成，Windows、Linux 和 Intel Mac 尚未完整实测。

Windows 安装 Node.js 22+、uv 和 FFmpeg，并将 FFmpeg 的 `bin` 目录加入 PATH，重新打开 PowerShell。uv 可通过 `winget install --id=astral-sh.uv -e` 安装。Linux 同样需要这些工具，以及平台适用的音频输出环境。后面的 `npm` 命令相同，不需要复制 macOS 的环境变量语法。

首次安装需联网下载 Python／依赖，首次模型下载约 230 MB；建议预留至少 2 GB 磁盘空间。网络慢时先等待终端下载进度，避免反复重启安装。

## 3. 下载项目并安装依赖

Git 方式：

```sh
git clone https://github.com/Wangfugui1799/MomoPetEasyInput.git
cd MomoPetEasyInput
```

也可在 GitHub 点击 **Code → Download ZIP**，解压后在项目根目录打开终端。根目录应能看到 `package.json`、`app/` 和 `voice-server/`。

安装桌面端和服务端：

```sh
npm ci
npm run voice:install
npm run voice:setup
```

- `npm ci` 按锁文件安装 Electron、前端语音检测等依赖。
- `voice:install` 执行 `uv sync --locked --project voice-server`，创建独立的 `voice-server/.venv`；不会使用系统 Python 安装目录。
- `voice:setup` 创建 `voice-server/.env` 和 `voice-server/conf.yaml`。重复运行会保留已有文件，不覆盖你的密钥或角色配置。

## 4. 填写 AI 服务配置

用文本编辑器打开 `voice-server/.env`，把示例密钥替换成自己的密钥：

```dotenv
MOMO_LLM_API_KEY=这里填写你自己的密钥
MOMO_LLM_BASE_URL=https://api.deepseek.com
MOMO_LLM_MODEL=deepseek-chat
```

不要把“这里填写你自己的密钥”原样保留。密钥不要发到 GitHub Issue、截图或聊天里；`.env` 已被 Git 忽略。

| 配置项 | 填什么 |
| --- | --- |
| `MOMO_LLM_API_KEY` | 自己 AI 服务账号生成的有效 API 密钥 |
| `MOMO_LLM_BASE_URL` | 服务商的 OpenAI 兼容基础地址；通常以 `/v1` 结尾，DeepSeek 示例使用上面的地址 |
| `MOMO_LLM_MODEL` | 此服务实际支持、且账号有权限使用的模型名称 |

换用其他兼容服务时三项一起核对。这里填写的是**基础地址**，不要填写完整的 `/chat/completions` 地址。不同服务的地址、模型权限和余额需要用户自行确认。

Momo 设置窗口中的“接入你自己的 AI”只控制原来的文字聊天，不会代替这个服务端 `.env`。语音聊天使用 `voice-server/.env`。

检查配置：

```sh
npm run voice:check
```

成功时显示“配置、依赖、FFmpeg 检查通过”。这只证明配置格式与本机依赖可用，**不会向 AI 服务发请求，也不证明密钥有效或余额充足**。显示“模型：首次启动将下载”是正常状态。

## 5. 第一次启动

配置完成后，在根目录运行：

```sh
npm run start:voice
```

该命令先启动服务端，等待就绪后打开 Momo。首次启动会从 sherpa-onnx 官方 GitHub Release 下载 SenseVoice int8 模型，并校验模型与词表；后续启动复用本机模型。

看到 `MOMO_VOICE_READY` 后，表示语音识别、AI 客户端和语音合成引擎已初始化。这个阶段仍未完成真实 AI 请求；打开麦克风说一句话才会测试完整链路。

如果下载超过十分钟，统一启动命令会超时退出；按下一节单独启动服务端以观察具体错误。下载过程中保持终端打开。

### 分开启动，便于排查

终端 A，根目录：

```sh
npm run voice:server
```

等待 `MOMO_VOICE_READY`。浏览器打开 [服务端健康检查](http://127.0.0.1:12393/health)，应看到包含 `"service":"momo-voice"`、`"status":"ready"` 的 JSON。

终端 B，仍在根目录：

```sh
npm start
```

也可只在支持麦克风和 Web Serial 的浏览器预览：

```sh
npm run dev
```

浏览器打开 `http://127.0.0.1:4783`。桌面应用使用端口 4784；浏览器和桌面端存档、默认麦克风设置彼此独立。

`12393` 是本机服务端端口，`ws://127.0.0.1:12393/client-ws` 是 Momo 实际连接地址。`/health` 是检查页面，没有 Live2D 聊天网页。服务端运行在**与 Momo 同一台电脑**；当前不支持只改配置就部署到远程 VPS、手机或公网。

### 关闭和再次启动

- 用 `start:voice` 启动时，退出 Momo 后会停止这条命令启动的服务端；如果复用了原本已运行的 Momo 语音服务，不会替你关闭它。
- 分开启动时，在服务端终端按 `Ctrl+C` 停止服务。
- 下次只需 `npm run start:voice`，不用重复 `voice:setup` 或重新填密钥。
- 修改 `.env` 或 `conf.yaml` 后，需要重启服务端才会生效。

## 6. 用电脑麦克风聊天

1. 打开 Momo 的设置，在“语音输入 → 默认麦克风”选择“电脑 · 系统默认麦克风”。
2. 需要指定耳机或 USB 麦克风时，点击“刷新电脑麦克风”，允许系统权限后选择对应设备。默认输入会自动保存。
3. 按 S5 或界面的“聊天”键，直接开始准备录音。
4. 首次使用允许 Momo / Electron 访问麦克风，出现“正在录音”后说话；停顿不会自动发送。
5. 说完再按 S5，结束录音并发送，等待桌宠回复。
6. 回复结束后等待你再次按 S5 才录下一条。聊天活动中按下旋钮只显示对话框。

没连接键盘也可以操作界面。非输入框和弹窗内的数字 5 同样控制录音/发送，聊天活动中 Enter 显示对话框。直接点击“打开聊天对话框”可写文字，不开始录音。聊天框麦克风按钮保留旧的停顿自动发送模式，需要先关闭该模式才能使用 S5 留言。

当前为轮流说话：回复期间暂停收音，不支持同时说话或抢话。回复始终从电脑当前输出设备播放；检查系统输出和音量。

## 7. 用 EasyInput 板载麦克风聊天

先用电脑麦克风确认服务端能回复，再接入键盘，方便区分硬件问题与服务问题。

1. EasyInput 使用本项目 **0.5.0 或更新固件**。旧固件只有按键／音效／电量功能，没有麦克风音频上传。
2. 通过键盘的**原生 USB Serial/JTAG** 连接电脑。在 Momo 点击“连接 EasyInput”，选择对应端口。macOS 通常为 `/dev/cu.usbmodem…`，以实际枚举为准。
3. 在设置选择“EasyInput · 板载麦克风（USB）”。
4. 按 S5，看到“正在录音”后对键盘说话。
5. 说完再按 S5 发送；回答从电脑播放。短按旋钮显示对话框，回复后按 S5 才开始下一条。

BLE 蓝牙连接只传控制和电量，不传麦克风音频；`USB Serial` 桥接串口 `/dev/cu.usbserial…` 也不提供本版麦克风能力。没有能力握手时 Momo 会提示升级固件或改用原生 USB，不会偷偷切回电脑录音。

用户已确认原 USB 连续真人三轮通过；当前固件为 0.6.0，另支持配网后的 Wi-Fi 麦克风。新 S5 按键留言交互的实板验收仍待进行，完整记录见 [键盘语音输入说明](KEYBOARD-VOICE-INPUT.md) 和 [S5 按键留言](S5-VOICE-MESSAGE.md)。

固件构建／烧录方法见主 README。当前 EasyInput 的下载操作是“保持开机，短按一次 BOOT 并松开”；烧录后关机再开机，**不要再按 BOOT**。不要使用整片擦除来解决麦克风设置问题。

## 8. S5 旋钮和后台聊天

| 操作 | 效果 |
| --- | --- |
| S5 第一次 | 开始录音，不弹出聊天窗口 |
| S5 第二次 | 停止并发送留言，回复后待命 |
| 聊天活动中短按旋钮 | 显示聊天对话框，不开始或提交录音 |
| 界面“关闭麦克风” | 停止会话并丢弃未发送的录音，睡眠状态下也能执行 |

关闭聊天窗口、按 Escape 或旋钮长按，只隐藏对话窗口，**语音仍继续**。主界面保留语音状态和“查看对话／关闭麦克风”。使用其他活动键不结束语音会话。

真正停止语音请点“关闭麦克风”或退出应用。切换默认音源会停止当前会话，再次打开麦克风时使用新音源。设备断开／音频丢帧会提示错误，不自动换到另一支麦克风。

## 9. 改声音、角色和模型

编辑 `voice-server/conf.yaml` 并重启服务端：

- `character_config.persona_prompt`：Momo 的说话风格。默认是简短自然的中文陪伴回复。
- `character_config.tts_config.edge_tts.voice`：默认 `zh-CN-XiaoxiaoNeural`。可用 `uv run --locked --project voice-server edge-tts --list-voices` 查看服务当前声音列表。
- AI 地址、模型名称和密钥优先修改 `.env`。

本配套依赖锁文件只验证 SenseVoice CPU + OpenAI 兼容聊天 + Edge TTS 这一条路线。不包含 CUDA、PyTorch、Live2D 模型或上游所有可选服务的运行依赖。高级开发可参考 `voice-server/README.upstream.CN.md`，不要直接把上游全部参数改一遍，也不要运行其升级脚本覆盖 Momo 适配。

## 10. 常见问题

| 现象 | 检查／解决 |
| --- | --- |
| `uv: command not found` | 按第 2 节安装 uv，重新打开终端并确认 `uv --version` |
| 找不到 FFmpeg / ffprobe | 安装完整 FFmpeg，将其 `bin` 目录加入 PATH，重新打开终端 |
| 提示填写 `MOMO_LLM_API_KEY` | 运行 `voice:setup`，编辑 `voice-server/.env`；不是只在 Momo 界面填写文字 AI 密钥 |
| `ValidationError` | 检查 `conf.yaml` 缩进、字段和值；与 `conf.example.yaml` 比较。程序不会打印含密钥的完整配置 |
| 模型下载超时、TLS、403 | 检查 GitHub Release 网络访问；必要时配置合法网络代理后重试，不关闭 TLS 校验。可单独运行 `uv run --locked --project voice-server voice-server/download_model.py` |
| 模型校验失败 | 不要改程序中的校验值。重新运行下载命令，检查是否下载成了错误网页或代理缓存 |
| `address already in use` / 12393 被占用 | 已启动本配套服务就复用它；运行旧 Open-LLM-VTuber 时先手动停止旧进程，再启动配套服务，不要随意结束未知进程 |
| Momo 显示无法连接语音服务 | 先检查 `/health`，确认两者在同一台电脑、端口 12393；`npm start` 本身不会启动后端，完整启动用 `npm run start:voice` |
| 有转写文字，没有 AI 回答 | 检查模型名称、密钥权限、余额和 AI 服务网络；`voice:check` 不验证远端密钥 |
| 有回答文字，没有声音 | 检查 Edge TTS 网络、FFmpeg、系统声音输出和音量。查看服务端终端是否报告 TTS 失败 |
| 麦克风未获授权 | macOS“系统设置 → 隐私与安全性 → 麦克风”允许 Momo；开发模式可能显示 Electron；浏览器另需站点权限 |
| 所选麦克风不可用 | 接回设备或到设置重新选择。不会自动回退到系统默认设备 |
| 键盘音源不支持／音频中断 | 核对 0.5.0 固件、原生 USB 连接及线缆；先用电脑麦克风排除服务端问题 |
| 关闭窗口后还在聊天 | 这是当前设计；点击主界面的“关闭麦克风”才结束语音 |

## 11. 本地文件、隐私与更新

`voice-server/.env` 是本机密钥；`conf.yaml` 是本机配置；`models/` 是模型；`cache/` 是音频临时文件；`chat_history/` 是对话历史。这些路径均被 Git 忽略，不随源码上传。

运行期间终端可能显示转写／回答内容，分享日志前先检查个人信息。停止服务后可自行删除 `cache/` 和 `chat_history/` 中不需要的记录。Momo 窗口关闭不代表服务端历史被删除。不要把整个本地目录重新打 ZIP 分享，应分享 GitHub 源码或已审计的构建产物。

更新前保存自己的 `.env` 和 `conf.yaml`，然后：

```sh
git pull --ff-only
npm ci
npm run voice:install
npm run voice:check
npm run start:voice
```

ZIP 用户下载新版源码后，只迁移自己的 `.env`、`conf.yaml` 与需要保留的历史／模型，不复制旧 `.venv`。

## 12. 来源与验证边界

配套语音核心来自 [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber)，固定上游提交 `992309c0aa19845960228f880013d4685fde93b5`（1.2.1），保留 MIT 许可证与上游来源清单。Momo 增加了本地服务启动入口、配置模板、依赖锁定、模型下载校验和使用说明。没有把上游代码称为 Momo 原创，也未打包受单独许可约束的 Live2D 模型。

模型来自 [sherpa-onnx 官方 SenseVoice 说明](https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html)，首次下载时保留模型自带许可证。源码许可证与模型许可证分别适用。

具体测试结果见 [服务端交付验证记录](VOICE-SERVER-VALIDATION.md)。健康接口成功、模拟语音成功、真人收音与完整键盘验收分别记录，不互相替代。
