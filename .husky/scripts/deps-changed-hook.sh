#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'
# .husky/post-merge and .husky/post-rewrite (or scripts/deps-changed-hook.sh)
#
# Notifies the dev when package.json / package-lock.json changed
# after a pull (merge) or rebase, and when foundryconfig.json.example
# changed in a way that leaves a local foundryconfig.json out of sync.

# Files that should trigger the dependency notification (regex, matches at any depth)
WATCH_REGEX='(^|/)(package\.json|package-lock\.json|npm-shrinkwrap\.json)$'
# The foundryconfig example; changes here prompt a key-drift check against the local copy
CONFIG_EXAMPLE_REGEX='(^|/)foundryconfig\.json\.example$'

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

notify() {
  # Colored output if we're attached to a terminal, plain otherwise
  if [[ -t 1 ]]; then
    printf '\n\033[1;33m📦  Dependency files changed:\033[0m\n'
  else
    printf '\n📦  Dependency files changed:\n'
  fi
  printf '%s\n' "$1" | sed 's/^/    /'
  printf '\n👉  Run \033[1mnpm install\033[0m (or \033[1mnpm ci\033[0m) to sync your node_modules.\n\n'
}

notify_config() {
  # $1 = human-readable summary of the key drift
  if [[ -t 1 ]]; then
    printf '\n\033[1;33m⚙️   foundryconfig.json is out of sync with foundryconfig.json.example:\033[0m\n'
  else
    printf '\n⚙️   foundryconfig.json is out of sync with foundryconfig.json.example:\n'
  fi
  printf '%s\n' "$1" | sed 's/^/    /'
  printf '\n👉  Reconcile the keys in \033[1mfoundryconfig.json\033[0m with the example.\n\n'
}

changed_between() {
  # List changed files between two commits; tolerate failures quietly
  git diff-tree -r --name-only --no-commit-id "$1" "$2" 2>/dev/null || true
}

# Compare the *keys* (not values) of the local foundryconfig.json against the
# example. Communicates purely via stdout: prints a drift summary when the keys
# differ (or a parse error), and prints nothing when they are in sync, a file is
# absent, or jq is unavailable. Always returns 0 so callers stay set -e safe.
config_key_drift() {
  local example="${repo_root}/foundryconfig.json.example"
  local config="${repo_root}/foundryconfig.json"
  # Nothing to compare if either file is missing (config is untracked and optional)
  [[ -f "${example}" && -f "${config}" ]] || return 0
  # No jq, no check — skip quietly rather than break the hook
  command -v jq >/dev/null 2>&1 || return 0

  # Emit every nested key path (dot-joined), skipping documentation-only
  # "description" keys. Values are ignored entirely.
  local jq_prog='paths | select(all(.[]; . != "description")) | map(tostring) | join(".")'
  local example_keys config_keys
  if ! example_keys="$(jq -r "${jq_prog}" "${example}" 2>/dev/null | sort -u)"; then
    echo "Could not parse foundryconfig.json.example"
    return 0
  fi
  if ! config_keys="$(jq -r "${jq_prog}" "${config}" 2>/dev/null | sort -u)"; then
    echo "Could not parse foundryconfig.json"
    return 0
  fi

  # grep returns non-zero when it filters everything out; tolerate that so the
  # in-sync case doesn't trip pipefail.
  local missing extra
  missing="$(comm -23 <(printf '%s\n' "${example_keys}") <(printf '%s\n' "${config_keys}") |
    grep -v '^$' | paste -sd, - | sed 's/,/, /g' || true)"
  extra="$(comm -13 <(printf '%s\n' "${example_keys}") <(printf '%s\n' "${config_keys}") |
    grep -v '^$' | paste -sd, - | sed 's/,/, /g' || true)"

  [[ -n "${missing}" ]] && echo "Missing keys: ${missing}"
  [[ -n "${extra}" ]] && echo "Unexpected keys: ${extra}"
  return 0
}

hook_name="$(basename "$0")"
changed=""

case "${hook_name}" in
post-rewrite)
  # git passes "old-sha new-sha [extra]" lines on stdin, one per rewritten commit.
  # Only care about rebase (arg $1 is "rebase" or "amend").
  while read -r old new _; do
    [[ -n "${old:-}" ]] && [[ -n "${new:-}" ]] || continue
    changed+="$(changed_between "${old}" "${new}")"$'\n'
  done
  ;;
*)
  # post-merge (and a sane fallback for anything else).
  # ORIG_HEAD = where we were before the merge; HEAD = where we are now.
  if git rev-parse -q --verify ORIG_HEAD >/dev/null; then
    changed="$(changed_between ORIG_HEAD HEAD)"
  fi
  ;;
esac

# Filter to watched dependency files, dedupe
matches="$(printf '%s' "${changed}" | grep -E "${WATCH_REGEX}" | sort -u || true)"

if [[ -n "${matches}" ]]; then
  notify "${matches}"
fi

# If the example changed, check the local (untracked) config for key drift.
# config_key_drift prints a summary (and returns non-zero) only when the keys
# differ; an empty result means in sync, missing files, or no jq.
if printf '%s' "${changed}" | grep -qE "${CONFIG_EXAMPLE_REGEX}"; then
  drift="$(config_key_drift)"
  if [[ -n "${drift}" ]]; then
    notify_config "${drift}"
  fi
fi

exit 0
