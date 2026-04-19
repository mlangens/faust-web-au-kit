#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

source "$ROOT_DIR/scripts/lib/runtime.zsh"

load_app_runtime "$ROOT_DIR" "$@"

DIST_DIR="$FWAK_DIST_DIR"
PKG_PATH="$DIST_DIR/${FWAK_ARTIFACT_STEM}-${FWAK_PROJECT_VERSION}.pkg"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/${FWAK_ARTIFACT_STEM}.pkgroot.XXXXXX")"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

cd "$ROOT_DIR"
./scripts/build-native.sh "$@" >/dev/null

mkdir -p "$STAGE_DIR/Library/Audio/Plug-Ins/Components"
mkdir -p "$STAGE_DIR/Library/Audio/Plug-Ins/VST3"
mkdir -p "$STAGE_DIR/Library/Audio/Plug-Ins/CLAP"
mkdir -p "$STAGE_DIR/Applications"
mkdir -p "$DIST_DIR"

cp -R "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.component" "$STAGE_DIR/Library/Audio/Plug-Ins/Components/${FWAK_ARTIFACT_STEM}.component"
cp -R "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.vst3" "$STAGE_DIR/Library/Audio/Plug-Ins/VST3/${FWAK_ARTIFACT_STEM}.vst3"
cp -R "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.clap" "$STAGE_DIR/Library/Audio/Plug-Ins/CLAP/${FWAK_ARTIFACT_STEM}.clap"
cp -R "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.app" "$STAGE_DIR/Applications/${FWAK_ARTIFACT_STEM}.app"

rm -f "$PKG_PATH"
pkgbuild \
  --root "$STAGE_DIR" \
  --identifier "$FWAK_PACKAGE_ID" \
  --version "$FWAK_PROJECT_VERSION" \
  "$PKG_PATH"

echo "Built installer at $PKG_PATH"
