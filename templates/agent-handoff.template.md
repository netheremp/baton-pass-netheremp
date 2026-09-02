# Agent Handoff

Purpose: this is the live operating document for round-robin work in this repo.

## Core Dependencies

This repo uses:
- `current-state`
- `next-task`
- `progress`
- this handoff doc

The exact paths should be tracked in `baton-pass.config.json`.

## Resume Order

1. Read the latest user request.
2. Read `current-state`.
3. Read `next-task`.
4. Read the latest `progress` entries.
5. Check `git status` and recent commits.
6. Open the files named in `next-task`.
7. Only then begin work.

## Source Of Truth

Resolve conflicts in this order:
1. current user request
2. current code
3. git history and working tree
4. `current-state`
5. `next-task`
6. `progress`
7. older planning docs

## Handoff Rule

Every meaningful `baton-pass` should:
- leave one clear next task
- record honest verification
- note current risks
- commit or document why not before transferring

Include a `dragon-dance` entry only if a real workflow lesson appeared during the session.
Do not add one by reflex.

## Repo-Specific Rules

Add your project-specific rules below:

- 
