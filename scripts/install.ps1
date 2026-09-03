# baton-pass - install the skill + move set for Claude and Codex (user-level).
# Thin wrapper around `node bin/baton-pass.js install`. Pass any install flags through:
#   pwsh scripts/install.ps1 --link
#   pwsh scripts/install.ps1 --codex-home "$HOME/.codex-work" --skill-only
# Derived from francisN21/baton-pass (MIT).

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageRoot = Split-Path -Parent $scriptDir
$bin = Join-Path $packageRoot "bin/baton-pass.js"

& node $bin install @args
exit $LASTEXITCODE
