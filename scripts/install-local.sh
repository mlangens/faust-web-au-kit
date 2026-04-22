#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

source "$ROOT_DIR/scripts/lib/bundles.zsh"
source "$ROOT_DIR/scripts/lib/lock.zsh"
source "$ROOT_DIR/scripts/lib/runtime.zsh"

load_app_runtime "$ROOT_DIR" "$@"
INSTALL_LOCK_DIR="${TMPDIR:-/tmp}/${FWAK_APP_KEY}.user-install.lock"

cd "$ROOT_DIR"
./scripts/build-native.sh "$@" >/dev/null

ensure_user_install_dirs

acquire_lock "$INSTALL_LOCK_DIR"
trap 'release_lock "$INSTALL_LOCK_DIR"' EXIT

install_bundle "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.component" "$HOME/Library/Audio/Plug-Ins/Components/${FWAK_ARTIFACT_STEM}.component"
install_bundle "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.vst3" "$HOME/Library/Audio/Plug-Ins/VST3/${FWAK_ARTIFACT_STEM}.vst3"
install_bundle "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.clap" "$HOME/Library/Audio/Plug-Ins/CLAP/${FWAK_ARTIFACT_STEM}.clap"
install_bundle "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.app" "$HOME/Applications/${FWAK_ARTIFACT_STEM}.app"

echo "Installed ${FWAK_APP_NAME} bundles into ~/Library/Audio/Plug-Ins and ~/Applications."
