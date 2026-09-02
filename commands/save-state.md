Run the baton-pass `save-state` move.

Write a minimal checkpoint so this agent can safely pause and resume later.
Ownership does not change. No transfer is happening.

Steps:
1. Read `baton-pass.config.json` to find the correct file paths.
2. Append a new save-state entry to `docs/progress.md` using the save-state template.
3. Update `docs/next-task.md` Turn State block:
   - State: paused
   - Last Move: save-state
   - Last Agent: (your agent name or "claude" if not specified)
   - Next Agent: (same agent — ownership is not transferring)
   - Updated At: (today's date)
4. Update `baton-pass.state.json` to mirror the Turn State block.
5. Keep output minimal. Write only:
   - current task
   - stopped at
   - files touched
   - next immediate action
   - blocker or risk (if any)

Do not restate project history. Write only the delta needed to resume.

Arguments: $ARGUMENTS
