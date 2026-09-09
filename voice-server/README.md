# Momo 配套语音服务端

本目录包含可独立安装的语音服务端源码，来自 Open-LLM-VTuber 1.2.1，并提供 Momo 本地入口。

**完整安装、配置、使用和排错：[语音聊天使用教程](../docs/VOICE-SETUP.md)。**

在项目根目录执行：

```sh
npm ci
npm run voice:install
npm run voice:setup
# 编辑 voice-server/.env，填写自己的 AI 服务密钥
npm run voice:check
npm run start:voice
```

单独启动服务端：`npm run voice:server`。默认端口 `12393`，健康检查 `/health`，语音接口 `/client-ws`。

Python 默认 3.10，支持范围 3.10–3.12。需要 uv、FFmpeg/ffprobe 和网络；模型首次下载，API 密钥自备。Momo 不使用 Live2D 前端，所以没有前端子模块安装步骤。

`run_momo.py` 是本配套入口。`run_server.py`、`README.upstream*.md`、`pyproject.upstream.toml`、`uv.upstream.lock` 和 `requirements.txt` 保留上游参考；它们不是本配套的安装命令。请勿直接运行 `upgrade.py` 覆盖本适配。

上游地址、固定提交和导入文件的 Git blob ID 见 [UPSTREAM.json](UPSTREAM.json)。核心代码保留 [MIT License](LICENSE)。Live2D 示例模型没有包含在本目录；其上游许可说明保留为 [LICENSE-Live2D.md](LICENSE-Live2D.md)。
