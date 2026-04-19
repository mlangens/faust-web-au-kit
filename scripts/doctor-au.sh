#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_STEM=""

source "$ROOT_DIR/scripts/lib/runtime.zsh"

load_app_runtime "$ROOT_DIR" "$@"
ARTIFACT_STEM="$FWAK_ARTIFACT_STEM"

SYSTEM_COMPONENT="/Library/Audio/Plug-Ins/Components/${ARTIFACT_STEM}.component"
USER_COMPONENT="$HOME/Library/Audio/Plug-Ins/Components/${ARTIFACT_STEM}.component"

print_component_info() {
  local label="$1"
  local component_path="$2"

  echo ""
  echo "$label:"
  echo "  path: $component_path"

  if [[ ! -d "$component_path" ]]; then
    echo "  status: missing"
    return
  fi

  local info_plist="$component_path/Contents/Info.plist"
  local binary_path="$component_path/Contents/MacOS/${ARTIFACT_STEM}"
  local bundle_version="unknown"
  local component_version="unknown"
  local binary_hash="missing"

  if [[ -f "$info_plist" ]]; then
    bundle_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$info_plist" 2>/dev/null || echo unknown)"
    component_version="$(/usr/libexec/PlistBuddy -c 'Print :AudioComponents:0:version' "$info_plist" 2>/dev/null || echo unknown)"
  fi

  if [[ -f "$binary_path" ]]; then
    binary_hash="$(shasum -a 256 "$binary_path" | awk '{print $1}')"
  fi

  echo "  status: present"
  echo "  bundle version: $bundle_version"
  echo "  component version: $component_version"
  echo "  binary sha256: $binary_hash"
}

system_hash=""
user_hash=""
if [[ -f "$SYSTEM_COMPONENT/Contents/MacOS/${ARTIFACT_STEM}" ]]; then
  system_hash="$(shasum -a 256 "$SYSTEM_COMPONENT/Contents/MacOS/${ARTIFACT_STEM}" | awk '{print $1}')"
fi
if [[ -f "$USER_COMPONENT/Contents/MacOS/${ARTIFACT_STEM}" ]]; then
  user_hash="$(shasum -a 256 "$USER_COMPONENT/Contents/MacOS/${ARTIFACT_STEM}" | awk '{print $1}')"
fi

echo "${FWAK_APP_NAME} AU doctor"
echo "Expected version: $FWAK_PROJECT_VERSION"

print_component_info "System install" "$SYSTEM_COMPONENT"
print_component_info "User install" "$USER_COMPONENT"

echo ""
if [[ -n "$system_hash" && -n "$user_hash" && "$system_hash" != "$user_hash" ]]; then
  echo "Warning: system and user AU installs differ."
  echo "Advice: install the latest .pkg so /Library matches the current build, or remove the stale copy before testing in Logic."
elif [[ -n "$system_hash" || -n "$user_hash" ]]; then
  echo "Install consistency: OK"
else
  echo "Warning: no AU install found."
fi

echo ""
echo "auval summary:"
if ! auval -v "$FWAK_AU_TYPE" "$FWAK_AU_SUBTYPE" "$FWAK_AU_MANUFACTURER" | \
  rg 'Component Version|Reported Channel Capabilities|1 Channel Test|AU VALIDATION SUCCEEDED' -n -A1 -B1; then
  echo "auval did not report a passing validation summary."
fi
