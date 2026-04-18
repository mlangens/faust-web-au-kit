#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPONENT_SRC="$ROOT_DIR/build/LimiterLab.component"
COMPONENT_DST="$HOME/Library/Audio/Plug-Ins/Components/LimiterLab.component"

cd "$ROOT_DIR"
node ./tools/export-targets.mjs >/dev/null
cmake -S . -B build -G Ninja >/dev/null
cmake --build build >/dev/null
mkdir -p "$HOME/Library/Audio/Plug-Ins/Components"
rm -rf "$COMPONENT_DST"
cp -R "$COMPONENT_SRC" "$COMPONENT_DST"
auval -v aufx Lmlt Mlng
