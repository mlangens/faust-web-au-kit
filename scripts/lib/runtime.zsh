#!/bin/zsh

load_app_runtime() {
  local root_dir="$1"
  shift
  eval "$(node "$root_dir/tools/print-runtime-env.mjs" "$@")"
}
