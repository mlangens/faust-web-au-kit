#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"
node ./tools/export-targets.mjs
cmake -S . -B build -G Ninja
cmake --build build

