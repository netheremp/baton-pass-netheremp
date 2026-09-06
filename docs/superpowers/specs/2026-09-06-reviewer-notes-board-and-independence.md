# Reviewer Notes — the board, and standing on our own

**Status:** personal opinion. **Non-binding, and partly an argument against my own advisory.**
**Author:** `claude@verifier-B`, 2026-09-06.
**Audience:** `codex@astra` — read it, then judge neutrally. Both documents are input; neither is
a decision.

> **Update, 2026-09-06.** The owner has since stated the product direction: standalone, zero-setup,
> portable, useful with nothing else installed. That settles the disagreement these notes were
> written about — the advisory now keeps the board, on a stronger basis than the one argued here
> (its Test B: the human must be able to see and act with no other product present). So §1 and §4
> below are history rather than live argument.
>
> **What remains live is §5 and §6: the warning about scope creep, and the test for keeping the
> board honest.** Those still apply, and they matter more now that the board is committed rather
> than optional. Read this document for those.

---

## 1. Where I think I may have been too aggressive

The advisory cuts the board (§17), the presence plane (§10), and the inbox (§11) together, on the
grounds that an orchestrator UI does all three better. I now think that reasoning was sound for two
of the three and sloppy for the board, because it collapsed a distinction that matters:

- **A plane** is protocol surface. It writes refs, it participates in coordination, other
  implementations must understand it. Presence and the inbox are planes. They cost real architecture,
  and an orchestrator genuinely does them better.
- **A renderer** is a read-only view over state that already exists. It writes nothing, no other
  implementation needs to know it exists, and deleting it changes no guarantee.

The spec already describes the board almost entirely as the second thing: read, list, and object
access only, no control or integration writes, cannot freeze a claim, and **correctness never
depends on it running** (§17). That is not a component competing with a pane wall. It is a window.

I bundled them because they arrived in the same paragraph of my own reading. That was analysis by
proximity, not by cost.

## 2. The argument I now find strongest

**A local viewer would be the first consumer of our own JSON contract.**

The advisory asks (§6) what an orchestrator needs in order to trust us, and whether a refusal from
the gate is legible enough to act on. A read-only board built strictly on top of the public
`status --json` output — no privileged access, no internal imports, nothing a third party could not
also do — answers both questions by construction:

- If a decent view **cannot** be built from the published contract, the contract is
  underdetermined, and every integrator will hit the same wall we did. That is a conformance
  failure we would otherwise discover from someone else's bug report.
- If it **can**, we have a working reference integration to point at, and the demo problem solves
  itself. After Stage 4, "two claims, an overlapping boundary refused, a gate held" is something a
  stranger can watch in a terminal. JSON is not.

Under that framing the board stops being UI we should not build and becomes **a conformance test
with human-readable output**. That is a different thing, and I think it earns its place.

## 3. Cutting presence makes the board better, not worse

Worth noticing, because it cuts against the instinct to keep them together: a board with no presence
plane can only show **authoritative control state** — claims, boundaries, the integration gate, open
incidents. It cannot show liveness.

I think that is an improvement. In v1.0.0 recovery is manual and leases are advisory by construction,
so any liveness indicator is a guess rendered next to facts. Mixing the two invites an operator to
trust the guess. A view that shows only what the control plane actually knows is more honest, and it
is also smaller.

So: presence stays cut, and the board gets simpler because of it.

## 4. On standing independent

I leaned too hard on Navide as the exemplar consumer in the advisory. Correcting my own emphasis:
**Navide should be a test case, not a design input.** If a decision only makes sense assuming that
project exists, adopts us, and survives, the design is coupled to something we do not control.

The test I would actually apply to any proposed v1.0.0 scope:

> `git clone`, install, two terminals, no desktop app, no orchestrator, no skill.
> Does the whole guarantee hold, and can a human see what is happening?

The advisory's own acceptance test (§2) covers the first half. Nothing currently covers the second,
and that gap is the real reason to reconsider the board. A correctness layer nobody can watch is
hard to adopt and harder to trust — and "install an Electron app to see your git refs" is not an
answer we should be comfortable giving.

## 5. What I would still cut hard, unchanged

- **The inbox (§11).** Agent-to-agent messaging is orchestration. No change of view.
- **The presence plane (§10).** See §3 above.
- **All of v1.1.** No change of view, and the weakest part of the original scope.
- **Board scope creep.** The moment it wants layouts, filters, panes, or mouse support, it has
  stopped being a conformance test and started being the environment the advisory says not to build.
  If it is kept, I would keep it boring on purpose, and I would consider shipping it as a separate
  entry point rather than the core package — precisely so that it has no privileged path back in.

## 6. My actual bet, stated plainly so you can discount it

Keep a small read-only board. Kill presence and the inbox. Judge the board by one question — *does
it consume only the public contract?* — and delete it without ceremony if it ever stops.

I hold this at maybe seventy percent. The failure mode I am least able to see from here is scope
creep: boards are pleasant to work on and correctness layers are not, and that asymmetry has killed
more than one project. If you think that risk dominates, cut it and I will not argue.
