#!/usr/bin/env sh
set -eu

ROOT_PATH="${1:-.}"
FORCE="${FORCE:-false}"
TRACK_STATE="${TRACK_STATE:-false}"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
TEMPLATES_DIR="$PACKAGE_ROOT/templates"
COMMANDS_DIR="$PACKAGE_ROOT/commands"
mkdir -p "$ROOT_PATH"
ROOT_DIR=$(CDPATH= cd -- "$ROOT_PATH" && pwd)

copy_if_needed() {
  template_path="$1"
  target_path="$2"
  target_dir=$(dirname "$target_path")

  mkdir -p "$target_dir"

  if [ -f "$target_path" ] && [ "$FORCE" != "true" ]; then
    printf 'skip  %s\n' "$target_path"
    return
  fi

  cp "$template_path" "$target_path"
  printf 'write %s\n' "$target_path"
}

CONFIG_TARGET="$ROOT_DIR/baton-pass.config.json"
CONFIG_TEMPLATE="$TEMPLATES_DIR/baton-pass.config.template.json"
copy_if_needed "$CONFIG_TEMPLATE" "$CONFIG_TARGET"

handoff_path=$(sed -n 's/.*"handoff": "\(.*\)".*/\1/p' "$CONFIG_TARGET" | head -n 1)
current_state_path=$(sed -n 's/.*"currentState": "\(.*\)".*/\1/p' "$CONFIG_TARGET" | head -n 1)
next_task_path=$(sed -n 's/.*"nextTask": "\(.*\)".*/\1/p' "$CONFIG_TARGET" | head -n 1)
progress_log_path=$(sed -n 's/.*"progressLog": "\(.*\)".*/\1/p' "$CONFIG_TARGET" | head -n 1)
state_file_path=$(sed -n 's/.*"stateFile": "\(.*\)".*/\1/p' "$CONFIG_TARGET" | head -n 1)

copy_if_needed "$TEMPLATES_DIR/agent-handoff.template.md" "$ROOT_DIR/$handoff_path"
copy_if_needed "$TEMPLATES_DIR/current-state.template.md" "$ROOT_DIR/$current_state_path"
copy_if_needed "$TEMPLATES_DIR/next-task.template.md" "$ROOT_DIR/$next_task_path"
copy_if_needed "$TEMPLATES_DIR/progress-log.template.md" "$ROOT_DIR/$progress_log_path"
copy_if_needed "$TEMPLATES_DIR/baton-pass.state.template.json" "$ROOT_DIR/$state_file_path"

if [ -d "$COMMANDS_DIR" ]; then
  CLAUDE_COMMANDS_DIR="$ROOT_DIR/.claude/commands"
  mkdir -p "$CLAUDE_COMMANDS_DIR"
  for cmd_file in "$COMMANDS_DIR"/*.md; do
    [ -f "$cmd_file" ] || continue
    dest="$CLAUDE_COMMANDS_DIR/$(basename "$cmd_file")"
    if [ -f "$dest" ] && [ "$FORCE" != "true" ]; then
      printf 'skip  %s\n' "$dest"
    else
      cp "$cmd_file" "$dest"
      printf 'write %s\n' "$dest"
    fi
  done
fi

GITIGNORE_PATH="$ROOT_DIR/.gitignore"
printf '\nUpdating .gitignore...\n'
if [ -f "$GITIGNORE_PATH" ] && grep -q '# Baton Pass local files' "$GITIGNORE_PATH"; then
  printf 'skip  %s\n' "$GITIGNORE_PATH"
else
  if [ -s "$GITIGNORE_PATH" ]; then
    printf '\n' >> "$GITIGNORE_PATH"
  fi
  {
    printf '%s\n' '# Baton Pass local files'
    printf '%s\n' '.claude/settings.local.json'
    printf '%s\n' '.npm-cache/'
    printf '%s\n' '.tmp-*/'
    if [ "$TRACK_STATE" != "true" ]; then
      printf '\n'
      printf '%s\n' '# Baton Pass local state'
      printf '%s\n' 'baton-pass.config.json'
      printf '%s\n' 'baton-pass.state.json'
      printf '%s\n' 'docs/'
    fi
  } >> "$GITIGNORE_PATH"
  printf 'write %s\n' "$GITIGNORE_PATH"
fi

printf '\nBaton Pass new-game complete.\n'
printf 'Next:\n'
printf '%s\n' '- Review baton-pass.config.json'
printf '%s\n' '- Review baton-pass.state.json'
if [ "$TRACK_STATE" = "true" ]; then
  printf '%s\n' '- Review the Baton Pass block added to .gitignore (state files are trackable)'
else
  printf '%s\n' '- Review the Baton Pass block added to .gitignore (state files are local-only)'
fi
printf '%s\n' '- Customize docs/agent-handoff.md for your repo'
printf '%s\n' '- Fill in docs/current-state.md and docs/next-task.md'
printf '%s\n' '- Start appending real sessions to docs/progress.md'
printf '%s\n' '- Slash commands installed to .claude/commands/ — use /new-game, /save-state, /baton-pass, /foresight, /dragon-dance, /party-check, /hindsight'
