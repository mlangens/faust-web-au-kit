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

ensure_user_install_dirs

INSTALL_LOCK_DIR="${TMPDIR:-/tmp}/${SUITE_ID}.suite-user-install.lock"
acquire_lock "$INSTALL_LOCK_DIR"
trap 'release_lock "$INSTALL_LOCK_DIR"' EXIT

IFS=$'\t' read -r RESOLVED_SUITE_ID SUITE_NAME SUITE_VERSION < <(
  node "$ROOT_DIR/tools/list-suite-runtimes.mjs" "${WORKSPACE_ARGS[@]}" --suite "$SUITE_ID" --format summary
)

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

  echo "[${app_count}] Installing $app_name"
  install_bundle "$build_dir/${artifact_stem}.component" "$HOME/Library/Audio/Plug-Ins/Components/${artifact_stem}.component"
  install_bundle "$build_dir/${artifact_stem}.vst3" "$HOME/Library/Audio/Plug-Ins/VST3/${artifact_stem}.vst3"
  install_bundle "$build_dir/${artifact_stem}.clap" "$HOME/Library/Audio/Plug-Ins/CLAP/${artifact_stem}.clap"
  install_bundle "$build_dir/${artifact_stem}.app" "$HOME/Applications/${artifact_stem}.app"
done < <(
  node "$ROOT_DIR/tools/list-suite-runtimes.mjs" "${WORKSPACE_ARGS[@]}" --suite "$RESOLVED_SUITE_ID" --format tsv
)

echo "Installed ${SUITE_NAME} (${app_count} apps, version ${SUITE_VERSION}) into ~/Library/Audio/Plug-Ins and ~/Applications."
