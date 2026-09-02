Run the baton-pass `baton-pass` move.

Write a transfer package so the next agent can pick up exactly where this one left off.
Use this when tokens are low or ownership is changing.

Steps:
1. Read `baton-pass.config.json` to find the correct file paths.
2. Commit any staged work before writing the baton. If you cannot commit, name the uncommitted state explicitly in the baton — never hand off a dirty tree silently.
3. Append a new baton entry to `docs/progress.md` using the baton-pass template.
4. Update `docs/next-task.md` Turn State block:
   - State: handed-off
   - Last Move: baton-pass
   - Last Agent: (your agent name)
   - Next Agent: $ARGUMENTS (or "unassigned" if not specified)
   - Updated At: (today's date)
5. Update `baton-pass.state.json` to mirror the Turn State block.
6. Write only:
   - goal
   - done (what was completed this session)
   - files (touched or created)
   - verified (use exact vocabulary: `passed` / `passed outside sandbox` / `not run — [reason]` / `expected to pass, unverified`)
   - next (the immediate next action for the receiver)
   - risks
   - next agent

Never write `passed` when you mean `expected to pass, unverified`.
Do not restate full project history. Write only the delta.

Arguments: $ARGUMENTS
