#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

source "$ROOT_DIR/scripts/lib/bundles.zsh"
source "$ROOT_DIR/scripts/lib/runtime.zsh"

SKIP_BUILD=0
FORWARD_ARGS=()

while (( $# > 0 )); do
  case "$1" in
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --scope)
      [[ $# -ge 2 ]] || { echo "Missing value for --scope" >&2; exit 1; }
      shift 2
      ;;
    *)
      FORWARD_ARGS+=("$1")
      if (( $# > 1 )) && [[ "$2" != --* ]]; then
        FORWARD_ARGS+=("$2")
        shift 2
      else
        shift
      fi
      ;;
  esac
done

load_app_runtime "$ROOT_DIR" "${FORWARD_ARGS[@]}"

DIST_DIR="$FWAK_DIST_DIR"
PKG_PATH="$DIST_DIR/${FWAK_ARTIFACT_STEM}-${FWAK_PROJECT_VERSION}.pkg"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/${FWAK_ARTIFACT_STEM}.pkgroot.XXXXXX")"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

if (( ! SKIP_BUILD )); then
  cd "$ROOT_DIR"
  ./scripts/build-native.sh "${FORWARD_ARGS[@]}" >/dev/null
fi

ensure_system_stage_dirs "$STAGE_DIR"
mkdir -p "$DIST_DIR"

stage_bundle "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.component" "$STAGE_DIR/Library/Audio/Plug-Ins/Components/${FWAK_ARTIFACT_STEM}.component"
stage_bundle "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.vst3" "$STAGE_DIR/Library/Audio/Plug-Ins/VST3/${FWAK_ARTIFACT_STEM}.vst3"
stage_bundle "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.clap" "$STAGE_DIR/Library/Audio/Plug-Ins/CLAP/${FWAK_ARTIFACT_STEM}.clap"
stage_bundle "$FWAK_BUILD_DIR/${FWAK_ARTIFACT_STEM}.app" "$STAGE_DIR/Applications/${FWAK_ARTIFACT_STEM}.app"

rm -f "$PKG_PATH"
pkgbuild \
  --root "$STAGE_DIR" \
  --identifier "$FWAK_PACKAGE_ID" \
  --version "$FWAK_PROJECT_VERSION" \
  "$PKG_PATH"

echo "Built installer at $PKG_PATH"
