Run the baton-pass `new-game` move.

Bootstrap the minimum shared memory and state files so multi-agent work can begin safely.

Steps:
1. Check whether `baton-pass.config.json` already exists. If it does and `--force` was not passed, stop and tell the user.
2. Ask the user whether Baton Pass state should be tracked in git or kept local-only.
   - Recommend local-only unless the team explicitly wants handoff state in GitHub.
   - If the user chooses tracked state, do not add `baton-pass.config.json`, `baton-pass.state.json`, or `docs/` to `.gitignore`.
   - If the user chooses local-only, add those state files to `.gitignore`.
3. Copy or create the following files using the baton-pass skill templates:
   - `baton-pass.config.json`
   - `baton-pass.state.json`
   - `docs/agent-handoff.md`
   - `docs/current-state.md`
   - `docs/next-task.md`
   - `docs/progress.md`
4. Add a Baton Pass block to `.gitignore`.
   Always include local generated noise:
   - `.claude/settings.local.json`
   - `.npm-cache/`
   - `.tmp-*/`
   Include these only if the user chose local-only state:
   - `baton-pass.config.json`
   - `baton-pass.state.json`
   - `docs/`
5. Do not overwrite any file that already exists unless the user explicitly passed `--force`.
6. After creating the files, tell the user what was written and what to do next:
   - Review `baton-pass.config.json` and adjust paths if needed
   - Review the Baton Pass block added to `.gitignore`
   - Confirm whether state is local-only or tracked
   - Fill in `docs/current-state.md` and `docs/next-task.md`
   - Customize `docs/agent-handoff.md` with repo-specific rules
   - Start appending sessions to `docs/progress.md`

Arguments: $ARGUMENTS
