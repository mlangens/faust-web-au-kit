#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPONENT_DST=""
STAGING_DST="${COMPONENT_DST}.next.$$"

source "$ROOT_DIR/scripts/lib/lock.zsh"
source "$ROOT_DIR/scripts/lib/runtime.zsh"

load_app_runtime "$ROOT_DIR" "$@"
COMPONENT_SRC="$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.component"
COMPONENT_DST="$HOME/Library/Audio/Plug-Ins/Components/${FWAK_ARTIFACT_STEM}.component"
STAGING_DST="${COMPONENT_DST}.next.$$"
BUILD_LOCK_DIR="${TMPDIR:-/tmp}/${FWAK_APP_KEY}.build.lock"
INSTALL_LOCK_DIR="${TMPDIR:-/tmp}/${FWAK_APP_KEY}.user-install.lock"

cd "$ROOT_DIR"
acquire_lock "$BUILD_LOCK_DIR"
trap 'rm -rf "$STAGING_DST" 2>/dev/null || true; release_lock "$INSTALL_LOCK_DIR"; release_lock "$BUILD_LOCK_DIR"' EXIT

node ./tools/export-targets.mjs --export-profile native "$@" >/dev/null
cmake -S . -B "$FWAK_BUILD_DIR" -G Ninja \
  -DFWAK_BUILD_AUV2=ON \
  -DFWAK_BUILD_CLAP=OFF \
  -DFWAK_BUILD_VST3=OFF \
  -DFWAK_BUILD_STANDALONE=OFF \
  "-DFWAK_GENERATED_DIR=$FWAK_GENERATED_DIR" >/dev/null
cmake --build "$FWAK_BUILD_DIR" --target "${FWAK_ARTIFACT_STEM}AU" >/dev/null
mkdir -p "$HOME/Library/Audio/Plug-Ins/Components"

acquire_lock "$INSTALL_LOCK_DIR"

rm -rf "$STAGING_DST" 2>/dev/null || true
cp -R "$COMPONENT_SRC" "$STAGING_DST"
rm -rf "$COMPONENT_DST" 2>/dev/null || true
mv "$STAGING_DST" "$COMPONENT_DST"
auval -v "$FWAK_AU_TYPE" "$FWAK_AU_SUBTYPE" "$FWAK_AU_MANUFACTURER"
