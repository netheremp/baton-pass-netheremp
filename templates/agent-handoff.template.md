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
4. Read the latest relevant `progress` entry only if current state leaves a gap.
5. Check `git status --short` and a bounded recent commit summary.
6. Inspect relevant portions of files named in `next-task`.
7. Only then begin work.

## Token Budget

- Keep `foresight` delta-only. Deepen inspection only for drift, contradiction, or missing context; no routine full repo audit, full history read, or full-spec reread. Use bounded history excerpts; full append-only history belongs to `hindsight`, forensics, severe drift, or an explicit audit.
- Prefer Git status/stat/path summaries, then targeted diffs for relevant files/ranges; avoid unrestricted `git diff`. Never narrow authoritative machine-side path collection or validator checks.
- No tiny-checkpoint baton passes, routine `hindsight`, `dragon-dance` without a reusable lesson, or rewriting stable history when a delta suffices.
- Ordinary CLI/UI/docs/tests/mechanical work uses normal implementation and appropriate tests unless risk warrants escalation. Reserve expensive independent/adversarial review for invariant-affecting CAS, fencing, state transitions, recovery, integration, ownership, validator logic, and concurrency; no automatic frontier-model review for every change.
- Spend tokens where protocol correctness requires reasoning. Preserve all protocol guarantees, required verification, and board/presence functionality and human-facing visibility.

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
