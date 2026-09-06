---
description: Verify alignment between the written state and the actual repo before acting
---

Run the baton-pass `foresight` move.

Verify alignment between the written state and the actual repo before touching anything.
Use this when receiving a baton, returning after a save-state, or whenever drift is possible.

Steps:
1. Read `baton-pass.config.json` to find the correct file paths.
2. Check the minimum needed to avoid missteps:
   - current user goal (from `docs/next-task.md` Turn State and task description)
   - working tree status (`git status --short`)
   - latest commit(s) (`git log --oneline -5`)
   - `docs/current-state.md`
   - `docs/next-task.md`
   - latest relevant entry in `docs/progress.md`, only if needed beyond current state
   - relevant portions of files named in the saved state or baton
3. Decide:
   - **aligned** → state so clearly, then continue with the next task
   - **misaligned** → correct `docs/next-task.md` and `docs/current-state.md` first, then continue
   - **misaligned + reusable lesson** → correct docs, then run `dragon-dance`
4. Update `baton-pass.state.json` state to `claimed`.
5. Output only:
   - aligned or not
   - if not aligned: what was stale or missing and what you corrected
   - corrected next step (only if the written one was wrong)

Stay delta-only: no routine full repo audit, full history read, or full-spec reread.
Deepen inspection only for detected drift, contradiction, or missing context. Use bounded
history excerpts; full history belongs to `hindsight`, forensics, severe drift, or an explicit audit.
Prefer Git status/stat/path summaries, then targeted diffs for relevant files/ranges; avoid
unrestricted `git diff`. Never narrow authoritative machine-side path or validator checks.

Arguments: $ARGUMENTS
