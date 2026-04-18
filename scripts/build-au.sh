#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"
node ./tools/export-targets.mjs
cmake -S . -B build -G Ninja \
  -DFWAK_BUILD_AUV2=ON \
  -DFWAK_BUILD_CLAP=OFF \
  -DFWAK_BUILD_VST3=OFF \
  -DFWAK_BUILD_STANDALONE=OFF
cmake --build build --target "$(node -e 'const fs=require(\"fs\"); const p=JSON.parse(fs.readFileSync(\"project.json\",\"utf8\")); process.stdout.write(`${p.artifactStem}AU`);')"
