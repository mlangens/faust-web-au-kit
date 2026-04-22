#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

source "$ROOT_DIR/scripts/lib/bundles.zsh"
source "$ROOT_DIR/scripts/lib/lock.zsh"

SUITE_ID="northline-suite"
SKIP_BUILD=0
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
    --skip-build)
      SKIP_BUILD=1
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

PACKAGE_LOCK_DIR="${TMPDIR:-/tmp}/${RESOLVED_SUITE_ID}.suite-package.lock"
DIST_DIR="$ROOT_DIR/dist/suites/${RESOLVED_SUITE_ID}"
PKG_PATH="$DIST_DIR/${RESOLVED_SUITE_ID}-${SUITE_VERSION}.pkg"
PACKAGE_ID="io.github.mlangens.faust-web-au-kit.${RESOLVED_SUITE_ID}.installer"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/${RESOLVED_SUITE_ID}.pkgroot.XXXXXX")"

cleanup() {
  rm -rf "$STAGE_DIR"
}

acquire_lock "$PACKAGE_LOCK_DIR"
trap 'release_lock "$PACKAGE_LOCK_DIR"; cleanup' EXIT

ensure_system_stage_dirs "$STAGE_DIR"
mkdir -p "$DIST_DIR"

app_count=0
while IFS=$'\t' read -r app_key app_name artifact_stem build_dir _dist_dir _generated_dir _version _bundle_id _category _variant _order; do
  [[ -n "$app_key" ]] || continue
  app_count=$((app_count + 1))

  if (( ! SKIP_BUILD )); then
    echo "[${app_count}] Building $app_name"
    (
      cd "$ROOT_DIR"
      ./scripts/build-native.sh "${WORKSPACE_ARGS[@]}" --app "$app_key" >/dev/null
    )
  fi

  echo "[${app_count}] Staging $app_name"
  stage_bundle "$build_dir/${artifact_stem}.component" "$STAGE_DIR/Library/Audio/Plug-Ins/Components/${artifact_stem}.component"
  stage_bundle "$build_dir/${artifact_stem}.vst3" "$STAGE_DIR/Library/Audio/Plug-Ins/VST3/${artifact_stem}.vst3"
  stage_bundle "$build_dir/${artifact_stem}.clap" "$STAGE_DIR/Library/Audio/Plug-Ins/CLAP/${artifact_stem}.clap"
  stage_bundle "$build_dir/${artifact_stem}.app" "$STAGE_DIR/Applications/${artifact_stem}.app"
done < <(
  node "$ROOT_DIR/tools/list-suite-runtimes.mjs" "${WORKSPACE_ARGS[@]}" --suite "$RESOLVED_SUITE_ID" --format tsv
)

rm -f "$PKG_PATH"
pkgbuild \
  --root "$STAGE_DIR" \
  --identifier "$PACKAGE_ID" \
  --version "$SUITE_VERSION" \
  "$PKG_PATH"

echo "Built ${SUITE_NAME} installer (${app_count} apps) at $PKG_PATH"
