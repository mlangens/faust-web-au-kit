#!/bin/zsh

acquire_lock() {
  local lock_dir="$1"
  local timeout_seconds="${2:-120}"
  local deadline=$((SECONDS + timeout_seconds))

  while ! mkdir "$lock_dir" 2>/dev/null; do
    if (( SECONDS >= deadline )); then
      echo "Timed out waiting for lock: $lock_dir" >&2
      return 1
    fi
    sleep 0.2
  done
}

release_lock() {
  local lock_dir="$1"
  rmdir "$lock_dir" 2>/dev/null || true
}
