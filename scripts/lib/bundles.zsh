#!/bin/zsh

ensure_user_install_dirs() {
  mkdir -p "$HOME/Library/Audio/Plug-Ins/Components"
  mkdir -p "$HOME/Library/Audio/Plug-Ins/VST3"
  mkdir -p "$HOME/Library/Audio/Plug-Ins/CLAP"
  mkdir -p "$HOME/Applications"
}

ensure_system_stage_dirs() {
  local stage_root="$1"
  mkdir -p "$stage_root/Library/Audio/Plug-Ins/Components"
  mkdir -p "$stage_root/Library/Audio/Plug-Ins/VST3"
  mkdir -p "$stage_root/Library/Audio/Plug-Ins/CLAP"
  mkdir -p "$stage_root/Applications"
}

install_bundle() {
  local source_path="$1"
  local destination_path="$2"
  local staging_path="${destination_path}.next.$$"

  rm -rf "$staging_path" 2>/dev/null || true
  if ! cp -R "$source_path" "$staging_path" 2>/dev/null; then
    rm -rf "$staging_path" 2>/dev/null || true
    echo "Warning: could not install $(basename "$destination_path") to $destination_path" >&2
    return 0
  fi

  rm -rf "$destination_path" 2>/dev/null || true
  if ! mv "$staging_path" "$destination_path" 2>/dev/null; then
    rm -rf "$staging_path" 2>/dev/null || true
    echo "Warning: could not activate $(basename "$destination_path") at $destination_path" >&2
    return 0
  fi

  return 0
}

stage_bundle() {
  local source_path="$1"
  local destination_path="$2"

  mkdir -p "$(dirname "$destination_path")"
  cp -R "$source_path" "$destination_path"
}

append_bundle_relative_paths() {
  local artifact_stem="$1"
  local manifest_path="$2"

  printf '%s\n' "Library/Audio/Plug-Ins/Components/${artifact_stem}.component" >> "$manifest_path"
  printf '%s\n' "Library/Audio/Plug-Ins/VST3/${artifact_stem}.vst3" >> "$manifest_path"
  printf '%s\n' "Library/Audio/Plug-Ins/CLAP/${artifact_stem}.clap" >> "$manifest_path"
  printf '%s\n' "Applications/${artifact_stem}.app" >> "$manifest_path"
}

remove_bundle() {
  local destination_path="$1"

  if [[ ! -e "$destination_path" && ! -L "$destination_path" ]]; then
    return 1
  fi

  if ! rm -rf "$destination_path" 2>/dev/null; then
    echo "Warning: could not remove $(basename "$destination_path") at $destination_path" >&2
    return 2
  fi

  return 0
}
