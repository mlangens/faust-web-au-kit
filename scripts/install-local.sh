#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_STEM="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.artifactStem);' "$ROOT_DIR/project.json")"

cd "$ROOT_DIR"
./scripts/build-native.sh >/dev/null

mkdir -p "$HOME/Library/Audio/Plug-Ins/Components"
mkdir -p "$HOME/Library/Audio/Plug-Ins/VST3"
mkdir -p "$HOME/Library/Audio/Plug-Ins/CLAP"
mkdir -p "$HOME/Applications"

rm -rf "$HOME/Library/Audio/Plug-Ins/Components/${ARTIFACT_STEM}.component"
rm -rf "$HOME/Library/Audio/Plug-Ins/VST3/${ARTIFACT_STEM}.vst3"
rm -rf "$HOME/Library/Audio/Plug-Ins/CLAP/${ARTIFACT_STEM}.clap"
rm -rf "$HOME/Applications/${ARTIFACT_STEM}.app"

cp -R "$ROOT_DIR/build/${ARTIFACT_STEM}.component" "$HOME/Library/Audio/Plug-Ins/Components/${ARTIFACT_STEM}.component"
cp -R "$ROOT_DIR/build/${ARTIFACT_STEM}.vst3" "$HOME/Library/Audio/Plug-Ins/VST3/${ARTIFACT_STEM}.vst3"
cp -R "$ROOT_DIR/build/${ARTIFACT_STEM}.clap" "$HOME/Library/Audio/Plug-Ins/CLAP/${ARTIFACT_STEM}.clap"
cp -R "$ROOT_DIR/build/${ARTIFACT_STEM}.app" "$HOME/Applications/${ARTIFACT_STEM}.app"

echo "Installed ${ARTIFACT_STEM} bundles into ~/Library/Audio/Plug-Ins and ~/Applications."
