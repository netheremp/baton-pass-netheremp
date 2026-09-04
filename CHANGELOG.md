# Changelog

## Fork — baton-pass-netheremp - 2026-09-02

Forked from [francisN21/baton-pass](https://github.com/francisN21/baton-pass) @ 0.6.9 (MIT).

- Fixed `.claude-plugin/plugin.json`: `commands` was a bare string and `skills` entries
  lacked the `./` prefix, so `/plugin install` failed with a manifest validation error.
  Now `"commands": ["./commands"]` and `"skills": ["./skills/baton-pass"]`.
- Moved the plugin skill from `skills/SKILL.md` to `skills/baton-pass/SKILL.md` so Claude
  Code's skill discovery registers it.
- Set `marketplace.json` plugin `source` to `"./"` (was an `npm` source pointing at the
  upstream package) so the marketplace installs this repo.
- Renamed plugin + marketplace to `baton-pass-netheremp`; updated homepage/repository URLs,
  `package.json` name, and install instructions in README.md and SKILL.md.
- Added attribution to LICENSE (original © francisN21, modifications © netheremp).

## 0.7.2 - 2026-09-04

- Added a plugin icon and logo (`assets/icon.png`, `assets/logo.png`) — a two-hands relay
  handoff of a banana on a teal tile — wired into `.codex-plugin/plugin.json`
  (`interface.composerIcon` / `logo` / `brandColor "#0D5257"`). `interface.capabilities` is now
  `["Read", "Write"]`. `package.json` ships `assets/`. No code or skill changes.

## 0.7.1 - 2026-09-03

- `package.json`: `bin` value is now `bin/baton-pass.js` (was `./bin/baton-pass.js`) — npm 11
  rejects the `./` prefix and strips the `bin` entry on publish, which would have removed the
  `baton-pass` command from the published package. `repository.url` normalized to `git+https://…`.
  No code changes; `v0.7.0` shipped as a GitHub release only.

## 0.7.0 - 2026-09-03

- Cross-agent install: `baton-pass install` (also `sh scripts/install.sh` / `pwsh scripts/install.ps1`)
  puts the `baton-pass` skill into `~/.claude` and every `~/.codex*` home in one step.
  Auto-detects targets; `--claude` / `--codex` / `--claude-home` / `--codex-home` scope it,
  `--link` symlinks the skill dir (so `git pull` updates every surface), `--skill-only` skips
  the slash commands / app prompts, `--force` overwrites. The installer only ever copies files
  or replaces its own symlink — it never recursively deletes a directory.
- The skill is now the single source of truth for all four surfaces: Claude Code (CLI + IDE)
  gets the skill + `/move` commands, Codex CLI gets the skill (`$baton-pass`), the Codex desktop
  app gets the skill + `~/.codex/prompts/*.md` (`/prompts:baton-pass`). Note: the Codex **CLI**
  has no file-prompt loader at 0.152–0.153, so `$baton-pass` / auto-trigger is its entry point.
- Added `.codex-plugin/plugin.json` (mirrors `.claude-plugin/plugin.json`, `"skills": "./skills/"`)
  so the workflow can be installed via Codex `/plugins` and submitted to the OpenAI universal
  plugin directory.
- `skills/baton-pass/SKILL.md`: tightened `description` for cross-agent trigger matching and
  Codex's shorter skill-list budget; Quick Setup now covers all surfaces. No move-set changes.
- `bin/baton-pass.js`: fixed mojibake em-dashes in help/output; `init` / `commands` behavior
  unchanged.
- `package.json`: ship `.codex-plugin/`; added `codex` / `agent-skill` / `openai-plugin` keywords.
- Removed the duplicate top-level `SKILL.md` (a leftover from the pre-fork layout).
  `skills/baton-pass/SKILL.md` is the one skill file; that is what Claude Code and Codex load.

## 0.6.9 - 2026-05-02

- Bumped version to align marketplace.json, plugin.json, and package.json after 0.6.8 was published to npm without updating plugin manifests.

## 0.6.8 - 2026-05-02

- Updated README: baton-pass output spec now shows all new fields (tasks, worktree, deviations, environment), anti-patterns list updated, repository layout updated with skills/ and baton-pass.template.md.

## 0.6.7 - 2026-05-02

- Expanded `baton-pass` output spec with four new fields: `tasks` (plan task status), `worktree` (branch + path), `deviations` (mid-flight decisions that differ from the plan), `environment` (prerequisites a fresh agent needs). These cover the state that is lost on session reset and cannot be reconstructed from git log alone.
- Added Quick Setup section to SKILL.md: plugin install path (`/plugin marketplace add francisN21/baton-pass`), `npx baton-pass init` CLI, complete file list, slash commands, local-only vs tracked state choice.
- Added Skill Discovery section explaining what skills carry across session boundaries and what the baton must write explicitly (task state, subagent state, environment).
- Added `foresight` drift report guidance: when drift is severe, write a structured report before continuing.
- Updated anti-patterns: added omitting task status, worktree path, and environment prerequisites.
- Updated `baton-pass.template.md` with all new fields and inline comments explaining when each applies.
- Updated description to be more specific about trigger scenarios.

## 0.6.6 - 2026-05-02

- Changed `new-game` default to local-only Baton Pass state so routine handoff files do not churn in GitHub.
- Added `npx baton-pass init --track-state` for teams that want `baton-pass.config.json`, `baton-pass.state.json`, and `docs/` committed.
- Updated `/new-game` instructions to ask whether state should be tracked or local-only.

## 0.6.5 - 2026-05-01

- Updated `new-game` / `npx baton-pass init` to add a `.gitignore` block for Baton Pass local files.
- Kept shared handoff files trackable; only local generated noise is ignored.
- Updated PowerShell and shell init scripts to match the npm CLI behavior.

## 0.6.4 - 2026-04-30

- Fixed plugin load error: "Path escapes plugin directory: ./ (skills)". Moved SKILL.md into a `skills/` subdirectory and updated `plugin.json` skills path from `"./"` to `"skills/"`. Also removed `./` prefix from `commands` path.

## 0.6.3 - 2026-04-30

- Added missing `templates/baton-pass.template.md` — the `/baton-pass` command referenced it but it did not exist; all other moves already had corresponding templates.
- Fixed `commands/new-game.md` step 2 hardcoded template path (`docs/skills/baton-pass/templates/`) — replaced with a generic reference that works regardless of install method.
- Fixed `templates/progress-log.template.md` Session 001 entry: removed hardcoded dragon-dance block (anti-pattern — dragon-dance should only appear when a real lesson was learned); replaced with the same commented-out optional format used in `progress-session.template.md`.
- Fixed `templates/progress-log.template.md` reference to `templates/progress-session.template.md` — that path does not exist in a user's repo after install; updated to clarify the template lives in the skill package.

## 0.6.2 - 2026-04-29

- Fixed `new-game` bash script creating a file named `baton-pass` in the repo root instead of `docs/agent-handoff.md`. Root cause: `"handoff"` key appeared in both `triggers` and `paths` sections of the config template; sed matched the wrong one first. Renamed `triggers.handoff` to `triggers.transfer` to eliminate the collision.

## 0.6.1 - 2026-04-29

- Added Claude Code plugin manifest at `.claude-plugin/plugin.json`.
- Added Claude Code marketplace manifest at `.claude-plugin/marketplace.json` using the published npm package as the plugin source.
- Updated npm package contents to ship `.claude-plugin/`.
- Clarified README install paths for Claude Code plugin install vs npm CLI install.

## 0.6.0 - 2026-04-18

- Added `package.json` — package is now installable via `npx baton-pass`
- Added `bin/baton-pass.js` — zero-dependency Node.js CLI with `init`, `commands`, and `help` subcommands
- `npx baton-pass init` installs shared memory files and Claude Code slash commands in one step
- `npx baton-pass commands` installs only the slash commands
- Both commands accept an optional `[target-dir]` and `--force` flag
- Rewrote README Quick Start to lead with the npx command

## 0.5.0 - 2026-04-18

- Added `commands/` directory with Claude Code slash command files for all seven moves: `new-game`, `save-state`, `baton-pass`, `foresight`, `dragon-dance`, `party-check`, `hindsight`
- Updated `init-baton-pass.ps1` and `init-baton-pass.sh` to copy command files into `.claude/commands/` automatically during `new-game`
- Updated README Quick Start — added step-by-step setup instructions and slash command usage examples
- Updated repository layout in README to include `commands/` directory

## 0.4.0 - 2026-04-18

- Added `hindsight` move — full baton chain audit covering milestones claimed, verification gaps, risks carried forward, drift across batons, and open items never resolved
- Added `hindsight.template.md` with baton chain table, per-agent milestone log, verification gap section, risk tracking, drift log, and audit verdict field
- Added `hindsight` to the move set, when-to-use rules, output spec, and anti-patterns in SKILL.md
- Added `hindsight` section to README.md with good triggers, output summary, and flow example
- Updated anti-patterns in both SKILL.md and README.md: do not run hindsight after every baton

## 0.3.0 - 2026-04-18

- Fixed dragon-dance.template.md header — removed "Use this after every baton-pass" (contradicted the conditional rule in SKILL.md)
- Fixed agent-handoff.template.md — removed "include one dragon-dance improvement" from the handoff rule; dragon-dance is now explicitly conditional in the template
- Fixed progress-session.template.md — moved Dragon Dance section into a commented-out optional block so it is not filled out reflexively
- Added Turn State block to next-task.template.md — Last Move, Last Agent, Next Agent, Updated At at the top of the file for immediate ownership orientation
- Added action paths to foresight.template.md — "aligned → continue" and "misaligned → correct docs first, then continue; if drift reveals a lesson, run dragon-dance" directly in the template
- Added commit discipline to SKILL.md — commit before handing off, never hand off a dirty tree without naming uncommitted state
- Added verification vocabulary to SKILL.md — passed / passed outside sandbox / not run — [reason] / expected to pass unverified; explicit rule against writing "passed" when you mean "expected to pass, unverified"
- Added Turn State section to SKILL.md — explains next-task as primary, baton-pass.state.json as mirror; defines all state values
- Extended Anti-Patterns in SKILL.md with the two most common real failure modes from practice
- Rewrote README.md — aligned with all changes; added Turn State explanation, core rules table, verification vocabulary, anti-patterns, cleaner flow examples
- Updated example-baton-pass.md — matches current baton template structure with Turn State block at top

## 0.2.0 - 2026-04-17

- Reframed the package around a low-token-first philosophy
- Replaced the old bootstrap naming with `new-game`
- Added `save-state`, `foresight`, and `party-check`
- Added a lightweight shared status model in `baton-pass.state.json`
- Added bootstrap support for both config and state files
- Added templates for save-state, foresight, party-check, and shared state
- Clarified the sender/receiver flow:
  - sender uses `save-state` or `baton-pass`
  - receiver uses `foresight`
  - `dragon-dance` happens only when a real workflow lesson appears

## 0.1.0 - 2026-04-15

- Initial public version of the `baton-pass` skill
- Added the core `baton-pass` workflow in `SKILL.md`
- Added `dragon-dance` as the built-in improvement loop
- Added reusable templates for current state, next task, progress sessions, and dragon-dance notes
- Added an example handoff
- Added repository wrapper files for easier GitHub publishing
