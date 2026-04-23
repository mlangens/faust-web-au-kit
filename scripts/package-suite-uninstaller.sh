#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

source "$ROOT_DIR/scripts/lib/bundles.zsh"
source "$ROOT_DIR/scripts/lib/packages.zsh"

SUITE_ID="northline-suite"
WORKSPACE_ARGS=()

while (( $# > 0 )); do
  case "$1" in
    --suite)
      [[ $# -ge 2 ]] || { echo "Missing value for --suite" >&2; exit 1; }
      SUITE_ID="$2"
      shift 2
      ;;
    --workspace)
      [[ $# -ge 2 ]] || { echo "Missing value for --workspace" >&2; exit 1; }
      WORKSPACE_ARGS=(--workspace "$2")
      shift 2
      ;;
    --scope)
      [[ $# -ge 2 ]] || { echo "Missing value for --scope" >&2; exit 1; }
      shift 2
      ;;
    --skip-build)
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

IFS=$'\t' read -r RESOLVED_SUITE_ID SUITE_NAME SUITE_VERSION < <(
  node "$ROOT_DIR/tools/list-suite-runtimes.mjs" "${WORKSPACE_ARGS[@]}" --suite "$SUITE_ID" --format summary
)

DIST_DIR="$ROOT_DIR/dist/suites/${RESOLVED_SUITE_ID}"
PKG_PATH="$DIST_DIR/${RESOLVED_SUITE_ID}-${SUITE_VERSION}-uninstaller.pkg"
INSTALLER_PACKAGE_ID="io.github.mlangens.faust-web-au-kit.${RESOLVED_SUITE_ID}.installer"
UNINSTALLER_PACKAGE_ID="${INSTALLER_PACKAGE_ID%.installer}.uninstaller"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/${RESOLVED_SUITE_ID}.unpkg.XXXXXX")"
SCRIPTS_DIR="$WORK_DIR/scripts"
MANIFEST_PATH="$WORK_DIR/paths.txt"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$DIST_DIR"
: > "$MANIFEST_PATH"

app_count=0
while IFS=$'\t' read -r app_key _app_name artifact_stem _build_dir _dist_dir _generated_dir _version _bundle_id _category _variant _order; do
  [[ -n "$app_key" ]] || continue
  app_count=$((app_count + 1))
  append_bundle_relative_paths "$artifact_stem" "$MANIFEST_PATH"
done < <(
  node "$ROOT_DIR/tools/list-suite-runtimes.mjs" "${WORKSPACE_ARGS[@]}" --suite "$RESOLVED_SUITE_ID" --format tsv
)

write_uninstaller_scripts "$SCRIPTS_DIR" "$MANIFEST_PATH"
build_nopayload_package "$PKG_PATH" "$UNINSTALLER_PACKAGE_ID" "$SUITE_VERSION" "$SCRIPTS_DIR"

echo "Built ${SUITE_NAME} uninstaller (${app_count} apps) at $PKG_PATH"
