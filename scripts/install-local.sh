#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ORIGINAL_ARGS=("$@")
SCOPE="user"

while (( $# > 0 )); do
  case "$1" in
    --scope)
      [[ $# -ge 2 ]] || { echo "Missing value for --scope" >&2; exit 1; }
      SCOPE="$2"
      shift 2
      ;;
    *)
      if (( $# > 1 )) && [[ "$2" != --* ]]; then
        shift 2
      else
        shift
      fi
      ;;
  esac
done

case "$SCOPE" in
  user|system)
    ;;
  *)
    echo "Unsupported scope \"$SCOPE\". Use user or system." >&2
    exit 1
    ;;
esac

source "$ROOT_DIR/scripts/lib/packages.zsh"
source "$ROOT_DIR/scripts/lib/runtime.zsh"

load_app_runtime "$ROOT_DIR" "${ORIGINAL_ARGS[@]}"
PKG_PATH="$FWAK_DIST_DIR/${FWAK_ARTIFACT_STEM}-${FWAK_PROJECT_VERSION}.pkg"
INSTALL_TARGET="$(installer_target_for_scope "$SCOPE")"

cd "$ROOT_DIR"
./scripts/package-installer.sh "${ORIGINAL_ARGS[@]}"
run_package_installer "$PKG_PATH" "$INSTALL_TARGET" "Installing ${FWAK_APP_NAME}"

echo "Installed ${FWAK_APP_NAME} (${FWAK_PROJECT_VERSION}) via macOS package into ${SCOPE} scope."
