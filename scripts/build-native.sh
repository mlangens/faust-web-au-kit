#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"
node ./tools/export-targets.mjs
cmake -S . -B build -G Ninja \
  -DFWAK_BUILD_AUV2=ON \
  -DFWAK_BUILD_CLAP=ON \
  -DFWAK_BUILD_VST3=ON \
  -DFWAK_BUILD_STANDALONE=ON
cmake --build build
