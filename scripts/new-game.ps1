param(
  [string]$RootPath = ".",
  [switch]$Force,
  [switch]$TrackState
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$initScript = Join-Path $scriptDir "init-baton-pass.ps1"

& $initScript -RootPath $RootPath -Force:$Force -TrackState:$TrackState
