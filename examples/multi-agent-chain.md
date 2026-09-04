# Example: a full Claude → Codex → Claude chain

A worked walkthrough of one small feature — *add token-bucket rate limiting to the
public API* — carried across four sessions and two agents. Shows every move in
context and what each one writes. Files are abbreviated to the parts that matter.

---

## Session 1 — Claude: `new-game`, then `save-state`

Fresh repo, no handoff system yet.

```
> /new-game
```

Creates `baton-pass.config.json`, `baton-pass.state.json`, `docs/{agent-handoff,current-state,next-task,progress}.md`,
and a `.gitignore` block. Claude then starts the work, gets an hour in, and has to stop.

```
> /save-state
```

**`baton-pass.state.json`**
```json
{ "state": "paused", "lastMove": "save-state", "lastAgent": "claude",
  "nextAgent": "claude", "updatedAt": "2026-09-04", "summary": "Rate-limit middleware drafted, not wired." }
```

**`docs/next-task.md` → Turn State**
```md
## Turn State
- State: paused
- Last Move: save-state
- Last Agent: claude
- Next Agent: claude
- Updated At: 2026-09-04
```

**`docs/progress.md`** (append-only)
```md
### Session 001
Date: 2026-09-04
Agent: claude
Branch: feat/rate-limit
Commit(s): 3a1f9c2
Goal: Add token-bucket rate limiting to the public API
State: paused
Next Agent: claude

#### Completed
- Drafted `src/middleware/rateLimit.js` (bucket refill logic, in-memory store).

#### Files Changed
- src/middleware/rateLimit.js

#### Verification
- unit: not run — middleware not wired yet

#### Next Recommended Task
- Wire the middleware into `src/app.js`, add config for limits, write tests.
```

`save-state` is a checkpoint, not a transfer — `Next Agent` stays `claude`.

---

## Session 2 — Claude: `foresight`, work, then `baton-pass` (tokens low)

```
> /foresight
```

Checks working tree, latest commit, `current-state`, `next-task`, latest `progress` entry.
Everything lines up → **aligned, continue.** Claude wires the middleware, adds `RATE_LIMIT_*`
config, and gets partway through tests before context runs low.

```
> /baton-pass codex
```

**`baton-pass.state.json`**
```json
{ "state": "handed-off", "lastMove": "baton-pass", "lastAgent": "claude",
  "nextAgent": "codex", "updatedAt": "2026-09-04", "summary": "Middleware wired + config, 3/8 tests written." }
```

**`docs/progress.md`**
```md
### Session 002
Date: 2026-09-04
Agent: claude
Branch: feat/rate-limit
Commit(s): 7d4e0b1
Goal: (cont.) wire middleware, add config, tests
State: handed-off
Next Agent: codex

#### Completed
- Wired `rateLimit` into `src/app.js` before the router.
- Added `RATE_LIMIT_RPM` / `RATE_LIMIT_BURST` to `src/config.js` and `.env.example`.
- Wrote 3 of 8 planned tests in `test/rateLimit.test.js`.

#### Files Changed
- src/app.js, src/config.js, .env.example, test/rateLimit.test.js

#### Verification
- unit: passed (3 tests) — `npm test -- rateLimit`
- lint: passed

#### Deviations
- Used a Map keyed by client IP for the store; the plan said "Redis-ready" but Redis
  isn't set up in this repo. Interface is swappable — a `RateStore` shape — so a Redis
  impl can drop in later.

#### Environment
- Node 20. `.env` needs `RATE_LIMIT_RPM` set or the middleware falls back to 60.

#### Next Recommended Task
- Finish tests 4–8: burst exhaustion, refill over time, per-IP isolation, 429 body shape,
  disabled via env. Then run the full suite.

#### Notes for Next Agent
- Commit `7d4e0b1` is clean. `RateStore` interface is at the top of `rateLimit.js`.
```

Note the **Deviations** and **Environment** blocks — the receiver can't reconstruct those
from `git log`.

---

## Session 3 — Codex: `foresight`, drift found → `dragon-dance`, then `baton-pass` back

```
$ baton-pass status
```
```text
Baton Pass — status
────────────────────────────────────────
  state:       handed-off
  last move:   baton-pass
  last agent:  claude
  next agent:  codex
  updated:     2026-09-04
  summary:     Middleware wired + config, 3/8 tests written.
```

```
$baton-pass   →   run the foresight move
```

Codex checks the baton against the repo and finds **drift**: the baton says "3 of 8 tests
written," but `test/rateLimit.test.js` only has **2** that actually assert — the third is a
stub with a `TODO`. Codex writes a short drift note in its `foresight` output, fixes the
count, finishes tests 3–8, and runs the suite.

Because the miscount would keep happening ("N of M tests" claimed from memory, not counted),
Codex runs:

```
$baton-pass   →   run the dragon-dance move
```

**`docs/agent-handoff.md`** gains a rule:
```md
- Test progress in a baton is "N passing" (from a real run), never "N written".
  A stub with a TODO does not count.
```

Then hands back:

```
$baton-pass   →   run the baton-pass move, next agent: claude
```

**`baton-pass.state.json`**
```json
{ "state": "handed-off", "lastMove": "baton-pass", "lastAgent": "codex",
  "nextAgent": "claude", "updatedAt": "2026-09-04", "summary": "All 8 tests passing; dragon-dance recorded. Ready to merge." }
```

**`docs/progress.md`**
```md
### Session 003
Date: 2026-09-04
Agent: codex
Branch: feat/rate-limit
Commit(s): b90c7ee
Goal: Finish tests, run suite
State: handed-off
Next Agent: claude

#### Completed
- Finished tests 3–8. Full suite: 8 passing.
- `dragon-dance`: added a "count, don't claim" rule for test progress to agent-handoff.md.

#### Files Changed
- test/rateLimit.test.js, docs/agent-handoff.md

#### Verification
- unit: passed (8 tests) — `npm test`
- lint: passed
- build: passed outside sandbox

#### Handoff Reality Check
- Baton said "3 of 8 written"; repo had 2 asserting + 1 TODO stub. Reconciled before continuing.

#### Next Recommended Task
- Review the diff, squash if desired, open the PR.
```

---

## Session 4 — Claude: `foresight`, `party-check`, finish, `hindsight`

```
> /foresight
```
Aligned — 8 tests pass, tree is clean at `b90c7ee`. Claude opens the PR. Mid-review it forgets
whose turn it is:

```
> /party-check
```
```text
- State:      handed-off
- Last Move:  baton-pass
- Last Agent: codex
- Next Agent: claude
- Updated At: 2026-09-04
- Summary:    All 8 tests passing; dragon-dance recorded. Ready to merge.
```

Claude finishes, merges, and — because this is a completed milestone — runs the audit:

```
> /hindsight
```

**Audit output (abbreviated)**
```md
## Hindsight — feat/rate-limit

Baton chain
| # | from → to      | date       | goal                                   |
|---|----------------|------------|----------------------------------------|
| 1 | claude (pause) | 2026-09-04 | draft rate-limit middleware            |
| 2 | claude → codex | 2026-09-04 | wire + config + tests                  |
| 3 | codex → claude | 2026-09-04 | finish tests, run suite                |

Milestones claimed vs verified
- middleware wired ................ verified (app.js diff + 8 passing tests)
- config + .env.example .......... verified
- 8 tests passing ................ verified (`npm test`, session 3 + re-run session 4)

Verification gaps
- none open.

Drift found
- Session 3: "3 of 8 written" was 2 asserting + 1 stub. Reconciled; `dragon-dance` recorded.

Risks carried forward
- In-memory `RateStore` (per-process). Fine for one node; note for when the API scales out.
  Interface is swappable.

Open items
- none.

Verdict: clean.
```

---

## What this chain shows

- `save-state` vs `baton-pass`: pause keeps `Next Agent` the same; transfer changes it.
- The baton carries what `git log` can't — **task status, deviations, environment**.
- `foresight` on *every* receive caught a real miscount.
- `dragon-dance` fired **once**, for a lesson that would otherwise repeat — not per baton.
- `hindsight` ran **once**, at the milestone — not after every step.
- `baton-pass status` is the cheap terminal check between the heavier moves.
