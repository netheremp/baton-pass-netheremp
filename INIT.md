# New Game

Use this when a repo does not already have a handoff system.

## Goal

Bootstrap the minimum shared memory and state files so multi-agent work can start safely from zero.

## What Gets Created

The default initializer creates:
- `baton-pass.config.json`
- `baton-pass.state.json`
- `docs/agent-handoff.md`
- `docs/current-state.md`
- `docs/next-task.md`
- `docs/progress.md`
- `.gitignore` block for Baton Pass local files

These are the core dependencies for the workflow.

By default, Baton Pass state is local-only and ignored by git. Track it only when the team explicitly wants handoff state committed to GitHub.

## Why The Two JSON Files Exist

`baton-pass.config.json` tells the utility where the repo keeps its memory files.

`baton-pass.state.json` tracks lightweight shared status:
- state
- last move
- last agent
- next agent
- updated at
- summary

That gives you a cheap coordination layer for `party-check`.

## Fast Start

### PowerShell

```powershell
./scripts/new-game.ps1
```

### Bash

```bash
./scripts/new-game.sh
```

## Manual Start

If you do not want to run scripts:

1. Copy `templates/baton-pass.config.template.json` to `baton-pass.config.json`.
2. Copy `templates/baton-pass.state.template.json` to `baton-pass.state.json`.
3. Copy `templates/agent-handoff.template.md` to `docs/agent-handoff.md`.
4. Copy `templates/current-state.template.md` to `docs/current-state.md`.
5. Copy `templates/next-task.template.md` to `docs/next-task.md`.
6. Copy `templates/progress-log.template.md` to `docs/progress.md`.
7. Edit `baton-pass.config.json` if your paths are different.
8. Decide whether Baton Pass state should be local-only or tracked in git.
9. Add this block to `.gitignore` for local-only state:

```gitignore
# Baton Pass local files
.claude/settings.local.json
.npm-cache/
.tmp-*/

# Baton Pass local state
baton-pass.config.json
baton-pass.state.json
docs/
```

For tracked state, omit only the `# Baton Pass local state` section.

## After Initialization

Once the files exist:

1. Fill in the first `current-state`.
2. Fill in the first `next-task`.
3. Review the Baton Pass block in `.gitignore`.
4. Append the first real session entry to `progress`.
5. Add repo-specific rules to `agent-handoff`.
6. Update `baton-pass.state.json` with the active or paused state.
7. Start using `save-state`, `baton-pass`, `foresight`, and `party-check`.

## Safe Defaults

The initializer does not overwrite existing files unless you force it in the script.

That keeps it safe to run in repos that already have part of the workflow.
