[SKILL.md](https://github.com/user-attachments/files/30197548/SKILL.md)
---
name: playwright-nix
description: On NixOS, resolve Playwright/Chromium/Chrome browser errors by fixing shell.nix — never by installing ad-hoc versions or hardcoding /nix/store paths. Use when Playwright can't find/launch a browser, "npx playwright install" fails, browser revisions mismatch, or the MCP Chromium won't start on this machine.
---

# Playwright on NixOS

On NixOS, browsers are **not** installed imperatively. `npx playwright install` does
not work here — it downloads generic glibc binaries that fail against NixOS's loader.
Every browser Playwright uses is provided declaratively by `shell.nix` and selected via
environment variables set there.

## The one rule

When you hit a Playwright/Chromium/Chrome problem on NixOS, the fix goes in `shell.nix`.

Do **NOT**:

- ❌ run `npx playwright install` / `npx playwright install-deps`
- ❌ `npm install` a different `@playwright/test` version to "make it match"
- ❌ hunt through `/nix/store` for a browser and hardcode that path anywhere
- ❌ hardcode a `/nix/store/...` path into `.mcp.json`, a test, or an env var
- ❌ set `PLAYWRIGHT_BROWSERS_PATH` / executable paths to a literal store path

Store paths are outputs of the Nix evaluation, not inputs. Hardcoding one pins a hash
that breaks on the next channel bump and rots for everyone else. The browser **MUST** be
sourced from `shell.nix` — i.e. from a nixpkgs package expression that Nix resolves.

## How it's wired (this repo)

`shell.nix` is the single source of truth. It:

- adds `pkgs.playwright-driver.browsers` (browsers for `@playwright/test`) and
  `pkgs.chromium` (standalone, for the Playwright MCP) to the shell
- exports `PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}"` so Playwright
  finds the nixpkgs-packaged browsers
- exports `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true"`
- exports `PLAYWRIGHT_MCP_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium"`, which
  `.mcp.json` references as `${PLAYWRIGHT_MCP_EXECUTABLE_PATH}` — keeping the store path
  out of committed config

The `${pkgs...}` interpolations are how you reference a browser: Nix evaluates them to
the correct store path. You write the package expression; you never write the path.

## Diagnosing & fixing

**Version mismatch** ("browser revision ... not found", driver/test disagree): the
`@playwright/test` version in `package.json` and the `playwright-driver` version from the
nixpkgs channel must line up. **Playwright leads; shell.nix follows.** Pick the Playwright
version you want in `package.json`, then bump the nixpkgs pin/channel in `shell.nix` so its
`playwright-driver` provides a matching browser revision. Check the channel with:

```sh
nix eval --raw nixpkgs#playwright-driver.version
```

If both need bumping, bump both — advance `@playwright/test` and advance the `shell.nix`
pin together so they match. Never downgrade `@playwright/test` just to match a stale
channel, and never install an ad-hoc browser to bridge the gap.

**MCP Chromium won't launch**: it's driven via `--executable-path` from
`PLAYWRIGHT_MCP_EXECUTABLE_PATH`, set in `shell.nix` from `${pkgs.chromium}`. Fix it there.

**"Browser not found" generally**: confirm you're inside the dev shell (`nix-shell` /
direnv) so the env vars from `shell.nix` are actually exported. Most "missing browser"
reports on NixOS are just a shell that wasn't entered — not a real install problem.

## Reference

- [Playwright](https://wiki.nixos.org/wiki/Playwright)
- [Nix Shell](https://nixos.wiki/wiki/Development_environment_with_nix-shell)
