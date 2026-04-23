#!/bin/zsh

installer_target_for_scope() {
  local scope="$1"

  case "$scope" in
    user)
      echo "CurrentUserHomeDirectory"
      ;;
    system)
      echo "/"
      ;;
    *)
      echo "Unsupported scope \"$scope\". Use user or system." >&2
      return 1
      ;;
  esac
}

run_package_installer() {
  local pkg_path="$1"
  local target="$2"
  local action_label="${3:-Installing package}"
  local -a command_args=(/usr/sbin/installer -allowUntrusted -pkg "$pkg_path" -target "$target")

  if [[ "$target" == "/" && "$EUID" -ne 0 ]]; then
    echo "${action_label} at / requires administrator privileges."
    command_args=(sudo "${command_args[@]}")
  fi

  "${command_args[@]}"
}

write_uninstaller_scripts() {
  local scripts_dir="$1"
  local manifest_path="$2"

  mkdir -p "$scripts_dir"
  cp "$manifest_path" "$scripts_dir/paths.txt"

  cat > "$scripts_dir/postinstall" <<'EOF'
#!/bin/zsh
set -euo pipefail

TARGET_ROOT="${2:-/}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST_PATH="$SCRIPT_DIR/paths.txt"
removed_count=0

join_target_path() {
  local root="$1"
  local relative_path="$2"

  if [[ "$root" == "/" ]]; then
    printf '/%s\n' "$relative_path"
    return
  fi

  printf '%s/%s\n' "${root%/}" "$relative_path"
}

while IFS= read -r relative_path; do
  [[ -n "$relative_path" ]] || continue

  installed_path="$(join_target_path "$TARGET_ROOT" "$relative_path")"
  if [[ -e "$installed_path" || -L "$installed_path" ]]; then
    rm -rf "$installed_path"
    removed_count=$((removed_count + 1))
  fi
done < "$MANIFEST_PATH"

echo "Removed ${removed_count} installed items from $TARGET_ROOT."
exit 0
EOF

  chmod +x "$scripts_dir/postinstall"
}

build_nopayload_package() {
  local output_path="$1"
  local package_id="$2"
  local package_version="$3"
  local scripts_dir="$4"

  rm -f "$output_path"
  pkgbuild \
    --nopayload \
    --scripts "$scripts_dir" \
    --identifier "$package_id" \
    --version "$package_version" \
    "$output_path"
}
