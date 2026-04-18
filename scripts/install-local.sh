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

install_bundle() {
  local source_path="$1"
  local destination_path="$2"

  rm -rf "$destination_path" 2>/dev/null || true
  if ! cp -R "$source_path" "$destination_path" 2>/dev/null; then
    echo "Warning: could not install $(basename "$destination_path") to $destination_path" >&2
  fi
}

install_bundle "$ROOT_DIR/build/${ARTIFACT_STEM}.component" "$HOME/Library/Audio/Plug-Ins/Components/${ARTIFACT_STEM}.component"
install_bundle "$ROOT_DIR/build/${ARTIFACT_STEM}.vst3" "$HOME/Library/Audio/Plug-Ins/VST3/${ARTIFACT_STEM}.vst3"
install_bundle "$ROOT_DIR/build/${ARTIFACT_STEM}.clap" "$HOME/Library/Audio/Plug-Ins/CLAP/${ARTIFACT_STEM}.clap"
install_bundle "$ROOT_DIR/build/${ARTIFACT_STEM}.app" "$HOME/Applications/${ARTIFACT_STEM}.app"

echo "Installed ${ARTIFACT_STEM} bundles into ~/Library/Audio/Plug-Ins and ~/Applications."
