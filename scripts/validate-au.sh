#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_STEM="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.artifactStem);' "$ROOT_DIR/project.json")"
AU_TYPE="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.au.type);' "$ROOT_DIR/project.json")"
AU_SUBTYPE="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.au.subtype);' "$ROOT_DIR/project.json")"
AU_MANUFACTURER="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.au.manufacturer);' "$ROOT_DIR/project.json")"
COMPONENT_SRC="$ROOT_DIR/build/${ARTIFACT_STEM}.component"
COMPONENT_DST="$HOME/Library/Audio/Plug-Ins/Components/${ARTIFACT_STEM}.component"

cd "$ROOT_DIR"
node ./tools/export-targets.mjs >/dev/null
cmake -S . -B build -G Ninja \
  -DFWAK_BUILD_AUV2=ON \
  -DFWAK_BUILD_CLAP=OFF \
  -DFWAK_BUILD_VST3=OFF \
  -DFWAK_BUILD_STANDALONE=OFF >/dev/null
cmake --build build --target "${ARTIFACT_STEM}AU" >/dev/null
mkdir -p "$HOME/Library/Audio/Plug-Ins/Components"
rm -rf "$COMPONENT_DST"
cp -R "$COMPONENT_SRC" "$COMPONENT_DST"
auval -v "$AU_TYPE" "$AU_SUBTYPE" "$AU_MANUFACTURER"
