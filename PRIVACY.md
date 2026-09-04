# Privacy

**baton-pass-netheremp collects no data.**

- **No data collection.** The skill, the slash commands, and the `baton-pass` CLI do not
  gather, store, or transmit any personal or usage data.
- **No network.** Nothing here makes network requests, phones home, or sends telemetry or
  analytics. The `baton-pass` CLI imports only Node's built-in `fs`, `os`, and `path` modules.
- **No accounts.** No sign-in, no API keys, no credentials.
- **What it touches.** It reads and writes small Markdown/JSON files inside the repository you
  run it in (`baton-pass.config.json`, `baton-pass.state.json`, `docs/`) and copies the skill /
  command files into `~/.claude` or `~/.codex*` when you run `baton-pass install`. Those files
  never leave your machine.
- **Third parties.** None. The AI agent you run this inside (Claude, Codex, etc.) has its own
  privacy terms, which this project does not change.

Questions: https://github.com/netheremp/baton-pass-netheremp/issues

_Last updated: 2026-09-04. Derived from francisN21/baton-pass (MIT)._
