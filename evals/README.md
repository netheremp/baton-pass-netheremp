# evals/

Reusable eval material for the `baton-pass` skill. Not shipped in the npm package.

## `trigger-eval.json`

18 realistic queries for checking that the skill's `description:` (in
`skills/baton-pass/SKILL.md`) triggers when it should and stays quiet when it shouldn't:

- **9 should-trigger** — running low on context and needing a handoff note, resuming after
  time away and verifying the notes match the repo, "whose turn is it", auditing what each
  agent delivered across handoffs, setting up handoff files, saving mid-task progress,
  recording a workflow lesson, commit + hand off frontend→API, resuming from a save-state.
- **9 should-NOT-trigger** (near-misses that share vocabulary) — build a rate limiter,
  review a PR, walk through a dirty `git diff`, write a standup, debug a CI deploy, hand a
  *document* to the design team, `git worktree add`, "is the deploy live yet", document a
  *different* multi-agent pipeline.

Each item: `{ "query": "...", "should_trigger": true | false }`.

## Running the description optimizer

Uses the bundled `skill-creator` script (Python 3.10+, `claude` CLI on PATH, ~100+ `claude -p`
calls of usage). Run it from a **plain terminal** (not nested in a Claude Code session) and
from **this repo directory** so it resolves a real project root:

```bash
cd <this repo>
mkdir -p .claude                 # gives the harness a project root to latch onto
PYTHONPATH="<path to skill-creator>" python3.12 -m scripts.run_loop \
  --eval-set evals/trigger-eval.json \
  --skill-path skills/baton-pass \
  --model <your session's model id> \
  --max-iterations 5 --verbose
rmdir .claude 2>/dev/null
```

Sanity check: iteration 1's `Train:` line should show a non-zero recall for the **current**
description. If it's `recall=0%`, the triggering measurement isn't working in that environment
— stop and don't apply any proposed change.

`claude plugin eval baton-pass-netheremp` is the first-class alternative once it's out of early
access.
