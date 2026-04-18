#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_STEM="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.artifactStem);' "$ROOT_DIR/project.json")"
PROJECT_VERSION="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.version);' "$ROOT_DIR/project.json")"
PACKAGE_ID="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(`${p.bundleId}.installer`);' "$ROOT_DIR/project.json")"
STAGE_DIR="$ROOT_DIR/dist/pkgroot"
DIST_DIR="$ROOT_DIR/dist"
PKG_PATH="$DIST_DIR/${ARTIFACT_STEM}-${PROJECT_VERSION}.pkg"

cd "$ROOT_DIR"
./scripts/build-native.sh >/dev/null

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/Library/Audio/Plug-Ins/Components"
mkdir -p "$STAGE_DIR/Library/Audio/Plug-Ins/VST3"
mkdir -p "$STAGE_DIR/Library/Audio/Plug-Ins/CLAP"
mkdir -p "$STAGE_DIR/Applications"
mkdir -p "$DIST_DIR"

cp -R "$ROOT_DIR/build/${ARTIFACT_STEM}.component" "$STAGE_DIR/Library/Audio/Plug-Ins/Components/${ARTIFACT_STEM}.component"
cp -R "$ROOT_DIR/build/${ARTIFACT_STEM}.vst3" "$STAGE_DIR/Library/Audio/Plug-Ins/VST3/${ARTIFACT_STEM}.vst3"
cp -R "$ROOT_DIR/build/${ARTIFACT_STEM}.clap" "$STAGE_DIR/Library/Audio/Plug-Ins/CLAP/${ARTIFACT_STEM}.clap"
cp -R "$ROOT_DIR/build/${ARTIFACT_STEM}.app" "$STAGE_DIR/Applications/${ARTIFACT_STEM}.app"

rm -f "$PKG_PATH"
pkgbuild \
  --root "$STAGE_DIR" \
  --identifier "$PACKAGE_ID" \
  --version "$PROJECT_VERSION" \
  "$PKG_PATH"

echo "Built installer at $PKG_PATH"
