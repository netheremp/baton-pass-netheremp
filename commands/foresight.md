Run the baton-pass `foresight` move.

Verify alignment between the written state and the actual repo before touching anything.
Use this when receiving a baton, returning after a save-state, or whenever drift is possible.

Steps:
1. Read `baton-pass.config.json` to find the correct file paths.
2. Check the minimum needed to avoid missteps:
   - current user goal (from `docs/next-task.md` Turn State and task description)
   - working tree status (`git status`)
   - latest commit(s) (`git log --oneline -5`)
   - `docs/current-state.md`
   - `docs/next-task.md`
   - latest entry in `docs/progress.md`
   - any files named in the saved state or baton
3. Decide:
   - **aligned** → state so clearly, then continue with the next task
   - **misaligned** → correct `docs/next-task.md` and `docs/current-state.md` first, then continue
   - **misaligned + reusable lesson** → correct docs, then run `dragon-dance`
4. Update `baton-pass.state.json` state to `claimed`.
5. Output only:
   - aligned or not
   - if not aligned: what was stale or missing and what you corrected
   - corrected next step (only if the written one was wrong)

Do not turn this into a full repo audit. Check only what is needed to act safely.

Arguments: $ARGUMENTS
