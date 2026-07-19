{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = [
    pkgs.nodejs_22
    # Playwright's own `npx playwright install` does not work on NixOS; use the
    # browsers packaged in nixpkgs instead (selected via PLAYWRIGHT_BROWSERS_PATH
    # below). See https://wiki.nixos.org/wiki/Playwright
    pkgs.playwright-driver.browsers
    # Standalone Chromium for the Playwright MCP (see PLAYWRIGHT_MCP_EXECUTABLE_PATH
    # below) — driven via --executable-path, so its exact revision need not match
    # the pinned playwright-driver above.
    pkgs.chromium
    # Shell script linting/formatting — every bash script must pass both
    # (see .claude/skills/bash/SKILL.md).
    pkgs.shellcheck
    pkgs.shfmt
    # Fast recursive search — the rules/PDF researcher greps the extracted corpus.
    pkgs.ripgrep
    # Python 3 — runs the `.claude/skills/*/scripts/*.py` helpers (e.g. the
    # implement/exploration plan-state and map-state scripts).
    pkgs.python3
  ];

  # Prebuilt npm binaries (e.g. @fallow-cli) are generic glibc executables
  # linked against /lib64/ld-linux-x86-64.so.2, which doesn't exist on NixOS.
  # nix-ld's stub loader reads these env vars to find a real loader + libs.
  NIX_LD = pkgs.lib.fileContents "${pkgs.stdenv.cc}/nix-support/dynamic-linker";
  NIX_LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
    pkgs.stdenv.cc.cc.lib # libgcc_s
    pkgs.glibc # libc, libm, libdl, libpthread
  ];

  # Point Playwright at the nixpkgs-packaged browsers and skip its host-deps
  # check (the libraries are already provided by the package).
  #
  # IMPORTANT: the @playwright/test version in package.json must match this
  # channel's playwright-driver version, or the browser revisions won't line up.
  # Check with:  nix eval --raw nixpkgs#playwright-driver.version
  # (this channel currently provides 1.60.0; package.json is pinned to match).
  PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
  PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";

  # The Playwright MCP (`@playwright/mcp@latest`, see .mcp.json) tracks the newest
  # Playwright — currently an alpha whose bundled Chromium revision the pinned
  # playwright-driver above cannot provide. Rather than pin the MCP to an old
  # version, point it at the standalone nixpkgs Chromium via --executable-path.
  # .mcp.json references this var as ${PLAYWRIGHT_MCP_EXECUTABLE_PATH}, so the
  # /nix/store path stays out of the committed config and tracks the channel.
  PLAYWRIGHT_MCP_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";
}
