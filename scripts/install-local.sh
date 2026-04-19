#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

source "$ROOT_DIR/scripts/lib/lock.zsh"
source "$ROOT_DIR/scripts/lib/runtime.zsh"

load_app_runtime "$ROOT_DIR" "$@"
INSTALL_LOCK_DIR="${TMPDIR:-/tmp}/${FWAK_APP_KEY}.user-install.lock"

cd "$ROOT_DIR"
./scripts/build-native.sh "$@" >/dev/null

mkdir -p "$HOME/Library/Audio/Plug-Ins/Components"
mkdir -p "$HOME/Library/Audio/Plug-Ins/VST3"
mkdir -p "$HOME/Library/Audio/Plug-Ins/CLAP"
mkdir -p "$HOME/Applications"

install_bundle() {
  local source_path="$1"
  local destination_path="$2"
  local staging_path="${destination_path}.next.$$"

  rm -rf "$staging_path" 2>/dev/null || true
  if ! cp -R "$source_path" "$staging_path" 2>/dev/null; then
    rm -rf "$staging_path" 2>/dev/null || true
    echo "Warning: could not install $(basename "$destination_path") to $destination_path" >&2
    return
  fi

  rm -rf "$destination_path" 2>/dev/null || true
  if ! mv "$staging_path" "$destination_path" 2>/dev/null; then
    rm -rf "$staging_path" 2>/dev/null || true
    echo "Warning: could not activate $(basename "$destination_path") at $destination_path" >&2
  fi
}

acquire_lock "$INSTALL_LOCK_DIR"
trap 'release_lock "$INSTALL_LOCK_DIR"' EXIT

install_bundle "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.component" "$HOME/Library/Audio/Plug-Ins/Components/${FWAK_ARTIFACT_STEM}.component"
install_bundle "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.vst3" "$HOME/Library/Audio/Plug-Ins/VST3/${FWAK_ARTIFACT_STEM}.vst3"
install_bundle "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.clap" "$HOME/Library/Audio/Plug-Ins/CLAP/${FWAK_ARTIFACT_STEM}.clap"
install_bundle "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.app" "$HOME/Applications/${FWAK_ARTIFACT_STEM}.app"

echo "Installed ${FWAK_APP_NAME} bundles into ~/Library/Audio/Plug-Ins and ~/Applications."
