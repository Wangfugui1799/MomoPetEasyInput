#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/voice-env.sh"

case "${1:-}" in
  --help|-h)
    echo '用法：bash scripts/install-voice.sh [--non-interactive]'
    echo '安装 macOS 语音依赖、保留现有配置、下载并校验模型。'
    echo '--non-interactive 不询问密钥；配置未完成时退出码为 2。'
    exit 0 ;;
  ''|--non-interactive) ;;
  *) echo '未知参数；使用 --help 查看用法。' >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { echo '参数过多。' >&2; exit 2; }
[[ "$(uname -s)" == Darwin ]] || { echo '此安装脚本仅支持 macOS；其他系统请参考 docs/VOICE-SETUP.md。' >&2; exit 1; }
trap 'echo "安装未完成。解决上方错误后可重新运行；已有配置会保留。" >&2' ERR

echo 'Momo 语音服务安装：无需 Node.js；首次下载需要联网和至少 2 GB 空间。'
missing=()
command -v uv >/dev/null 2>&1 || missing+=(uv)
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  missing+=(ffmpeg)
fi
if [[ ${#missing[@]} -gt 0 ]]; then
  if ! command -v brew >/dev/null 2>&1; then
    echo '缺少 uv 或 FFmpeg，且未找到 Homebrew。'
    echo '请先从 https://brew.sh 安装 Homebrew，再重新运行本脚本。'
    echo '也可按 docs/VOICE-SETUP.md 手动安装 uv、ffmpeg 和 ffprobe。'
    exit 1
  fi
  echo "使用 Homebrew 安装：${missing[*]}"
  brew install "${missing[@]}"
fi
for tool in uv ffmpeg ffprobe; do
  command -v "$tool" >/dev/null || { echo "仍未找到 $tool，请检查 PATH。" >&2; exit 1; }
done
echo '安装项目指定的 Python 和锁定依赖……'
uv python install "$(cat voice-server/.python-version)"
uv sync --locked --project "$MOMO_ROOT/voice-server"
echo '创建配置（已有文件不会覆盖）……'
"$MOMO_ROOT/voice-server/.venv/bin/python" scripts/configure-voice.py "${1:-}"
echo '下载或校验本地语音识别模型……'
uv run --locked --project "$MOMO_ROOT/voice-server" "$MOMO_ROOT/voice-server/download_model.py"
uv run --locked --project "$MOMO_ROOT/voice-server" "$MOMO_ROOT/voice-server/run_momo.py" --check
echo '安装完成！双击「启动语音服务.command」，等待 MOMO_VOICE_READY 后打开 Momo.app。'
echo '本机检查不验证 AI 密钥的有效性、额度或在线语音合成。'
