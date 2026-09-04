---
name: baton-pass
description: Multi-agent handoff workflow for coding repos, shared across Claude and Codex. Use when work must pause, transfer, or resume between agents or sessions — new-game (set up a repo), save-state (pause without handoff), baton-pass (hand off on low tokens or ownership change), foresight (receive and verify), party-check (who owns it now), hindsight (audit claimed-vs-done), dragon-dance (record a workflow lesson). Invoke as /move, $move, or plain name; also on task lists, worktrees, multi-agent plans, or low context.
---

# Baton Pass

Purpose: preserve continuity between multiple agents with the least amount of text necessary.

This is a low-token workflow utility, not a documentation ceremony.

## Quick Setup

### Install on every agent (once per machine)

```bash
npx github:netheremp/baton-pass-netheremp install
```

Installs this skill into `~/.claude` and every `~/.codex*` home. Then:
- Claude Code (CLI + IDE) — skill auto-loads; `/new-game` `/save-state` `/baton-pass` `/foresight` `/dragon-dance` `/party-check` `/hindsight`
- Codex CLI — skill auto-loads; run it explicitly with `$baton-pass`
- Codex desktop app — skill auto-loads; `/prompts:baton-pass` in the composer

Alternatives: `/plugin marketplace add netheremp/baton-pass-netheremp` (Claude Code) or `/plugins` → install (Codex).

### Initialize a repo for multi-agent work

```bash
npx github:netheremp/baton-pass-netheremp init
```

Add `--track-state` to commit handoff state to git (teams that need shared history). Default is local-only (gitignored).

This creates:
- `baton-pass.config.json` — where the workflow finds your memory files
- `baton-pass.state.json` — lightweight shared ownership state
- `docs/agent-handoff.md` — repo-specific rules for all agents
- `docs/current-state.md` — what is happening right now
- `docs/next-task.md` — who owns the work and what comes next
- `docs/progress.md` — running session log (append-only)

`init` also drops the `/move` slash commands into the repo's `.claude/commands/`.

## The Move Set

- `new-game` = initialize the workflow in a fresh repo
- `save-state` = pause safely without handing off
- `baton-pass` = transfer work when tokens are low or ownership changes
- `foresight` = receive or resume work, verify alignment, then continue
- `dragon-dance` = improve the workflow only when a real lesson was learned
- `party-check` = inspect who last acted, who should act next, and the current repo state
- `hindsight` = audit the full baton chain — milestones claimed, verifications made, risks carried, items never resolved

## Core Rule

Default to delta, not recap.

Do not restate stable project history unless the receiver cannot continue safely without it.

## When To Use Each Move

### `new-game`

Use once at repo start, or when introducing this workflow into a repo that has no shared memory files yet.

### `save-state`

Use when:
- you must stop suddenly
- you are pausing work for later
- ownership is not changing yet

`save-state` is a local checkpoint, not a transfer.

### `baton-pass`

Use when:
- tokens are low
- another agent is taking over
- you need a transferable continuity package

`baton-pass` is a transfer checkpoint.

### `foresight`

Use when:
- receiving a baton
- returning after a save-state
- there is any doubt that the written state still matches the repo

### `dragon-dance`

Use only when:
- the workflow itself learned something
- the receiver found drift
- the baton omitted something important
- a new rule would clearly prevent repeated waste

Do not trigger `dragon-dance` by reflex.
Do not include it in every session or `baton-pass` by default.

### `party-check`

Use when:
- you forgot whose turn it is
- multiple agents share the repo
- you want the current status without paying for a full `foresight`

`party-check` is the in-session move. From a plain terminal (no agent, no tokens) run
`baton-pass status` — it prints the same ownership read plus the recent baton chain, and
`baton-pass status --json` gives machine-readable output for scripts and hooks.

### `hindsight`

Use when:
- a milestone or major feature is complete and you want a clean record
- something feels wrong and you need to trace what was actually claimed vs. done
- a new agent is joining and needs a full picture of the history, not just the last baton
- a `foresight` found severe drift and you need to understand how far back it started
- the project is being reviewed, handed to a human, or archived

Do not run `hindsight` after every baton.
It is an audit, not a routine checkpoint.

## What Each Move Should Write

### `save-state`

Minimal output:
- current task
- stopped at
- files touched
- next immediate action
- blocker or risk

### `baton-pass`

Minimal output:
- goal
- done
- tasks (if using a task plan — list each task with status: done / in-progress / pending)
- files
- worktree (branch name and worktree path if using git worktrees)
- verified
- deviations (decisions made mid-session that differ from the original plan)
- environment (prerequisites the next agent must confirm: services running, .env vars set, test DBs, etc.)
- next
- risks
- next agent

Commit discipline:
- Commit before handing off, or document why not.
- Never hand off a dirty working tree without naming the uncommitted state explicitly.
- If verification was not run, say so — do not imply it passed.

**Why tasks, worktree, deviations, and environment matter:**
Session memory is lost on handoff. If you are mid-way through a 20-task plan, the next agent cannot reconstruct which tasks are done from git log alone — write the status explicitly. If you are working inside a worktree, the next agent needs the exact path. If you fixed something differently than the plan said, write it down — the next agent will re-read the plan and redo it the wrong way. If the environment must be in a specific state (database running, .env populated), name it — a fresh agent will hit the same blocker without it.

### `foresight`

Minimal output:
- aligned or not
- if not aligned, what was stale or missing
- corrected next step only if needed

If drift is severe (baton claims work was done but the repo shows otherwise), write a structured drift report before continuing:
- what was claimed
- what the repo actually shows
- what must be redone
- whether this drift warrants a `dragon-dance`

### `dragon-dance`

Minimal output:
- problem
- impact
- improvement
- new convention

### `party-check`

Minimal output:
- state
- last move
- last agent
- next agent
- updated at
- short summary

### `hindsight`

Minimal output:
- audit scope (full chain or bounded range)
- baton chain table (from → to, date, goal summary)
- milestones claimed per agent with verification status
- verification gaps (claims made without evidence)
- risks carried forward across batons
- drift found across batons
- open items never resolved
- audit verdict: `clean`, `gaps found`, `risks unresolved`, or `action required`

Sources to check:
- `docs/progress.md` — full session log
- `docs/next-task.md` — Turn State history
- `baton-pass.state.json` — programmatic state
- git log — commit messages and dates
- any saved baton or save-state files referenced in progress

## Receive Procedure For `foresight`

Check only the minimum needed to avoid missteps:
- current user goal
- working tree status
- latest commit(s)
- `current-state`
- `next-task`
- latest `progress` entry
- files named in the saved state or baton
- task list status if a plan was in progress

Then decide:
- if aligned, continue
- if misaligned, correct the baton and continue
- if the misalignment reveals a reusable lesson, run `dragon-dance`

## Skill Discovery Across Agents

When skills are installed project-locally (into `.claude/commands/` or via plugin install to the repo), Codex and other agents that pick up the repo will find the same skill definitions. The skill files travel with the repo.

What skills do NOT carry across a session boundary:
- Task state from in-memory task managers (TaskCreate lists are lost when the session ends)
- Subagent execution state (which review loops completed, which agents ran)
- Environment state (what services are running, what .env vars are set)

The baton-pass must write all of this explicitly. Skills tell agents how to work; the baton tells them where things stand.

## State Model

Use the shared state file to track:
- current state
- last move
- last agent
- next agent
- updated time
- summary

Recommended states:
- `active`
- `paused`
- `handed-off`
- `claimed`
- `blocked`

## Verification Vocabulary

Use consistent language so receivers know exactly what was checked.

- `passed` — ran locally, output confirmed clean
- `passed outside sandbox` — ran locally but not in the CI/build environment
- `not run — [reason]` — skipped, state the reason
- `expected to pass, unverified` — not run, but believed correct

Never write `passed` when you mean `expected to pass, unverified`.
That single ambiguity causes the most handoff rework.

## Turn State

The Turn State block in `next-task` is the primary human-readable ownership signal.
`baton-pass.state.json` mirrors it for programmatic use.

When updating one, update both. If they ever disagree, `next-task` wins.

Recommended `state` values in both:
- `active` — someone is working now
- `paused` — stopped safely, same agent will resume
- `handed-off` — transferred, waiting for receiver to claim
- `claimed` — receiver has run `foresight` and is continuing
- `blocked` — cannot proceed, reason should be in `next-task`

## Anti-Patterns

Avoid:
- using `baton-pass` for every tiny checkpoint
- using `dragon-dance` when nothing was learned
- rewriting all memory files for trivial work
- turning `foresight` into a full repo audit every time
- running `hindsight` after every baton — it is an audit, not a routine step
- restating the whole project instead of the delta
- writing `passed` when you mean `expected to pass, unverified`
- handing off with a dirty working tree without naming the uncommitted state
- omitting task status when mid-way through a numbered plan
- omitting the worktree path when work is inside a git worktree
- omitting environment prerequisites that a fresh agent would not know

## Best Practical Flow

Pause:
- `save-state`
- later `foresight`

Transfer:
- `baton-pass`
- receiver runs `foresight`

Improve:
- `dragon-dance` only if `foresight` exposed a meaningful workflow issue

Check turn ownership:
- `party-check`

Audit the full chain:
- `hindsight`
- if gaps or unresolved risks are found, run `dragon-dance`
