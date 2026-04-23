#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

source "$ROOT_DIR/scripts/lib/bundles.zsh"
source "$ROOT_DIR/scripts/lib/packages.zsh"
source "$ROOT_DIR/scripts/lib/runtime.zsh"

FORWARD_ARGS=()

while (( $# > 0 )); do
  case "$1" in
    --skip-build)
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
PKG_PATH="$DIST_DIR/${FWAK_ARTIFACT_STEM}-${FWAK_PROJECT_VERSION}-uninstaller.pkg"
UNINSTALLER_PACKAGE_ID="${FWAK_PACKAGE_ID%.installer}.uninstaller"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/${FWAK_ARTIFACT_STEM}.unpkg.XXXXXX")"
SCRIPTS_DIR="$WORK_DIR/scripts"
MANIFEST_PATH="$WORK_DIR/paths.txt"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$DIST_DIR"
: > "$MANIFEST_PATH"
append_bundle_relative_paths "$FWAK_ARTIFACT_STEM" "$MANIFEST_PATH"
write_uninstaller_scripts "$SCRIPTS_DIR" "$MANIFEST_PATH"
build_nopayload_package "$PKG_PATH" "$UNINSTALLER_PACKAGE_ID" "$FWAK_PROJECT_VERSION" "$SCRIPTS_DIR"

echo "Built uninstaller at $PKG_PATH"
