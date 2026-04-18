#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_STEM="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.artifactStem);' "$ROOT_DIR/project.json")"
EXPECTED_VERSION="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.version);' "$ROOT_DIR/project.json")"
AU_TYPE="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.au.type);' "$ROOT_DIR/project.json")"
AU_SUBTYPE="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.au.subtype);' "$ROOT_DIR/project.json")"
AU_MANUFACTURER="$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(p.au.manufacturer);' "$ROOT_DIR/project.json")"

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

echo "Limiter Lab AU doctor"
echo "Expected version: $EXPECTED_VERSION"

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
if ! auval -v "$AU_TYPE" "$AU_SUBTYPE" "$AU_MANUFACTURER" | \
  rg 'Component Version|Reported Channel Capabilities|1 Channel Test|AU VALIDATION SUCCEEDED' -n -A1 -B1; then
  echo "auval did not report a passing validation summary."
fi
