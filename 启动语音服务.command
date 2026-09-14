#!/bin/bash
source "$(dirname "$0")/scripts/voice-env.sh"
if ! command -v uv >/dev/null 2>&1 || [[ ! -f voice-server/.env || ! -d voice-server/.venv ]]; then
  echo '请先双击「安装语音服务.command」完成安装和配置。'
  result=1
else
  echo '等待 MOMO_VOICE_READY 后打开 Momo.app。保持本窗口打开；按 Ctrl+C 停止语音服务。'
  uv run --locked --project "$MOMO_ROOT/voice-server" "$MOMO_ROOT/voice-server/run_momo.py"
  result=$?
fi
read -r -p '按回车关闭此窗口……' _reply
exit "$result"
