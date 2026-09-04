---
description: Show current work-ownership state quickly, no full audit
---

Run the baton-pass `party-check` move.

Show the current ownership state quickly. No full audit needed.

Steps:
1. Read `baton-pass.config.json` to find the correct file paths.
2. Read `baton-pass.state.json` and the Turn State block at the top of `docs/next-task.md`.
3. If they disagree, `docs/next-task.md` wins — note the discrepancy.
4. Output only:
   - state (active / paused / handed-off / claimed / blocked)
   - last move
   - last agent
   - next agent
   - updated at
   - one-line summary of where things stand

Nothing else. This is a cheap status read, not a foresight.

`party-check` is the in-session move — an agent runs it and composes the summary line.
Outside a session, `baton-pass status` prints the same ownership read from a plain terminal
(no agent, no tokens) and also shows the recent baton chain; `baton-pass status --json` for scripts.

Arguments: $ARGUMENTS
