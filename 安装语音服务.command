#!/bin/bash
cd "$(dirname "$0")" || exit 1
bash scripts/install-voice.sh
result=$?
echo
read -r -p '按回车关闭此窗口……' _reply
exit "$result"
