#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
sdk_dir="${IDF_PATH:-}"
if [ -z "$sdk_dir" ]; then
  sdk_dir="$(node -e 'const fs=require("node:fs");console.log(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).idf_path)' "$project_dir/firmware/build-wireless/project_description.json")"
fi
if [ ! -f "$sdk_dir/components/mbedtls/mbedtls/CMakeLists.txt" ]; then
  echo 'Set IDF_PATH to the ESP-IDF installation used to build this firmware.' >&2
  exit 1
fi
cd "$project_dir"
cmake -S "$sdk_dir/components/mbedtls/mbedtls" -B .cache/mbedtls-host -DENABLE_TESTING=OFF -DENABLE_PROGRAMS=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build .cache/mbedtls-host -j 4
cc -std=c11 -Wall -Wextra -Werror -I"$sdk_dir/components/mbedtls/mbedtls/include" -I"$sdk_dir/components/json/cJSON" \
  firmware/main/wireless_crypto.c firmware/tests/wireless_interop.c "$sdk_dir/components/json/cJSON/cJSON.c" \
  .cache/mbedtls-host/library/libmbedtls.a .cache/mbedtls-host/library/libmbedx509.a .cache/mbedtls-host/library/libmbedcrypto.a \
  -o .cache/wireless-interop
node scripts/test-wireless-interop.mjs
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/test-wireless-interop.mjs
