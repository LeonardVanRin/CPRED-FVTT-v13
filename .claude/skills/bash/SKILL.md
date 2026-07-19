[SKILL.md](https://github.com/user-attachments/files/30165436/SKILL.md)
---
name: bash
description: Conventions for writing bash/shell scripts in this repo — portable shebang, strict mode, a header comment, environment-variable input (never getopts), quoting, control-flow style, and function-local discipline. Every script must pass shellcheck and shfmt. Use when creating or editing any bash/`.sh` script.
---

# Bash script conventions

Every bash script in this repo follows the rules below **and must pass `shellcheck` and `shfmt`**;
`shfmt` honours `.editorconfig` — 2-space indent, case-branch indent, 80-col for `*.sh`).

## Rules

1. **Portable shebang** — `#!/usr/bin/env bash`, never `#!/bin/bash`.
2. **Strict mode** — immediately after the shebang, both the options and `IFS`:

   ```bash
   set -euo pipefail
   IFS=$'\n\t'
   ```

3. **Header comment** — after the strict-mode block, a terse description of what the script does,
   followed by a blank line before the code. It **must list every environment variable the script expects
   from outside**, marking each required or defaulted:

   ```bash
   # Copy a file into place and report its size.
   #
   # Environment:
   #   SRC       source file to copy (required)
   #   DEST_DIR  directory to copy into (default: /tmp)
   ```

4. **Input comes from environment variables — never `getopts` or positional CLI args.** Read each at the
   top of `main`:
   - optional, with a sensible default → `"${DEST_DIR:-/tmp}"`;
   - required → `"${SRC:?SRC must be set to the source file}"`, which aborts with the message if unset.

5. **Brace _and_ quote every expansion** — `"${var}"`, `"${arr[@]}"`, `"${var:-default}"`. Never a bare
   `$var` or unbraced `"$var"`.
6. **`; then` / `; do` on the same line** as their keyword — `if …; then`, `for …; do`, `while …; do`.
7. **No bare short-circuit control flow.** Never drive control flow with `&&` / `||`:

   ```bash
   # banned
   [[ -f "${src}" ]] || return 1
   make_thing && publish_thing

   # required
   if [[ ! -f "${src}" ]]; then
     return 1
   fi
   ```

8. **Indent `case` branches** — each pattern is indented one level under `case`, and its body one level
   under that (`shfmt`'s `switch_case_indent`, set in `.editorconfig`):

   ```bash
   case "${mode}" in
     start)
       start_thing
       ;;
     *)
       printf 'unknown mode: %s\n' "${mode}" >&2
       return 1
       ;;
   esac
   ```

9. **Function locals — declare and assign on separate statements, in this order:**
   1. declare the **arg locals** (`local src`),
   2. **assign** them from the positional params (`src="${1}"`),
   3. declare **every other local** the function uses,

   then the logic — which uses the **named locals only, never `$1` / `$2` / `$@`**. Declaring and
   assigning separately is mandatory: `local x=$(cmd)` swallows `cmd`'s exit status (the `local` builtin
   succeeds), whereas `local x; x=$(cmd)` preserves it under `set -e`.

## Canonical example

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Copy a file into place and report its size.
#
# Environment:
#   SRC       source file to copy (required)
#   DEST_DIR  directory to copy into (default: /tmp)

copy_into_place() {
  # 1) declare arg locals
  local src
  local dest
  # 2) assign args to named locals — the logic below never uses $1/$2
  src="${1}"
  dest="${2}"
  # 3) declare every other local the function uses
  local size

  if [[ ! -f "${src}" ]]; then
    printf 'no such file: %s\n' "${src}" >&2
    return 1
  fi

  cp -- "${src}" "${dest}"

  # declared above, assigned here: `local size=$(...)` would mask stat's exit status
  size="$(stat -c '%s' "${dest}")"
  printf 'copied %s (%s bytes)\n' "${dest}" "${size}"
}

main() {
  # input comes from the environment (rule 4), never CLI flags/getopts
  local src
  local dest_dir
  src="${SRC:?SRC must be set to the source file}"
  dest_dir="${DEST_DIR:-/tmp}"

  copy_into_place "${src}" "${dest_dir}/$(basename -- "${src}")"
}

main
```

## Verify

Both must pass before the script is done:

```bash
shellcheck path/to/script.sh
shfmt -d path/to/script.sh     # -d shows a diff; `shfmt -w path/to/script.sh` writes fixes
```
