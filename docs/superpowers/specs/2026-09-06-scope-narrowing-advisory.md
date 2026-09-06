# Scope Narrowing Advisory — v1.0.0

**Status:** advisory input, not a decision. **The v1 design spec
(`2026-09-04-coordination-v1-design.md`) is no longer frozen** — the repo owner lifted the freeze on
2026-09-06 for this revision. Revise it directly; no unfreeze ceremony is required.
**Audience:** `codex@astra`, who owns the architecture from here.
**Author:** `claude@verifier-B`, 2026-09-06.

Astra's job is to get the architecture right and land it, not to seek permission to change it. This
document is one reviewer's argument. Where it is wrong, overrule it and say why.

---

## 1. Why

A competing product (Navide, MIT, open-sourced 2026-06-01) ships multi-agent **orchestration and
observability** as a desktop environment: per-agent panes, per-pane logins, configurable pipelines
with parallel slots, workspace-scoped history and handoffs, quota badges. Its own site places
"intent-driven task and dependency orchestration" under *product direction*, not shipped, and lists
"where are sessions overlapping" as an open question.

Read that carefully, because it is the whole argument:

- **It coordinates by orchestration and observation.** It makes work visible and directable.
- **It does not enforce anything.** No boundary disjointness. No integration-time ownership check.

Our three hard guarantees (§1.1) are exactly the thing it does not have and is not building. Our
board, presence plane, and inbox are exactly the things it already does better, with a GUI, and
which we would be rebuilding from zero.

So: **stop building an environment. Build the guarantee.**

> New target: *a host-agnostic, Git-ref-based correctness layer for multiple writers. Any
> orchestrator can call it.*

This is a narrowing, not a pivot. The control plane, the claims model, and the validator — the parts
already built or next in line — are unchanged in purpose. What changes is that we stop surrounding
them with a user interface.

---

## 2. The layering, and the one acceptance test

```
Layer 3   Orchestrator UI (Navide / tmux / nothing)      optional
Layer 2   baton-pass skill, the v0.8.0 move set          optional
Layer 1   The gate: baton-pass CLI + git refs            AUTHORITATIVE
```

**Layer 1 must hold with Layer 2 and Layer 3 absent.** That is the acceptance test for every design
decision below. It follows directly from §1.1, which already says the `PreToolUse` guard is an
economic guardrail and not a security boundary: a rule an agent can decline to follow is not a
guarantee. If a property only holds when the agent runs the skill, it belongs in Layer 2 and must
not be counted as enforced.

Concretely, Layer 1 is a CLI over the existing adapter:

```
baton-pass claim     --item <id> --json
baton-pass done      --item <id> --candidate <ref> --json
baton-pass integrate --item <id> --json     # the validator runs here, and refuses
baton-pass status    --json                 # data out; someone else renders it
```

`integrate` is the only command that carries the product. Everything before it may be bypassed,
mis-driven, or lied to; the work still cannot land.

---

## 3. Keep / cut, by spec section

| Section | Disposition | Note |
|---|---|---|
| §6 backend adapter and ref layout | **keep** | Stage 2, already built |
| §7 initialization and genesis | **keep** | Stage 3 |
| §8 control plane, claims, fences, recovery | **keep** | Stage 1 model, already built |
| §9 `plan.json` | **keep** | the boundary declaration; see the risk in §6 below |
| §14 pre-integration validator | **keep — this is the product** | Stage 4, and the hardest work left |
| §15 two-tier merge, §16 plan revision | **keep** | |
| §17 board | **cut** — but see the dissent | ship `status --json`; do not own the renderer. `2026-09-06-reviewer-notes-board-and-independence.md` argues the opposite case and should be read before deciding |
| §10 presence plane | **cut** | advisory by construction; its main consumer was the board |
| §11 inbox | **cut** | agent-to-agent messaging is Layer 3's job |
| §12 hooks and capability probe | **demote to optional** | see the trap in §5 |
| §19 v1.1 scope | **cut entirely** | see §7 |

Cutting the board does not cost observability. We emit the data; an orchestrator draws the pixels.

---

## 4. What survives from Stage 1–2

**Survives unchanged.** `lib/pair/git-backend.js` in full — read, expected-OID CAS, listing, object
access, backend selection. It is Layer 1 substrate and the cut does not touch it. **Its pending
independent verification should still be completed**; that work is not wasted.

**Survives, with the capability machinery under review.** `lib/pair/transition-model.js`. The
control chain, fences, claims, boundary disjointness, candidate lifecycle, integration gate,
`candidatePathCheck` / `pathWithinBoundary` / `forbiddenControlPath` (the invariant-3 enforcement
added in `ff32590`), and the §8.6.2 contract-incident rule all stay exactly as they are.

Under review, because they exist mainly to support the hook trust model:

- `freshProof`, `nextPendingChallenge`, the nonce challenge chain
- `capabilityCurrent`, `allWriterProofsCurrent`, capability generations
- the `capability-upgrade` / `capability-downgrade` events
- `mode: 'full' | 'degraded'` and its claim-admission consequences

**Under review for a different reason.** `lease-renew` exists to serve automatic takeover, which is
a v1.1 feature this advisory proposes cutting. If v1.1 goes, decide whether the event keeps a
consumer or becomes dead weight.

**Nothing built so far needs deleting.** The cut is about what does *not* get built next.

**One known contradiction to reconcile.** The token-efficiency pass landed in `50b2e96` tells
contributors to "preserve board/presence functionality and human-facing visibility" — in
`CONTRIBUTING.md`, `skills/baton-pass/SKILL.md`, and `templates/agent-handoff.template.md`. §3 of
this advisory cuts both. Whichever way the architecture decision goes, those lines need to follow
it; they were written before this advisory existed and are not an argument against it.

---

## 5. The trap — read this before touching capability

Do **not** naively demote hooks while leaving the degraded-mode rule in place.

Degraded mode grants at most one global claim. That restriction exists because without a trusted
`PreToolUse` hook you cannot bound wasted work. But wasted work is a *cost*, not a *correctness*
failure — the validator is what makes escapes unlandable. If hooks become optional and every session
therefore registers as degraded, the system silently collapses to a single writer and the entire
design loses its reason to exist.

The likely resolution is that the concurrency limit becomes an explicit **policy knob** rather than
a consequence of capability, with hooks buying cheaper failure rather than admission. Confirm this
reasoning before acting on it; it is the single highest-risk decision in this advisory.

---

## 6. Astra's task

1. **Decide whether to accept the narrowing.** You own this call. Disagreement is a legitimate
   outcome — say so with reasons rather than implementing something you think is wrong.
2. **Revise the spec.** Edit `2026-09-04-coordination-v1-design.md` in place. The freeze is lifted,
   so the constraint is coherence, not ceremony: leave no section describing a component the
   revision removes, and no cross-reference pointing at one.
3. **Resolve §5** — the capability and concurrency question — with an explicit written decision.
4. **Propose the features that make v1.0.0 complete under the new framing.** This advisory
   deliberately does not enumerate them. The narrowed target is a correctness layer other tools call,
   which is a different product from the one the frozen spec describes, and a correctness layer has
   obligations an environment does not. Some prompts, not a checklist:
   - What does an orchestrator need in order to trust us — a stable machine contract, exit codes,
     versioning, a schema?
   - What does an operator do when the gate refuses? Is a refusal legible enough to act on?
   - Manual recovery (§8.7) was designed with a board present. What replaces the board there?
   - Can a second implementation be written against our spec, or is the format underdetermined?
   - What proves to a stranger that the guarantee holds — and can they run that proof themselves?

   Bring back a proposed v1.0.0 scope list with reasons, not a wish list.

5. **The staged plan after the cut**, for reference:

   ```
   Stage 3   canonical control commits, idempotent init and recovery
   Stage 4   the validator (§14)          <- the differentiator; hardest remaining work
   Stage 5   CLI surface and the JSON contract
   ```

   Board, presence, inbox, and hook stages cease to exist. Roughly half the remaining work, with the
   differentiator moved earlier: after Stage 4 there is something demonstrable.

---

## 7. Out of scope, deliberately

**All of v1.1** — automatic takeover, third-party quarantine, rename metadata, Cloudflare transport,
usage-aware auto-handoff. Usage awareness is already commodity in orchestrator UIs; transport work
is a separate infrastructure project; takeover depends on a trustworthy time source (§8.5) that does
not exist. None of it earns its cost.

**A Navide adapter.** Integrate *with*, never *into*. Merging into a macOS-and-Apple-Silicon
Electron app forfeits host-agnosticism, which is the only advantage we hold, and makes us a line item
on someone else's roadmap. That project is also early — small contributor base, first-party
dogfooding only by its own admission, and currently carrying bugs that make it unusable (reported
upstream by the maintainer of this repo, who rates it promising). It may well succeed. Betting on it
is still the wrong shape of bet.

Keep the JSON contract generic enough that *any* orchestrator can drive it, and let adapters be
somebody's afternoon rather than our roadmap.

---

## 8. The risk this does not solve

The validator needs `plan.json`, and a human has to declare the boundaries in it. **That is the
adoption ceiling for this entire design**: it only pays off where someone is willing to state
boundaries up front.

We cannot engineer that away. But it is worth noticing that an orchestrator's pipeline
configuration — stages, parallel slots, roles — is the most natural place for that declaration to
already exist. Which is the second argument for integrating rather than merging: let the orchestrator
get the boundaries written; we make them binding.
