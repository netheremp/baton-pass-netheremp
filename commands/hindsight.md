Run the baton-pass `hindsight` move.

Audit the full chain of baton passes — what was claimed, what was verified,
what risks were carried forward, and what was never resolved.

Use this when:
- a milestone is complete and you want a clean record
- something feels wrong and you need to trace the source
- a new agent is joining and needs the full history, not just the last baton
- a `foresight` found severe drift and you need to know how far back it started
- the project is being reviewed, handed to a human, or archived

Do not run this after every baton. It is an audit, not a routine step.

Scope: $ARGUMENTS (default: full chain if not specified)

Steps:
1. Read `baton-pass.config.json` to find the correct file paths.
2. Gather sources:
   - `docs/progress.md` — full session and baton log
   - `docs/next-task.md` — Turn State history
   - `baton-pass.state.json` — programmatic state
   - `git log --oneline` — commit timeline
3. Build the audit. For each baton in the chain, record:
   - who passed to whom, when, and the goal summary
   - milestones the passing agent claimed as done
   - verification status for each claim (use exact vocabulary: `passed` / `passed outside sandbox` / `not run — [reason]` / `expected to pass, unverified` / `not stated`)
4. Flag:
   - **verification gaps** — claims made without supporting evidence, or `passed` that cannot be confirmed
   - **risks carried forward** — risks that appeared in one baton and were passed without resolution
   - **drift** — state that was written but did not match reality, and whether it was corrected
   - **open items** — tasks or blockers that appeared but were never closed
5. Deliver an audit verdict:
   - `clean` — chain is consistent, verifications are honest, no open items
   - `gaps found` — list what needs attention
   - `risks unresolved` — list them
   - `action required` — state what must happen before continuing

If the audit surfaces a reusable lesson, run `dragon-dance` after.
