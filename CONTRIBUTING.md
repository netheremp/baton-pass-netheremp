# Contributing

Thanks for improving `baton-pass`.

## Contribution Principles

- Keep the portable skill generic.
- Put repo-specific rules in local project docs, not in the shared skill.
- Preserve the low-token-first philosophy.
- Spend tokens on protocol/invariant reasoning; avoid repeated context reads, oversized diffs, recaps, and ceremony. Follow the skill's delta-only inspection rules.
- Ordinary CLI/UI/docs/tests/mechanical changes need normal implementation and appropriate tests unless risk warrants escalation. Reserve expensive independent/adversarial review for CAS, fencing, state transitions, recovery, integration, ownership, validator logic, and concurrency; do not require frontier-model review for every change.
- Preserve protocol guarantees, authoritative machine-side path/validator checks, and board/presence functionality and human-facing visibility.
- Prefer clarity over completeness.
- Add or update an example when changing the workflow in a meaningful way.
- If you improve the process, reflect that improvement in the templates when appropriate.

## Good Contributions

- clearer checklists
- better handoff templates
- stronger freshness checks
- better ownership and next-agent clarity
- examples of common failure modes
- improvements to the `dragon-dance` loop

## Avoid

- embedding one repo's exact workflow as universal truth
- adding tool-specific assumptions without saying so
- turning a compact move into a long recap
- bloating the templates with optional ceremony

## Suggested Pull Request Pattern

1. Explain the handoff pain point.
2. Show the impact on continuity.
3. Describe the process improvement.
4. Update examples or templates if the change affects how the skill is used.
