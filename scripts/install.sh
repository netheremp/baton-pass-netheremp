#!/usr/bin/env sh
# baton-pass — install the skill + move set for Claude and Codex (user-level).
# Thin wrapper around `node bin/baton-pass.js install`. Pass any install flags through:
#   sh scripts/install.sh --link
#   sh scripts/install.sh --codex-home "$HOME/.codex-work" --skill-only
# Derived from francisN21/baton-pass (MIT).
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

exec node "$PACKAGE_ROOT/bin/baton-pass.js" install "$@"
