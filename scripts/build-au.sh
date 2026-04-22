#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

source "$ROOT_DIR/scripts/lib/lock.zsh"
source "$ROOT_DIR/scripts/lib/runtime.zsh"

load_app_runtime "$ROOT_DIR" "$@"
BUILD_LOCK_DIR="${TMPDIR:-/tmp}/${FWAK_APP_KEY}.build.lock"

cd "$ROOT_DIR"
acquire_lock "$BUILD_LOCK_DIR"
trap 'release_lock "$BUILD_LOCK_DIR"' EXIT

node ./tools/export-targets.mjs --export-profile native "$@"
cmake -S . -B "$FWAK_BUILD_DIR" -G Ninja \
  -DFWAK_BUILD_AUV2=ON \
  -DFWAK_BUILD_CLAP=OFF \
  -DFWAK_BUILD_VST3=OFF \
  -DFWAK_BUILD_STANDALONE=OFF \
  "-DFWAK_GENERATED_DIR=$FWAK_GENERATED_DIR"
cmake --build "$FWAK_BUILD_DIR" --target "${FWAK_ARTIFACT_STEM}AU"
