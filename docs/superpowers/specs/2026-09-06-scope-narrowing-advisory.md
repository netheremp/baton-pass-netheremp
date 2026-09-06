# Scope Advisory — v1.0.0

**Status:** advisory input, not a decision. **The v1 design spec
(`2026-09-04-coordination-v1-design.md`) is no longer frozen** — the repo owner lifted the freeze on
2026-09-06. Revise it directly; no unfreeze ceremony is required.
**Audience:** `codex@astra`, who owns the architecture from here.
**Author:** `claude@verifier-B`. Revised 2026-09-06 after the owner corrected the product direction.

Astra's job is to get the architecture right and land it, not to seek permission to change it. This
document is one reviewer's argument. Where it is wrong, overrule it and say why.

> **Revision note.** An earlier version of this advisory framed the product as a correctness layer
> that orchestration UIs call, and cut the board on that basis. The owner has since stated the
> direction below. That reframing invalidates part of the earlier argument; the board is restored
> and the plan model changes. Where the old version survives, it is because the reasoning still
> holds under the new framing, not because it was left unexamined.

---

## 1. The product

> **A standalone, lightweight tool that lets multiple coding agents plan their own work, divide it
> among themselves, and run in parallel without conflicting.** It must be useful on its own, install
> without ceremony, and plug into other CLIs and environments without depending on any of them.

Three constraints follow, and they are the ones that should settle arguments:

1. **Standalone.** Useful with nothing else installed. Not a plugin looking for a host.
2. **Zero-setup.** No configuration ritual, no hook-hash review flow, no plan the user must author
   before anything works. If a step exists only to satisfy the tool, it is a defect.
3. **Portable.** Any OS, any agent CLI, any terminal. Git is the only substrate: no server, no
   account, no daemon, no desktop app.

Compatibility with other environments is a **consequence** of portability, not a goal that competes
with it. Nothing here should be designed around any particular product's existence.

### Why the scope still narrows

The frozen spec describes an environment: a control plane *and* a presence plane *and* an inbox *and*
hooks *and* a board *and* a validator. Under the three constraints above, most of that is either
setup burden or a second channel for information the control plane already carries.

What survives is the part nothing else provides: **parallel work that cannot silently conflict.**
That is the product. Everything else has to justify itself against constraint 2.

---

## 2. The layering, and two acceptance tests

```
Layer 3   Any orchestrator / IDE / nothing at all         optional
Layer 2   baton-pass skill, the v0.8.0 move set           optional
Layer 1   The gate: baton-pass CLI + git refs + viewer    THE PRODUCT
```

**Test A — the guarantee stands alone.** Layer 1 must hold with Layer 2 and Layer 3 absent. This
follows from §1.1, which already says the `PreToolUse` guard is an economic guardrail and not a
security boundary: a rule an agent can decline to follow is not a guarantee. If a property only
holds when the agent runs the skill, it belongs in Layer 2 and must not be counted as enforced.

**Test B — the human stands alone.** `git clone`, install, two terminals, no desktop app, no
orchestrator, no skill. Can a person see what the agents are doing, and act when the gate refuses?

Test B is new in this revision and it is the one that restores the board. A correctness layer nobody
can watch is hard to adopt and harder to trust, and "install someone else's app to see your own git
refs" is not an answer a standalone product may give.

Concretely, Layer 1 is:

```
baton-pass claim     --item <id> --json
baton-pass done      --item <id> --candidate <ref> --json
baton-pass integrate --item <id> --json     # the validator runs here, and refuses
baton-pass status    --json                 # machine contract
baton-pass board                            # the same data, for a human
```

`integrate` carries the guarantee. `board` carries adoption. Everything before `integrate` may be
bypassed, mis-driven, or lied to; the work still cannot land.

---

## 3. Keep / cut

| Section | Disposition | Note |
|---|---|---|
| §6 backend adapter and ref layout | **keep** | Stage 2, already built |
| §7 initialization | **keep, and make it zero-setup** | one command, sane defaults, no wizard |
| §8 control plane, claims, fences, recovery | **keep** | Stage 1 model, already built |
| §9 `plan.json` | **keep the boundaries, change the authorship** | see §4 — this is the big one |
| §14 pre-integration validator | **keep — this is the guarantee** | Stage 4, hardest work left |
| §15 two-tier merge, §16 plan revision | **keep, but §16 needs rework** | see the trap in §5 |
| §17 board | **keep — required by Test B** | read-only, boring on purpose |
| §10 presence plane | **cut** | replaced; see below |
| §11 inbox | **cut** | replaced; see below |
| §12 hooks and capability probe | **cut from the critical path** | pure setup burden; see §5 |
| §19 v1.1 scope | **cut entirely** | see §7 |

**What replaces presence.** Nothing, and that is the point. The control chain already records who
did what and when, authoritatively. A board can render last-activity from control state without a
second plane, a ref per registration, or polling. In v1.0.0 recovery is manual and leases are
advisory, so a liveness indicator would be a guess rendered next to facts — inviting an operator to
trust the guess. Showing only what the control plane knows is smaller *and* more honest.

**What replaces the inbox.** The control plane is already the channel. Claims are broadcast by
construction: agent B reads control state, sees `alpha` claimed, and takes `beta`. No message is
sent because none is needed. Every event that actually matters between agents — a claim, a block, a
contract incident, an integration — is *already* a control event. A separate messaging plane would
be a second, weaker copy of a channel we are already obliged to make correct.

This is worth stating positively rather than as a cut: **atomic claims over shared readable state
are the coordination mechanism.** That is what makes self-organising agents possible without a
manager process, and it is why the inbox was never load-bearing.

---

## 4. The change that matters most: agents author the plan

The frozen spec assumes a `plan.json` written before work starts — a pinned ref, a DAG, boundaries
declared up front (§9), consumed by static whole-boundary claims (§8.4). Under constraint 2 that is
exactly the setup burden the product must not have, and under the product direction it is also the
wrong shape: **agents are supposed to plan and divide the work themselves.**

The good news is that the enforcement model does not care who wrote the plan. It never trusted the
plan's *wisdom* — only its *bindingness*. An agent that declares "I own `src/auth/`" is thereafter
held to that declaration by the validator, whether a human or the agent itself wrote it down. A
badly chosen boundary produces a refused integration, not a corrupted repository.

So the boundaries stay; the authorship changes. Two shapes worth weighing:

- **(a) Claim-creates-item.** No plan file up front. The first claim of an unknown item id creates
  it with the declared boundary. The plan becomes an *output* of coordination rather than an input
  to it. Maximum zero-setup; requires the model to admit items that do not yet exist, which it
  currently rejects with `ItemNotFound`.
- **(b) Agent-writable plan with a cheap append path.** Keep `plan.json`, let agents add items to it
  through a lightweight control event that does not require the full §16 revision flow.

Either way, **incremental discovery has to be first-class**. `scope-change` already exists for this
and is well shaped for it: additions-only, blocking CAS, rejects overlap with any unordered item's
reserved boundary. An agent that discovers it needs more ground widens its claim and is refused if
that ground is spoken for. That is the self-organising loop, and it is already built.

---

## 5. Two traps

**Trap 1 — plan revision quiescence versus self-planning.** §16 requires full quiescence and human
authorization for a plan revision, and states that all old claim and validator fences become
invalid. That is correct for a *contract change* and completely wrong for *an agent adding a new,
disjoint work item mid-flight*, which under this product direction is the common case rather than an
exception. If self-planning is adopted without splitting these two paths, the system will demand a
full stop every time an agent thinks of something. Adding a disjoint item invalidates nothing and
should not be priced like a contract change; resolve the two into separate events.

**Trap 2 — the degraded-mode collapse.** Do not cut hooks while leaving the degraded-mode rule in
place. Degraded mode grants at most one global claim, because without a trusted `PreToolUse` hook
you cannot bound wasted work. But wasted work is a *cost*, not a *correctness* failure — the
validator is what makes escapes unlandable. If hooks leave the critical path and every session
therefore registers as degraded, the system silently collapses to a single writer and loses its
reason to exist.

The likely resolution is that the concurrency limit becomes an explicit **policy knob** rather than
a consequence of capability, with hooks — if they survive at all — buying cheaper failure rather
than admission. Note the honest trade: without hooks, conflicts surface at integration time instead
of at edit time. Later, but still never wrong. For a zero-setup product that may be the right price.

Confirm both before acting. Trap 2 is the single highest-risk decision in this advisory.

---

## 6. Astra's task

1. **Decide whether to accept this narrowing.** You own the call. Disagreement is a legitimate
   outcome — say so with reasons rather than implementing something you think is wrong.
2. **Revise the spec** in place. The constraint is coherence, not ceremony: leave no section
   describing a component the revision removes, and no cross-reference pointing at one.
3. **Resolve §4** — plan authorship — with an explicit written decision, and **§5**, both traps.
4. **Propose the features that make v1.0.0 complete under this framing.** This advisory deliberately
   does not enumerate them. A standalone zero-setup product has obligations the frozen spec never
   considered, because that spec assumed a configured environment. Some prompts, not a checklist:
   - What is the true first-run experience? How many commands from `npm i` to two agents working?
   - When the gate refuses, is the refusal legible enough for a human to act on without reading the
     spec? Refusals are the main interface of this product.
   - §8.7 manual recovery was designed with a board present. What exactly does the operator see and
     type? This is now the only recovery path, since v1.1 auto-takeover is cut.
   - How does an agent *discover* the protocol? A CLI with `--json` is not self-documenting.
   - Can a second implementation be written from the spec, or is the format underdetermined?
   - What proves the guarantee to a stranger, and can they run that proof themselves?

   Bring back a proposed v1.0.0 scope list with reasons, not a wish list.

5. **The staged plan after the cut:**

   ```
   Stage 3   canonical control commits, zero-setup init, manual recovery
   Stage 4   the validator (§14)          <- the guarantee; hardest remaining work
   Stage 5   CLI surface, JSON contract, and the board on top of it
   ```

   Presence, inbox, and hook stages cease to exist. Roughly half the remaining work, with the
   differentiator moved earlier: after Stage 4 there is something demonstrable, and after Stage 5 it
   is watchable.

---

## 7. Out of scope, deliberately

**All of v1.1** — automatic takeover, third-party quarantine, rename metadata, Cloudflare transport,
usage-aware auto-handoff. Two are worth naming specifically under the new framing: **Cloudflare
transport contradicts constraint 3** — a server dependency in a product whose portability comes from
having no infrastructure. Whatever git remote the user already has *is* the transport, and
`git-backend.js` already treats it that way. **Auto-takeover** still depends on a trustworthy time
source (§8.5) that does not exist; manual recovery plus a visible board is the coherent v1.0.0
answer, which is another reason Test B matters.

**Designing around any specific environment.** Integrate with, never into. Other tools are test
cases for portability, not design inputs. If a decision only makes sense assuming a particular
product exists, adopts us, and survives, the design is coupled to something we do not control.
Keep the JSON contract generic enough that anything can drive it, and let adapters be somebody's
afternoon rather than our roadmap.

---

## 8. The risk this does not solve

Under human-authored plans the ceiling was adoption: someone had to declare boundaries up front.
Agent-authored planning removes that ceiling and replaces it with a different one: **agents have to
divide the work well enough for parallelism to actually pay.**

The system guarantees that a bad division cannot corrupt the repository. It does not guarantee that
a bad division is *productive* — two agents can decompose work so badly that they serialize on
overlapping ground, each refused in turn, and the parallelism evaporates. That failure is visible
rather than silent, which is the correct trade, and the board is where it becomes visible.

But it means quality of decomposition is a real product surface, not an agent's private business.
Worth deciding whether v1.0.0 has anything to say about it, or whether observing it is enough.
