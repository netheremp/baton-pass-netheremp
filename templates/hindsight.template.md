# Hindsight

Use this to audit the full chain of baton passes — what was claimed, what was
verified, what risks were carried forward, and what was never resolved.

Run this when a milestone is complete, something smells wrong, or you need a
clear record of what actually happened across agents and sessions.

## Audit Scope
- full chain
  or
- [agent name / date range / milestone]

## Baton Chain
| # | From | To | Date | Goal Summary |
|---|---|---|---|---|
| 1 | — | [agent] | [date] | [one-line goal] |

## Milestones Claimed Per Agent
- [agent] — [what they said was done] — [verification status]

Use exact verification vocabulary:
- `passed` — ran locally, output confirmed clean
- `passed outside sandbox` — ran locally, not in CI/build environment
- `not run — [reason]` — skipped with stated reason
- `expected to pass, unverified` — not run, believed correct
- `not stated` — baton made no verification claim

## Verification Gaps
List every baton where a claim was made without supporting evidence,
or where `passed` was written but cannot be confirmed from context.

- Baton [#] — [agent] claimed [X] — gap: [what is missing or suspicious]
  or
- none found

## Risks Carried Forward
Risks that appeared in one baton and were passed to the next without resolution.

- [risk] — first noted in baton [#] — resolved? yes / no / unknown

## Drift Found Across Batons
State that drifted between what was written and what was true.

- [what drifted] — introduced in baton [#] — corrected? yes / no
  or
- none found

## Open Items Never Resolved
Tasks, blockers, or risks that appeared in the record but were never closed.

- [item] — first appeared [baton # or date] — status: open / unknown
  or
- none found

## Audit Verdict
- `clean` — chain is consistent, verifications are honest, no open items
- `gaps found` — [short list of what needs attention]
- `risks unresolved` — [short list]
- `action required` — [what the next agent must do before continuing]
