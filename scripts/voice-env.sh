#!/bin/bash
# Finder launches with a small PATH. Keep the caller's PATH and add common tools.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.cargo/bin"
MOMO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$MOMO_ROOT" || exit 1
