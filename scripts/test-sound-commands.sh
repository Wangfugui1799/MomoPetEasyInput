#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
# Reuse the project's SDK cJSON; do not substitute a different parser in host tests.
sdk_dir="${IDF_PATH:-}"
if [ -z "$sdk_dir" ]; then
  sdk_dir="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["idf_path"])' "$project_dir/firmware/build/project_description.json")"
fi
output="$(mktemp -d "${TMPDIR:-/tmp}/momo-command-test.XXXXXX")"
trap 'rm -rf "$output"' EXIT
cc -std=c11 -Wall -Wextra -Werror -I"$project_dir/firmware/tests/stubs" -I"$sdk_dir/components/json/cJSON" \
  "$project_dir/firmware/main/sound_commands.c" "$project_dir/firmware/tests/commands_test.c" \
  "$sdk_dir/components/json/cJSON/cJSON.c" -o "$output/test"
"$output/test"
