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

### 1.1 The design principle

**Agent context is the scarce resource. Machine work is free. Every design choice moves work from
context into code.**

This is the founding purpose of the project, stated as an engineering rule rather than a slogan, and
it settles more arguments than the three constraints do. Applied honestly it says:

- **An agent must never read state in order to decide.** If an agent has to load control state to
  learn what is free, coordination costs tokens on every turn — the exact thing this product exists
  to remove. The CLI does the reading; the agent declares intent and is answered.
- **A refusal must carry its remedy.** A refusal the agent has to investigate starts a research
  loop. A refusal that names the holder and the alternatives ends in one line. Refusals are the main
  event in this system, so this is the highest-leverage interface decision in it.
- **Anything derivable is derived, not written.** If the control plane already knows a fact, no
  agent should be spending context to restate it.
- **A component that makes agents read more is not neutral.** It has a running token cost per turn,
  charged forever. This is a second and stronger reason to cut the presence plane and the inbox:
  they are not merely architecture we do not need, they are channels every agent would have to
  consume on every turn.

The split to hold in mind:

```
machine, free                              agent, expensive
────────────────────────────────────────────────────────────
hook denies an out-of-boundary edit        declares intent
CLI reads control, computes overlap        accepts or adjusts
CLI answers with remedy and free regions   supplies judgment and why
validator proves paths, contracts, tree
CLI emits the factual half of a handoff
board renders for the human
```

Optimising this product means moving as much as possible to the left column. Where a feature cannot
be moved left, it needs a strong reason to exist at all.

### 1.2 Where this came from, and what is actually scarce

The owner's account of why the project exists, recorded because it should outrank any inference
drawn from the code:

> Before v0.8.0, no handoff could preserve correctness while avoiding unnecessary token burn — the
> failure mode was drowning the next agent in git diffs. That is what v0.8.0 set out to fix.
>
> But in use, a pattern showed up: *"I am always waiting for one side to finish before handing off
> to the other."* Tokens are saved, yet neither agent gets near its 5-hour limit. The saving is
> hollow. And the intended user is not someone who can shrug and buy a 20x plan or burn API credit —
> though even they should care, because ten percent of $20 is $2, but ten percent of $100K is
> $10,000.

Take that second paragraph seriously, because it reframes what this product optimises.

**For a flat-rate subscription, tokens saved have no cash value. Only capacity freed does.** The
scarce resource is the *rolling usage window*, and an unused window does not roll over — it is gone.
So there are two different optimisations, and only one of them has been built:

- **Token efficiency** — fewer tokens per unit of work. v0.8.0 does this. It pushes back the moment
  you hit the wall.
- **Capacity utilisation** — using the windows you have *already paid for*, in parallel. Nothing
  built so far does this, and it is worth strictly more.

Two agents run serially: you use roughly half of the combined capacity you are paying for, forever.
Run them in parallel and throughput doubles at zero additional cost. **That is the product.** The
correctness layer is not the point — it is what makes the parallelism safe enough to attempt.

**The metaphor encodes the limitation.** A baton is *passed*; only one runner runs. The owner's
frustration is the design working exactly as named. v1.0.0 is therefore not an evolution of
baton-pass — it is a different sport, and the move set will need to say so.

Practical consequence for every decision below: **idle time on either agent is the primary defect
class.** A design that is token-frugal but serialising is worse than one that spends slightly more
tokens and keeps both agents working.

### 1.3 Product shape — owner decision, 2026-09-06

**One product, two features.**

1. **Handoff (`baton-pass`, v0.8.0).** Stands alone. No installation required — it is a skill.
   Works with one agent, one machine, no plan, no claims, no validator, no coordination substrate.
   This is the on-ramp and by far the larger audience: anyone whose single agent runs out of context.
2. **Pair Mode.** An optional add-on, adopted when a user has usage they cannot burn. Adds the
   control plane, claims, the validator, and the board.

These are not two products, because they are **two axes of one problem**:

- **Handoff is vertical** — successive agents on one lane, across time.
- **Pair Mode is horizontal** — concurrent lanes at one instant, kept disjoint.

Parallelism does not remove handoff. It removes *idle* handoff. In Pair Mode each lane still has
agents that exhaust their context and hand off to a successor; handoff is per-lane, coordination is
cross-lane. A user needs both, which is why splitting them into separate products would sell one
problem as two tickets.

**The red line.** A user who wants only handoff must never be walked through Pair Mode's setup.
After `npx baton-pass init`, handoff works with no plan, no claim, no validator, no coordination
refs. Pair Mode is opened deliberately, later, by a user who has decided they want it. Breaking this
punishes the large audience with the small audience's complexity, and it is the fastest way to lose
what already works.

**Naming is already consistent with §18**, which says the product may be called "pair mode" while no
schema, adapter, or invariant may encode two. Pair Mode is therefore a *feature name*, not a second
product name, and the existing rule protecting the model from the name still applies unchanged.

**Versioning question withdrawn.** An earlier draft of this advisory worried that calling the
coordination work "v1.0.0" implied a matured relay and would mislead upgraders. Under one product
with two features that concern dissolves: the package gains a feature, and a version line running
0.8.0 → 1.0.0 describes exactly that. No rename or separate version line is needed.

### 1.4 The trigger has to be active

One correction to the framing above, and it matters more than it looks.

The owner describes Pair Mode as adopted "when the user notices they have usage they cannot burn."
**Nobody notices that.** An unused rolling window is an invisible loss — you never feel the capacity
you did not spend, you only feel the wall when you hit it. A product that waits for the user to
notice will wait forever, and the on-ramp never gets used.

So the handoff feature should say it. At the moment of a handoff, the tool already knows a handoff
is happening and can know that the receiving side's window was fresh while the sender's was spent.
One line at that exact moment — *these could have run in parallel; here is what that would have
saved you* — converts an invisible loss into a visible one, at the only moment the user is
receptive, and costs essentially nothing because the moment already exists in the workflow.

This is the on-ramp between the two features, and it is worth designing deliberately rather than
leaving to a line in the README.

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
| §12.1 enforcement hook (`PreToolUse`) | **keep** | owner decision; free, and it is the waste fence |
| §12.2 capability probe, §12.3 modes | **cut** | costs two events and two fields, saves no tokens; see §5 |
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

And per §1.1, both cuts pay twice. A plane an agent must consume is not free once it exists — it is
a per-turn context charge levied forever. Removing them removes running cost, not just code.

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

**Trap 2 — the degraded-mode collapse.** *Owner decision, 2026-09-06: the enforcement hook stays.
Reaching `integrate` having wasted hours of tokens is not an acceptable failure mode.* What follows
records why that does not mean keeping §12 whole.

"Keeping hooks" bundles two things whose costs differ by an order of magnitude, and only the cheap
one serves the goal:

| | What it is | New control events | New state | Serves token waste? |
|---|---|---|---|---|
| **Enforcement hook** (`PreToolUse`) | Reads the local claim boundary, denies out-of-boundary structured edits | **0** | **0** | **Yes, directly** |
| **Capability probe** (§12.2) | Nonce-rotation protocol proving to *other machines* that your hooks run | 2 of 23 | 2 fields per registration, plus modes | **No** |

The enforcement hook is nearly free because its path logic is already written and already verified:
`pathWithinBoundary`, `forbiddenControlPath` and `normalizedRepoPath` landed with the invariant-3
fix in `ff32590`. It touches no control state. **Keep it, and auto-install it at `init` wherever the
harness allows, with no hash-review ceremony** — a hook the user must approve through a wizard
violates constraint 2, and one that installs silently and degrades quietly does not.

The capability probe does not save a single token. It answers "are that peer's hooks trustworthy",
and its output is *admission control*: any unproven writer drops everyone to one claim. Follow the
causation — if A's hooks break, A wanders out of scope, and **A's** work is refused at integration.
B's boundary is still reserved and B's work still validates. The cost of broken hooks lands on the
party whose hooks broke. The cross-registration proof protects against something else, and §3's
cooperative threat model already says the target is broken or disabled hooks, not forgery.

**So: keep the enforcement hook, cut the probe.** That is not a compromise, it is the correct
decomposition — the half that saves tokens is already built, and the half that costs is the half
that saves nothing.

Cutting the probe *forces* the collapse question rather than merely risking it. Degraded mode grants
at most one global claim because unproven hooks meant unbounded waste; with no probe, that judgment
has no input. **The concurrency limit must become an explicit policy knob rather than a consequence
of capability**, or the system silently collapses to a single writer and loses its reason to exist.

With the hook kept, waste has three lines of defence, each catching what the previous missed:

| Layer | Detects at | Cost |
|---|---|---|
| `PreToolUse` denial | the edit itself | reuses existing path logic |
| CLI path check at `done` | end of turn | near zero, needs no hook |
| Validator at `integrate` | last resort | already required |

The middle layer is worth building regardless, because it is the one that still works when the hook
could not be installed.

---

## 6. Astra's task

1. **Decide whether to accept this narrowing.** You own the call. Disagreement is a legitimate
   outcome — say so with reasons rather than implementing something you think is wrong.
2. **Revise the spec** in place. The constraint is coherence, not ceremony: leave no section
   describing a component the revision removes, and no cross-reference pointing at one.
3. **Resolve §4** — plan authorship — with an explicit written decision, and **§5**, both traps.
4. **Apply §1.1 to the whole surface.** For every remaining component, ask what it costs an agent
   per turn and whether the machine could carry it instead. Three candidates that fall out of the
   principle and are not in the frozen spec at all:

   - **Claim as a query, not just a mutation.** `claim --paths <p>` answers yes, or no plus who
     holds it and which regions are free. The agent never reads control state to plan, because the
     answer to "what can I take" is the return value of asking to take something. This is most of
     what "agents divide work themselves" actually requires, and the CLI has already computed the
     overlap — returning it is nearly free.
   - **Machine-generated handoff facts.** Control state already knows what is claimed, by whom,
     what integrated, what is blocked, and which incidents are open. That is most of
     `current-state.md`. Emit it, and let the agent append only intent and judgment — the part no
     machine can derive. This makes "write the delta, not the recap" structural rather than a rule
     agents must remember, and it is where v1.0.0 pays back the v0.8.0 skill directly.
   - **Refusal ergonomics as a first-class surface.** Every refusal names the holder, the conflict,
     and the next legal action. Budget real design effort here; in a system whose main event is
     refusal, this is the product's primary interface.
   - **`foresight` becomes a machine check.** Today it is an agent reading documents and hoping they
     match reality — it costs tokens every resume and detects drift only if the reader notices. With
     authoritative control state, alignment is a diff between the written state and the control
     chain, and drift becomes mechanically detectable. This is the cheapest correctness upgrade
     available to the existing product, and it removes a recurring per-resume token charge.

   Weigh them and reject any that do not earn their place — the point of this advisory is narrowing.

   **And one finding to resolve, which §1.2 makes urgent (§8.4 rule 2, model `applyClaim`):**

   > `if (state.integrationGate) return reject(INTEGRATION_GATE_HELD)`

   While any item is integrating, **no agent may claim any item, however disjoint.** The spec
   justifies this as "integration is bounded and rare, so the cost is small and the guarantee is
   exact." Rare it is not: integration runs the validator, including `verify[].argv` — the build and
   test commands — which is the *longest* operation in the system. And the finer the decomposition,
   the better the parallelism but the more often this global stall fires. The design's throughput
   works against its own parallelism.

   It is not a correctness bug; the conservative rule buys an exact guarantee. But it is priced
   against an assumption that does not hold for the actual user, so decide deliberately rather than
   inheriting it. The question to answer: a new claim reserves boundary and writes no tree, so does
   admitting one whose boundary is disjoint from the integrating item actually invalidate anything
   the validator read? If not, the rule can narrow from "no claims" to "no overlapping claims" and
   the stall mostly disappears. Verify rather than assume — the TOCTOU argument in §8.4 is subtle and
   was written by people who had thought about it.

   Worth noting what is *already* fine: the writer limit counts distinct registrations, not claims,
   so one agent may hold several claims at once and need not idle while one of them integrates.

5. **Propose the features that make v1.0.0 complete under this framing.** This advisory deliberately
   does not enumerate them beyond the above. A standalone zero-setup product has obligations the
   frozen spec never considered, because that spec assumed a configured environment. Some prompts,
   not a checklist:
   - What is the true first-run experience? How many commands from `npm i` to two agents working?
   - When the gate refuses, is the refusal legible enough for a human to act on without reading the
     spec? Refusals are the main interface of this product.
   - §8.7 manual recovery was designed with a board present. What exactly does the operator see and
     type? This is now the only recovery path, since v1.1 auto-takeover is cut.
   - How does an agent *discover* the protocol? A CLI with `--json` is not self-documenting.
   - Can a second implementation be written from the spec, or is the format underdetermined?
   - What proves the guarantee to a stranger, and can they run that proof themselves?

   Bring back a proposed v1.0.0 scope list with reasons, not a wish list.

6. **The staged plan after the cut:**

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


---

## Appendix — conflict inventory

Every place the frozen spec contradicts this advisory, found by cross-reference audit on 2026-09-06.
This is a checklist for task 2, not additional argument. Line numbers are against
`2026-09-04-coordination-v1-design.md` as of `a95e12d`.

**The audit's headline: no cut here can break a guarantee, and the spec says so itself.** §2 states
that no authoritative transition may branch on presence data or a wall clock, and §13 states that
only layer 4 — the validator — is a guarantee. Presence and the inbox are therefore structurally
incapable of being load-bearing for correctness. Removing them is a scope decision, never a safety
one. Verify this claim rather than taking it from me; if it fails anywhere, that finding outranks
this entire advisory.

### Blocking — the spec forbids its own revision

- **L8–9** — "The architecture may be reopened **only** by failing implementation, model, or
  fault-injection evidence — not by further design review." The owner lifted the freeze on
  2026-09-06. Left as-is, the spec forbids the revision you are making. Fix this first, and record
  the owner's authority for the change.

### Direct contradictions

- **L543 (§9)** — "Committed by the human at `.baton-pass/plan.json` ... hand-editable, single source
  of truth for the partition." Contradicts constraint 2 and §4 of this advisory. The sharpest single
  conflict; resolving plan authorship rewrites this paragraph.
- **L247 (§7 step 1)** — "Validate the plan (§9). Refuse to proceed on any validation error." Init
  requires a plan to already exist, so first run cannot be zero-setup as written.
- **L712–714 (§12.1)** — "Hooks are skipped until the user trusts the exact hash via `/hooks`.
  Onboarding: install → review in `/hooks` → `pair doctor` → observe nonce proofs → register."
  Conflicts with zero-setup twice: the review ceremony, and the nonce proofs that no longer exist.

### Dangling references to cut components

- **L145–150 (§5)** — the architecture diagram shows the presence plane and the inbox drain as core.
- **L188 (§6.1)** — `<prefix>presence/<registration_id>` in the ref layout.
- **L703, L705, L721 (§12.1–12.2)** — `UserPromptSubmit` inbox drain, `PostToolUse` presence refresh,
  and the probe's presence publish/read. Note that `PostToolUse` **drift detection** survives the
  presence cut and is worth keeping; only its presence half goes.
- **L772 (§12.3)** — modes text depends on inbox protection and on the probe.
- **L802 (§13)** — layer 3 is the inbox alert. Collision handling becomes layers 1, 2, 4; say so
  explicitly rather than leaving a gap in the numbering.
- **L925, L929 (§17)** — the board "renders control state plus presence" and does optional presence
  GC. Both go, and the board improves: with presence cut it performs **no ref writes at all**, which
  is a stronger and simpler statement of its read-only nature than the current text.
- **L947 (§18)** — the K-generality argument cites per-registration presence refs.
- **L960–961 (§19)** — the v1.0.0 scope list itself names leased advisory presence, the inbox, two
  modes, and probes. Rewrite wholesale.

### Consistent — no change needed, and worth knowing

- **L17, L25 (§1 Goals)** — "a live human-facing board", "a human sees live status without spending
  agent tokens", "coordination costs an agent approximately nothing per turn." **§1.1 of this
  advisory is a restatement of the spec's own goals, not an import.** The token-economy principle
  was always there; it simply was not applied as a design filter.
- **L710 (§12.1)** — hooks inert outside an active epoch, so sequential Baton Pass is unchanged.
  Keeping the enforcement hook preserves this property intact.
- **L11–12** — the spec already defers "reconsideration of authoritative `lease-renew` or per-event
  nonce rotation." Cutting the probe is a move the authors had already anticipated as plausible.
