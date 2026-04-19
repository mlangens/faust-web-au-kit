#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_STEM="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.artifactStem);' "$ROOT_DIR/project.json")"
BUILD_LOCK_DIR="${TMPDIR:-/tmp}/${ARTIFACT_STEM}.build.lock"

source "$ROOT_DIR/scripts/lib/lock.zsh"

cd "$ROOT_DIR"
acquire_lock "$BUILD_LOCK_DIR"
trap 'release_lock "$BUILD_LOCK_DIR"' EXIT

node ./tools/export-targets.mjs
cmake -S . -B build -G Ninja \
  -DFWAK_BUILD_AUV2=ON \
  -DFWAK_BUILD_CLAP=ON \
  -DFWAK_BUILD_VST3=ON \
  -DFWAK_BUILD_STANDALONE=ON
cmake --build build
