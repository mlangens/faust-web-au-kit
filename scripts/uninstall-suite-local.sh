#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

source "$ROOT_DIR/scripts/lib/bundles.zsh"
source "$ROOT_DIR/scripts/lib/lock.zsh"

SUITE_ID="northline-suite"
SCOPE="user"
WORKSPACE_ARGS=()

while (( $# > 0 )); do
  case "$1" in
    --suite)
      [[ $# -ge 2 ]] || { echo "Missing value for --suite" >&2; exit 1; }
      SUITE_ID="$2"
      shift 2
      ;;
    --scope)
      [[ $# -ge 2 ]] || { echo "Missing value for --scope" >&2; exit 1; }
      SCOPE="$2"
      shift 2
      ;;
    --workspace)
      [[ $# -ge 2 ]] || { echo "Missing value for --workspace" >&2; exit 1; }
      WORKSPACE_ARGS=(--workspace "$2")
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

case "$SCOPE" in
  user|system|both)
    ;;
  *)
    echo "Unsupported scope \"$SCOPE\". Use user, system, or both." >&2
    exit 1
    ;;
esac

UNINSTALL_LOCK_DIR="${TMPDIR:-/tmp}/${SUITE_ID}.suite-uninstall.lock"
acquire_lock "$UNINSTALL_LOCK_DIR"
trap 'release_lock "$UNINSTALL_LOCK_DIR"' EXIT

IFS=$'\t' read -r RESOLVED_SUITE_ID SUITE_NAME SUITE_VERSION < <(
  node "$ROOT_DIR/tools/list-suite-runtimes.mjs" "${WORKSPACE_ARGS[@]}" --suite "$SUITE_ID" --format summary
)

app_count=0
removed_count=0
while IFS=$'\t' read -r app_key app_name artifact_stem _build_dir _dist_dir _generated_dir _version _bundle_id _category _variant _order; do
  [[ -n "$app_key" ]] || continue
  app_count=$((app_count + 1))
  echo "[${app_count}] Removing $app_name"

  if [[ "$SCOPE" == "user" || "$SCOPE" == "both" ]]; then
    if remove_bundle "$HOME/Library/Audio/Plug-Ins/Components/${artifact_stem}.component"; then
      removed_count=$((removed_count + 1))
    fi
    if remove_bundle "$HOME/Library/Audio/Plug-Ins/VST3/${artifact_stem}.vst3"; then
      removed_count=$((removed_count + 1))
    fi
    if remove_bundle "$HOME/Library/Audio/Plug-Ins/CLAP/${artifact_stem}.clap"; then
      removed_count=$((removed_count + 1))
    fi
    if remove_bundle "$HOME/Applications/${artifact_stem}.app"; then
      removed_count=$((removed_count + 1))
    fi
  fi

  if [[ "$SCOPE" == "system" || "$SCOPE" == "both" ]]; then
    if remove_bundle "/Library/Audio/Plug-Ins/Components/${artifact_stem}.component"; then
      removed_count=$((removed_count + 1))
    fi
    if remove_bundle "/Library/Audio/Plug-Ins/VST3/${artifact_stem}.vst3"; then
      removed_count=$((removed_count + 1))
    fi
    if remove_bundle "/Library/Audio/Plug-Ins/CLAP/${artifact_stem}.clap"; then
      removed_count=$((removed_count + 1))
    fi
    if remove_bundle "/Applications/${artifact_stem}.app"; then
      removed_count=$((removed_count + 1))
    fi
  fi
done < <(
  node "$ROOT_DIR/tools/list-suite-runtimes.mjs" "${WORKSPACE_ARGS[@]}" --suite "$RESOLVED_SUITE_ID" --format tsv
)

echo "Uninstalled ${SUITE_NAME} (${app_count} apps, version ${SUITE_VERSION}) from ${SCOPE} scope. Removed ${removed_count} bundles."
