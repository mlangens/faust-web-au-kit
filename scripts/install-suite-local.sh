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

IFS=$'\t' read -r RESOLVED_SUITE_ID SUITE_NAME SUITE_VERSION < <(
  node "$ROOT_DIR/tools/list-suite-runtimes.mjs" "${ORIGINAL_ARGS[@]}" --format summary
)
PKG_PATH="$ROOT_DIR/dist/suites/${RESOLVED_SUITE_ID}/${RESOLVED_SUITE_ID}-${SUITE_VERSION}.pkg"
INSTALL_TARGET="$(installer_target_for_scope "$SCOPE")"

cd "$ROOT_DIR"
./scripts/package-suite-installer.sh "${ORIGINAL_ARGS[@]}"
run_package_installer "$PKG_PATH" "$INSTALL_TARGET" "Installing ${SUITE_NAME}"

echo "Installed ${SUITE_NAME} (${SUITE_VERSION}) via macOS package into ${SCOPE} scope."
