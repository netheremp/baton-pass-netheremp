# 🏃 baton-pass-netheremp

[![CI](https://github.com/netheremp/baton-pass-netheremp/actions/workflows/ci.yml/badge.svg)](https://github.com/netheremp/baton-pass-netheremp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/baton-pass-netheremp)](https://www.npmjs.com/package/baton-pass-netheremp)
[![license](https://img.shields.io/npm/l/baton-pass-netheremp)](./LICENSE)

> **A low-token handoff workflow for multi-agent repos.**
> When one AI runs out of context, the next one picks up exactly where it left off — no recap, no drift, no duplicated work.

Built for teams running **Claude + Codex** (or any two agents) on the same repo. Published to
npm, the Claude Code plugin marketplace, and the OpenAI plugin directory.

> **Attribution.** This is a derivative of [`francisN21/baton-pass`](https://github.com/francisN21/baton-pass),
> used under the MIT License. Changes in this copy:
> - Fixed the Claude Code plugin manifest (`.claude-plugin/plugin.json`) so it installs
>   (`commands` / `skills` were not in the schema-required form).
> - Moved the plugin skill to `skills/baton-pass/SKILL.md` so Claude Code registers it.
> - Renamed the plugin and marketplace to `baton-pass-netheremp`.
> - Added cross-agent install (`baton-pass install`) and a `.codex-plugin/` manifest so the one
>   skill works on Claude Code and Codex, CLI and app.
>
> See [`CHANGELOG.md`](./CHANGELOG.md) and the original project for full history.

---

## The Move Set

```
new-game     ──  bootstrap the workflow in a fresh repo
save-state   ──  pause safely, ownership stays with you
baton-pass   ──  transfer when tokens are low or ownership changes
foresight    ──  receive or resume, verify alignment before acting
dragon-dance ──  record a real workflow lesson (conditional, not automatic)
party-check  ──  see who owns the work right now
hindsight    ──  audit the full baton chain — milestones, verifications, risks, open items
```

---

## Why This Exists

Context windows end. Agents forget. Handoffs fail silently.

The usual result: the next agent restates everything from scratch, misses a decision that was made two sessions ago, or picks up stale assumptions from docs that haven't been updated since Tuesday.

`baton-pass` fixes that with one core idea — **write only the delta, not the recap.**

---

## The Three Rules That Matter Most

### 1. Default to delta, not recap
Do not restate stable project history unless the receiver genuinely cannot continue without it.
A good baton is smaller than a project summary.

### 2. Commit before you hand off
Never transfer a dirty working tree without naming the uncommitted state explicitly.
A dirty tree at handoff means the receiver does not know what is real.

### 3. Be honest about what was verified
Use these exact terms — nothing more, nothing less:

| Term | Meaning |
|---|---|
| `passed` | ran locally, output confirmed clean |
| `passed outside sandbox` | ran locally, not in CI/build environment |
| `not run — [reason]` | skipped, state the reason |
| `expected to pass, unverified` | not run, believed correct |

> **Never write `passed` when you mean `expected to pass, unverified`.**
> That single ambiguity causes more handoff rework than anything else.

---

## How Each Move Works

### 🎮 `new-game`
**Use once, at repo start.**

Bootstraps the minimum shared memory so multi-agent work can begin safely.

Creates:
```
baton-pass.config.json
baton-pass.state.json
docs/agent-handoff.md
docs/current-state.md
docs/next-task.md
docs/progress.md
```

---

### 💾 `save-state`
**Use when you must stop but ownership isn't changing.**

Write the minimum needed for future-you to resume:
- current task
- stopped at
- files touched
- next immediate action
- blocker or risk

---

### 🏃 `baton-pass`
**Use when tokens are low or the next agent takes over.**

Write only:
- goal
- done
- tasks *(if mid-plan — list each task with status: done / in-progress / pending)*
- files changed
- worktree *(branch + path if using git worktrees)*
- verified *(honest — use the vocabulary above)*
- deviations *(mid-session decisions that differ from the original plan)*
- environment *(prerequisites a fresh agent needs: services running, .env vars, test DBs)*
- next task
- risks
- next agent

Commit first. If you cannot commit, name the uncommitted state in the baton.

> **Why tasks, worktree, deviations, and environment?**
> Session memory is lost on handoff. A fresh agent cannot reconstruct which of 21 tasks are done from git log, doesn't know which worktree you were in, will re-read the plan and redo decisions you already made, and will hit the same "service not running" blocker without environment facts. Write these explicitly.

---

### 🔮 `foresight`
**Use when receiving a baton or returning after a pause.**

Check before you touch anything:
```
→ current user goal
→ working tree status
→ latest commit(s)
→ current-state
→ next-task
→ latest progress entry
→ files named in the baton
```

Then:
```
aligned     →  continue
misaligned  →  correct docs first, then continue
              if the drift reveals a reusable lesson → run dragon-dance
```

---

### 🐉 `dragon-dance`
**Use only when a real workflow lesson appeared.**

Good triggers:
- the baton was stale or incomplete
- a verification claim was misleading
- the receiver had to re-audit too much
- the same workflow mistake could repeat

If nothing was learned — **skip it entirely.** Dragon dance is not a ceremony.
It is a repair.

---

### 🎉 `party-check`
**Use when you need to know who owns the work right now.**

Reads from `baton-pass.state.json` and the Turn State block in `next-task`.
Cheap. No full audit needed.

---

### 🔍 `hindsight`
**Use when you need a full audit of what actually happened across the chain.**

Good triggers:
- a milestone is complete and you want a clean record
- something feels wrong and you need to trace the source
- a new agent is joining and needs the full picture, not just the last baton
- a `foresight` found severe drift and you need to know how far back it started
- the project is being reviewed, handed to a human, or archived

What it produces:
- baton chain table (who passed to whom, when, and why)
- milestones claimed per agent with honest verification status
- verification gaps (claims made without supporting evidence)
- risks carried forward without resolution
- drift that accumulated across batons
- open items that were never closed
- verdict: `clean`, `gaps found`, `risks unresolved`, or `action required`

**Do not run `hindsight` after every baton.** It is an audit, not a routine step.

---

## Turn State

Every `next-task` file carries a **Turn State block** at the very top.
It's the first thing you read. It tells you who owns the work before you open anything else.

```md
## Turn State
- State:       handed-off
- Last Move:   baton-pass
- Last Agent:  codex
- Next Agent:  claude
- Updated At:  2026-04-17
```

`baton-pass.state.json` mirrors this for programmatic use.
When you update one, update both. If they disagree, **`next-task` wins.**

Recommended state values:

| State | Meaning |
|---|---|
| `active` | someone is working right now |
| `paused` | stopped safely, same agent will resume |
| `handed-off` | transferred, waiting for receiver to claim |
| `claimed` | receiver ran `foresight` and is continuing |
| `blocked` | cannot proceed — reason is in `next-task` |

### `baton-pass status`

A mechanical readout from the terminal — no agent needed. Reads `baton-pass.state.json`,
cross-checks it against the `next-task` Turn State, and shows the recent chain from `progress`:

```text
$ baton-pass status

Baton Pass — status
────────────────────────────────────────
  state:       handed-off
  last move:   baton-pass
  last agent:  codex
  next agent:  claude
  updated:     2026-09-04
  summary:     CSP + trusted-origin done; deploy next.

Recent chain (progress log)
────────────────────────────────────────
  Session 002    2026-09-04  codex -> claude
                 Add trusted-origin protection and CSP before deploy
```

`baton-pass status --json` emits the same data as JSON for scripts and other agents.
(The `party-check` move is the agent-driven version that *interprets* this.)

---

## Recommended Flows

See [`examples/multi-agent-chain.md`](./examples/multi-agent-chain.md) for a full narrated
Claude → Codex → Claude chain showing every move in context.

**Normal pause/resume:**
```
save-state  →  foresight  →  continue
```

**Low-token transfer:**
```
baton-pass  →  foresight  →  continue
```

**Drift found on receive:**
```
foresight  →  correct docs  →  dragon-dance (if lesson)  →  continue
```

**Ownership check:**
```
party-check
```

**Full chain audit:**
```
hindsight  →  dragon-dance (if gaps or unresolved risks found)
```

---

## Anti-Patterns

```
✗  using baton-pass for every tiny checkpoint
✗  running dragon-dance when nothing was learned
✗  running hindsight after every baton — it is an audit, not a routine step
✗  rewriting all memory files for trivial work
✗  turning foresight into a full repo audit every time
✗  writing "passed" when you mean "expected to pass, unverified"
✗  handing off with a dirty tree without naming the uncommitted state
✗  omitting task status when mid-way through a numbered plan
✗  omitting the worktree path when work is inside a git worktree
✗  omitting environment prerequisites that a fresh agent would not know
```

---

## Install

One command — works on Claude and Codex, CLI and app:

```bash
npx github:netheremp/baton-pass-netheremp install
```

`npx` runs the tool straight from GitHub: no clone, nothing installed permanently. It copies the
`baton-pass` skill into `~/.claude` and every `~/.codex*` home and reports what it wrote (existing
files are skipped; pass `--force` to overwrite).

| Surface | What lands | How to invoke |
|---|---|---|
| Claude Code (CLI + IDE) | skill + `/move` commands under `~/.claude` | skill auto-loads; `/new-game` … `/hindsight` |
| Codex CLI (every home) | skill under `$CODEX_HOME/skills` | skill auto-loads; `$baton-pass` |
| Codex desktop app | skill + `~/.codex/prompts/*.md` | skill auto-loads; `/prompts:baton-pass` |

> The Codex **CLI** (0.152–0.153) has no file-prompt loader, so `$baton-pass` (or letting the skill
> auto-trigger) is its entry point. The `/prompts:` menu is a Codex **desktop-app** feature.

### From a clone

```bash
git clone https://github.com/netheremp/baton-pass-netheremp
sh baton-pass-netheremp/scripts/install.sh        # Windows: pwsh baton-pass-netheremp/scripts/install.ps1
```

Flags (pass through either the `npx` or the script form):

```
--link                symlink the skill dir instead of copying — `git pull` then updates every surface
--claude | --codex    restrict to one platform (default: both, auto-detected)
--claude-home <dir>   use an explicit Claude home (repeatable)
--codex-home <dir>    use an explicit Codex home (repeatable; $CODEX_HOME is picked up)
--skill-only          skip the slash commands / app prompts, install the skill only
--force               overwrite existing files
```

### Claude Code plugin (per repo)

```text
/plugin marketplace add netheremp/baton-pass-netheremp
/plugin install baton-pass-netheremp@baton-pass-netheremp
```

From a terminal, or from a local clone:

```bash
claude plugin marketplace add https://github.com/netheremp/baton-pass-netheremp
claude plugin marketplace add /path/to/baton-pass-netheremp        # local clone
claude plugin install baton-pass-netheremp@baton-pass-netheremp
```

### Codex plugin / OpenAI marketplace

`.codex-plugin/plugin.json` makes the workflow installable through Codex `/plugins` and ready to
submit to the OpenAI universal plugin directory (shared by ChatGPT and Codex). For local testing,
add this repo as a local marketplace and install from it.

## Install Project Files

Use this path when you want to add the shared handoff files and `.claude/commands/` into a repo.

```bash
npx github:netheremp/baton-pass-netheremp init     # or, from a clone: node ./bin/baton-pass.js init
```

This installs the shared memory files, Claude Code slash commands, and a `.gitignore` block for Baton Pass local files into your project.

By default it keeps Baton Pass state local-only so GitHub does not fill up with routine handoff churn. Use `--track-state` when a team wants the handoff state committed and shared through git.

---

### What gets installed

**Shared memory files** (created in your repo):
```
baton-pass.config.json
baton-pass.state.json
docs/agent-handoff.md
docs/current-state.md
docs/next-task.md
docs/progress.md
```

**Claude Code slash commands** (in `.claude/commands/`):
```
/new-game
/save-state
/baton-pass
/foresight
/dragon-dance
/party-check
/hindsight
```

**Local files ignored by `.gitignore`:**
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

If you run init with `--track-state`, the local state section is omitted so the shared memory files can be committed.

Each command tells Claude exactly what to do for that move — no copy-pasting instructions.

---

### Options

```bash
node ./bin/baton-pass.js install                # user-level: skill for Claude + Codex, CLI + app
node ./bin/baton-pass.js init [target-dir]      # repo: memory files + Claude commands
node ./bin/baton-pass.js init --track-state     # leave state files trackable in git
node ./bin/baton-pass.js status [dir] [--json]  # show Turn State + recent baton chain
node ./bin/baton-pass.js commands [target-dir]  # install only slash commands
node ./bin/baton-pass.js init --force           # overwrite existing files
node ./bin/baton-pass.js help
```

---

### After init

1. Adjust `baton-pass.config.json` if your repo uses different file paths.
2. Fill in `docs/current-state.md` and `docs/next-task.md`.
3. Review the Baton Pass block in `.gitignore`; remove the local state lines only if you want git-tracked handoff history.
4. Add repo-specific rules to `docs/agent-handoff.md`. Keep the portable skill generic — project rules stay local.

---

### Manual install (no CLI)

```bash
# Bash
./scripts/new-game.sh

# PowerShell
./scripts/new-game.ps1
```

Or follow the step-by-step path in [INIT.md](./INIT.md).

---

## Repository Layout

```
baton-pass-netheremp/
├── package.json
├── README.md
├── INIT.md
├── LICENSE
├── PRIVACY.md
├── CONTRIBUTING.md
├── CHANGELOG.md
├── .github/workflows/    ← CI (manifests + tests) and tag → npm publish
├── .claude-plugin/
│   ├── plugin.json        ← Claude Code plugin manifest
│   └── marketplace.json   ← single-plugin marketplace pointing at this repo
├── .codex-plugin/
│   ├── plugin.json        ← Codex / OpenAI plugin manifest (points at skills/)
│   └── assets/ · assets/  ← plugin icon + logo
├── bin/
│   └── baton-pass.js      ← install (user-level) + init / status / commands (per-repo)
├── test/
│   └── cli.test.js        ← node --test smoke suite
├── skills/
│   └── baton-pass/
│       └── SKILL.md        ← the skill — single source of truth for Claude + Codex
├── scripts/
│   ├── check-manifests.js ← repo consistency check (run in CI)
│   ├── install.sh         ← wrapper for `baton-pass install`
│   ├── install.ps1
│   ├── new-game.ps1
│   ├── new-game.sh
│   ├── init-baton-pass.ps1
│   └── init-baton-pass.sh
├── commands/
│   ├── new-game.md
│   ├── save-state.md
│   ├── baton-pass.md
│   ├── foresight.md
│   ├── dragon-dance.md
│   ├── party-check.md
│   └── hindsight.md
├── examples/
│   ├── example-baton-pass.md    ← one completed baton
│   └── multi-agent-chain.md     ← a full Claude → Codex → Claude chain, narrated
└── templates/
    ├── agent-handoff.template.md
    ├── baton-pass.config.template.json
    ├── baton-pass.state.template.json
    ├── baton-pass.template.md
    ├── current-state.template.md
    ├── next-task.template.md
    ├── progress-log.template.md
    ├── progress-session.template.md
    ├── save-state.template.md
    ├── foresight.template.md
    ├── dragon-dance.template.md
    ├── party-check.template.md
    └── hindsight.template.md
```

---

## License

[MIT](./LICENSE) — original work © francisN21, modifications © netheremp. Use it, adapt it, share it.

## Privacy

No data collection, no network, no accounts — see [PRIVACY.md](./PRIVACY.md).
