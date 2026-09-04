# Baton Pass v1.0.0 — Pair Mode Coordination Design

Status: architecture agreed by `claude@studio#1` and `codex@sol#1` after four adversarial review
rounds; specification corrected after a strict artifact review (2026-09-04). Awaiting
implementation planning.

## 1. Purpose

Let two named agent sessions, potentially on two machines, work in parallel on one shared plan
without conflicting — with a live human-facing board, and near-zero agent token cost for
coordination.

### Goals

- No two concurrent writers hold the same work item.
- No two concurrent writers may write the same file without a blocking, explicit transition.
- A human sees live status without spending agent tokens.
- Coordination costs an agent approximately nothing per turn.
- The existing sequential Baton Pass workflow is unchanged.

### Non-goals for v1.0.0

- Automatic takeover of a dead session's claim (v1.1; requires §8.7).
- More than two concurrent writers as a supported configuration (v2; see §18).
- Defence against a malicious holder of repository write credentials (§3).

## 2. Core principle

**Control is authoritative. Presence is advisory.**

Every correctness property is enforced by the control plane. Presence may be lost, delayed, or
reordered without affecting correctness. **No authoritative transition may branch on presence data
or on a wall clock.**

## 3. Threat model

This is **cooperative coordination, not a security boundary**. Fences and chain validation catch
accidents, races, and stale clients. Anyone with repository write access can forge or force-update
refs and bypass the CLI. Cryptographic actor authentication is out of scope for v1.

## 4. Identity

### 4.1 Terms

| Term | Meaning |
|---|---|
| `platform_kind` | `claude-code` \| `codex` |
| `platform_session_id` | Native conversation/thread id supplied by the runtime |
| `platform_actor_id` | Native subagent id; absent means the main actor |
| `registration_id` | Opaque Baton UUID allocated at registration |
| `registration_generation` | CAS-incremented incarnation fence |
| `machine_id` | Persisted random install UUID (§4.5) |
| `display_identity` | `<family>@<machine-label>#<ordinal>` — human-facing only |

**Authoritative actor fence:**
`(epoch_id, registration_id, registration_generation[, platform_actor_id])`

`display_identity` is never evidence. Neither is prompt text, baton prose, cwd, model name, or
self-assertion. A runtime learns its own label by reading its authoritative binding.

### 4.2 Canonical identity sources

| Runtime | Hook | Agent-invoked CLI |
|---|---|---|
| Codex | JSON stdin `session_id` | `CODEX_THREAD_ID`; `CODEX_SESSION_ID` must agree when present |
| Claude Code | JSON stdin `session_id` | `CLAUDE_CODE_SESSION_ID` |

**A hook process's inherited environment is never identity evidence.** Proven by nesting: when an
inner runtime is launched from an outer one, the inner hook process inherits the *outer* id while
the hook JSON correctly carries the *inner* id. Hooks read stdin. Only agent-invoked CLI reads the
environment variable. `CLAUDE_CODE_HOST_SESSION_ID` is an entrypoint alias, not authority.

### 4.3 Binding

`register` **explicitly binds** `(platform_kind, platform_session_id)` to a fresh `registration_id`
with `registration_generation = 1`, and records `machine_id`, worktree/common-dir identity, cwd,
model, runtime version, entrypoint, and capability evidence (§12.2). The binding is the only fact
that lets a runtime recognise its own registration.

`reactivate` is a distinct CAS transition: an existing `(platform_kind, platform_session_id)`
binding is rebound to the same `registration_id` with `registration_generation + 1`. It fences any
write still in flight from the previous incarnation. Resume uses `reactivate`; it is never implicit.

### 4.4 Runtime-verified behaviour

| Case | Behaviour |
|---|---|
| Same session, all hook events | Identical `session_id`; only `turn_id` changes |
| Resume | Same platform id; `reactivate` increments generation |
| Fork | New platform id, with `forked_from_id`; never inherits the parent's claim |
| Two new sessions, same worktree | Distinct ids |
| Two simultaneous resumes of one thread | Fails closed (thread-store writer conflict) |
| Subagent | Carries the **parent's** `session_id` plus `agent_id`; subordinate actor under the parent's registration, scope, and fence. Cannot independently claim an item in v1 |

Sessions in one worktree are separated by native platform id. **Never** by cwd, and never via a
cwd-keyed runtime singleton.

### 4.5 Machine identity

`machine_id` is a **persisted random UUID** generated once per install and stored in local runtime
state. It is never derived from hostname, MAC, or hardware identity — those are unstable, leak
information, and collide across clones.

`machine-label` is human-facing. Each label is **reserved to one `machine_id` per epoch**; a second
machine presenting a taken label must supply a disambiguator or is refused. Ordinals are allocated
per `(epoch_id, agent_family, machine_id)` and never reused.

### 4.6 Failure behaviour

An agent-launched CLI that cannot produce a matching native id **cannot enter full mode**. A manual
CLI outside an agent is read-only/admin until the user selects a registration explicitly. Mismatch,
absent binding, changed hook hash, stale generation, or a simultaneous registration CAS all fail
closed.

## 5. Architecture

Two planes over one pluggable backend.

```
agent turn ──> hook ──> local presence file       (instant, no network, no tokens)
                 │
                 └────> local inbox drain ──> injected context   (push, not poll)

control  : append-only commit chain, authoritative
presence : one ref per registration, advisory
```

Agents write local files. Network cost lives in the CLI at decision points and in a throttled
background flusher — never on an agent's critical path.

## 6. Backend adapter and ref layout

### 6.1 Adapter

The planes speak to an adapter exposing exactly: **read**, **expected-OID compare-and-swap**,
**ref listing**, and **object access**. All specification wording below is backend-neutral; "read",
"publish", and "CAS" mean the adapter operation, never a specific git command.

| Backend | Applies when | CAS mechanism |
|---|---|---|
| `common-dir` | All participants resolve the **same absolute git common directory** (linked worktrees) | `update-ref <ref> <new> <expected-old>` |
| `remote` | Otherwise, including independent clones on one machine | lease push with expected OID |

Both verified empirically: local CAS rejects a stale expected-old (exit 128) preserving the winner;
remote CAS rejects with `(stale info)`. Measured remote round trip on the reference connection:
**4.5–6 s**; local: sub-millisecond.

**"Same machine" is not sufficient for `common-dir`** — independent clones have distinct ref and
object namespaces.

### 6.2 Ref prefix

Default prefix `refs/baton-pass/`. Some hosts reject custom ref namespaces, so `pair init`
**probes** the prefix and, on rejection, falls back to a configured ordinary-branch-space prefix.
The chosen prefix is **pinned at genesis**. Participants never switch prefix silently.

All immutable refs are **namespaced by `epoch_id`**, so a later epoch on the same repository can
never collide with, or resurrect, an earlier epoch's objects.

| Ref | Purpose |
|---|---|
| `<prefix>state` | Control commit chain of the **active** epoch (§6.5) |
| `<prefix>presence/<registration_id>` | Advisory presence, one writer |
| `<prefix>e/<epoch_id>/plan/<plan_revision>` | Immutable pinned plan revision |
| `<prefix>e/<epoch_id>/result/<claim_id>/<candidate_generation>` | Immutable candidate (§6.3) |
| `<prefix>e/<epoch_id>/report/<integration_attempt_id>` | Immutable authoritative report |
| `<plan.integration_branch>` | Integration branch |

### 6.3 Object reachability

**A textual OID in a control record does not make its object fetchable.** A host serves only
objects reachable from an advertised ref. Therefore:

- Each immutable plan revision is published at its epoch-namespaced plan ref with **expected-absent**
  CAS, and both its **commit OID and blob OID** are pinned. The validator reads the plan through that
  ref, never by bare OID.
- A claim result is published at `<prefix>e/<epoch_id>/result/<claim_id>/<candidate_generation>`
  with **expected-absent** CAS **before** the `done` transition. `done` records ref, OID, and
  `candidate_generation` together. Each candidate ref is **write-once and immutable**, frozen for
  validation and integration.
- **A new candidate never overwrites an old one.** §15.1 remediation increments
  `candidate_generation` and publishes a new ref. A superseded candidate is retained until the claim
  reaches `integrated`, `cancel`, or `revoke`, then GC'd after a retention grace.
- The authoritative validator report is published at its epoch-namespaced report ref with
  **expected-absent** CAS **before** its ref and OID are embedded in the merge commit or recorded on
  `integrated` (§14 steps 12-13).
- In `common-dir` mode the shared object store is readable directly; every ref above is still written
  so the board and validator use one code path.
- Deleting any of these refs is never a control transition.

### 6.4 Backend pinning

`coordination_backend_id` — backend kind plus stable repository identity — is pinned in genesis and
verified by every participant before registration. **Never silently fall back between backends**;
that creates split authority. Migration requires quiescence and a new epoch (§6.5).

Because git refuses to check out one branch in two linked worktrees, integration uses a dedicated
integration worktree or ref plumbing.

### 6.5 Epoch close and switch

`<prefix>state` names exactly one **active** epoch. Closing is explicit and human-authorized:

1. Reach quiescence — no active claims, no gates, nothing awaiting integration (as in §16).
2. CAS an `epoch-closed` transition recording the final revision and integration head.
3. Archive the chain at `<prefix>e/<epoch_id>/state-final`, then run `pair init` (§7) for the new
   epoch, which pins the previous `epoch_id` as its predecessor.

A closed epoch's immutable refs are retained under their own `epoch_id` namespace and never reused.
A participant pinned to a closed epoch fails closed and reports the successor.

## 7. Initialization (`pair init`)

Establishes the trust anchor that chain validation depends on. **Init never overwrites; any
existing mismatched ref fails closed.**

1. Validate the plan (§9). Refuse to proceed on any validation error.
2. Select the backend and resolve `coordination_backend_id`; probe and select the ref prefix (§6.2).
3. Publish the plan as **plan revision 1** at `<prefix>e/<epoch_id>/plan/1` with **expected-absent**
   CAS. (Convention, used everywhere: **control revisions start at 0** — genesis — while **plan
   revisions start at 1**.)
4. Create or verify `plan.integration_branch` at `plan_base_oid`. If it exists at a different
   commit, fail closed and report.
5. Create the genesis control commit (**control revision 0**) with **expected-absent** CAS. Genesis
   records a freshly minted `epoch_id`, any predecessor `epoch_id`, `coordination_backend_id`, ref
   prefix, `plan_revision = 1`, the pinned plan ref with its **commit and blob OIDs**, and the
   integration ref and OID.
6. Mark the epoch ready by a subsequent CAS transition.

**Idempotent recovery.** A crash between steps leaves a partially initialized epoch. Re-running
`pair init` **adopts and validates existing artifacts rather than reproducing them** — genesis
contains a random `epoch_id`, so it can never be regenerated byte-identically, and any design that
assumed it could would fail permanently after a post-genesis crash.

Recovery reads whatever exists, in order: an absent artifact is created; a present artifact is
**validated against the intended configuration** (plan content, backend id, prefix, integration
head) and adopted on match; a **mismatch fails closed** and reports. If genesis already exists, its
`epoch_id` and pinned OIDs become authoritative for the rest of recovery. Because readiness is
marked last, a non-ready epoch is always safe to re-init; a ready one is never re-initialized.

**Joiners** read genesis, then pin `(epoch_id, genesis_oid, coordination_backend_id, ref prefix)`
locally before registering. A later epoch presenting a different genesis OID for the same repository
is a different epoch and requires explicit user action.

## 8. Control plane

`<prefix>state` points to an append-only commit chain. Every commit has exactly one parent (except
genesis), and **its parent must equal the explicit leased OID**. The tree holds canonical
`state.json` plus one `event.json`.

The chain — not a reusable blob — closes the **ABA hazard**: a blob whose content cycles back to an
earlier value recreates the earlier OID, letting a stale lease win. Claim → release → re-claim
produces byte-identical state, so this is reachable in practice.

```json
{
  "schema_version": 1,
  "epoch_id": "<uuid>",
  "revision": 42,
  "parent_oid": "<full-git-oid>",
  "plan_revision": 1,
  "plan_ref": "<prefix>e/<epoch_id>/plan/1",
  "plan_commit_oid": "<full-git-oid>",
  "plan_blob_oid": "<full-git-oid>",
  "event_id": "<uuid>",
  "event_type": "claim",
  "actor": { "registration_id": "<uuid>", "registration_generation": 1,
             "platform_actor_id": null },
  "recorded_at_advisory": "<RFC3339 UTC>"
}
```

`revision` strictly increments. Readers validate the chain segment to the pinned genesis before
trusting state.

### 8.1 Materialized `state.json`

| Collection | Contents |
|---|---|
| `epoch` | `epoch_id`, predecessor, `coordination_backend_id`, ref prefix, genesis OID, readiness, `max_concurrent_writers`, **`integration_head_oid`** (§8.4) |
| `plan` | `plan_revision`, pinned plan ref/OID, `plan_base_oid`, supersession chain |
| `registrations` | binding, generation, machine, **materialized capability status and current nonce challenge** (§12.2), mode, status |
| `machine_labels` | label → `machine_id` reservations |
| `claims` | per item: `claim_id`, `claim_generation`, owner fence, effective boundary, `claim_base_oid`, result ref/OID, status |
| `items` | Item status: `todo` \| `claimed` \| `blocked` \| `done` \| `integrating` \| `integrated` \| `cancelled`. **Item status is distinct from claim-attempt status** — a released or revoked attempt returns the *item* to `todo` while its claim record is retained for history |
| `contract_incidents` | open incidents and affected items |
| `integration_gate` | singleton: item, `integration_attempt_id`, control OID and integration head at acquisition |
| `plan_gate` | singleton: active plan revision, if any |

### 8.2 Events

| Event | Notes |
|---|---|
| `register` | Binds `(platform_kind, platform_session_id)` → `registration_id`, generation 1. Allocates a never-reused ordinal and reserves the machine label. Carries capability evidence and probe nonce |
| `reactivate` | Rebinds an existing platform session; generation + 1; fences the prior incarnation. **Atomically rebinds that registration's active claims to the new generation** in the same CAS (§8.2.1) |
| `claim` | Actor fence, `item_id`, `claim_id`, incremented `claim_generation`, **`claim_base_oid`** (§8.4), private `branch_ref`, entire effective write boundary, contract hashes, `lease_duration_ms`, `expires_at_advisory`, mode |
| `lease-renew` | Refreshes `lease_duration_ms` and records the revision at renewal |
| `scope-change` | Additions only, with current fence and prior effective-scope digest. Always a blocking CAS. Rejects overlap with any unordered item's reserved boundary, even unclaimed ones. Shrinking forbidden while work is unintegrated |
| `contract-changed` | Atomically blocks the reporting claim and all active consumers. Cannot be acknowledged away; only a plan revision (§16) resolves it |
| `block` / `unblock` | Self-blocking latch (§13) and its reconciliation |
| `done` | §8.3 |
| `release` | Owner relinquishes an unfinished claim; scope freed |
| `cancel` | Claim abandoned; result ref enters GC retention |
| `revoke` | Human-authorized removal of another registration's claim (§8.7) |
| `end-session` | Registration tombstone |
| `integration-started` | Acquires the singleton gate with an `integration_attempt_id` |
| `validation-failed` | An invariant violation; claim stays blocked for diagnosis |
| `integration-aborted` | The attempt did not land; gate released |
| `integrated` | Merge landed; records merge OID, `integration_attempt_id`, and authoritative report ref/OID; releases the item's reservation and the gate |
| `plan-revision-started` / `plan-revised` | §16 |

The item fencing token is `(epoch_id, item_id, claim_generation, claim_id)`.

#### 8.2.1 `reactivate` and active claims

An owner fence includes `registration_generation`. Incrementing it alone would strand every active
claim: the resumed runtime could not use its own claim, and the validator would reject it as stale.

Therefore `reactivate` **atomically rebinds the registration's active claims to the new generation
within the same CAS**. This is safe *because* it is atomic — an in-flight write from the previous
incarnation still carries the old generation and remains fenced, while the resumed runtime continues
seamlessly. `claim_id`, `claim_generation`, `claim_base_oid`, and the effective boundary are
unchanged; only the owner fence advances. Claims that were `blocked` stay `blocked`.

#### 8.2.2 Preconditions and effects

Every event in the table above carries explicit preconditions and effects; §8.6 states them for item
and claim transitions. An event name alone is not a specification, and an implementation must reject
any event whose preconditions are unproven rather than assuming a default.

### 8.3 `done` versus `integrated`

These are distinct and were previously conflated.

- **`done`** — the owner asserts an **immutable, reachable candidate ready for authoritative
  validation**. It carries the published result ref and OID, commit range, actual-path manifest and
  digest, contract hashes as observed at the result head, local verification results, and a
  **`preflight_report_digest`** from the owner's own pre-checks, and the `candidate_generation`
  (§6.3). It does **not** carry the authoritative validator report, which does not exist yet.
  `done` does **not** release scope.
- **`integrated`** — the validator (§14) has passed and the merge landed. It records the merge OID,
  the `integration_attempt_id`, and the **authoritative report's ref and OID** (published
  expected-absent at its epoch-namespaced ref, §6.3). It also updates
  `state.integration_head_oid` (§8.4). Only `integrated` releases the item's reservation.

An owner's preflight is advisory. Authority belongs solely to the validator run recorded on
`integrated`.

### 8.4 Two baselines

Distinct names, distinct meanings:

- **`plan_base_oid`** — the plan's immutable baseline. Contract hashes are computed here, and plan
  revision (§16) advances it. Never used for per-claim ranges.
- **`claim_base_oid`** — the integration head the claim builds on, read from
  **`state.integration_head_oid`** (§8.1). Dependency work therefore builds on already-integrated
  results.

**Git provides no cross-ref atomic compare-and-swap**, so a claim CAS on the control ref cannot by
itself pin the *integration ref's* head: step 13 could move integration between a claimant's read
and its write. Two rules close this without claiming atomicity git lacks:

1. `state.integration_head_oid` is materialized **in control**, updated only by `integrated` and by
   an authorized recovery finalize. A claim therefore reads and writes **one ref**, which its own
   CAS does cover.
2. **While the singleton integration gate is held, no new claim is admitted.** Integration is
   bounded and rare, so the cost is small and the guarantee is exact.

A claim's private branch starts at `claim_base_oid`. If the private branch already exists at a
different commit, the claim adopts it only when `claim_base_oid` is an ancestor; otherwise it fails
closed. **Presence path ranges and validator path ranges use `claim_base_oid`.**

### 8.5 Time

**The only authoritative ordering is `(control revision, commit-parent chain)`.** Every wall-clock
field is advisory and **named with an `_advisory` suffix**. No ownership, fencing, recovery,
release, revoke, or integration transition may branch on a timestamp.

v1 records `lease_duration_ms` and the revision/generation at issue or renewal, preserving lineage
for migration. Monotonic clocks are unsuitable across machines (no shared origin; reboot breaks
continuity) and commit timestamps are writer-supplied. **v1.1 automatic takeover therefore requires
an authoritative time/lease source plus a successful CAS to fence the old holder.** Until then,
takeover is manual (§8.7).

### 8.6 Legal transitions

**Claim admission** (`todo` → `claimed`) requires all of: every `depends_on` item `integrated`; no
live claim on the item; **the boundary disjoint from the reserved boundary of every distinct
unordered item** — not merely of currently active claims, since an unclaimed item's boundary is
still reserved by the plan; **no integration gate and no plan gate held** (§8.4); and, in full mode,
live writers below `max_concurrent_writers`, or in degraded mode, **no other write claim at all**.

| From | To | Event | Effect |
|---|---|---|---|
| `todo` | `claimed` | `claim` | Reserves the boundary; captures `claim_base_oid` |
| `claimed` | `claimed` | `lease-renew` | Refreshes `lease_duration_ms`; records the revision |
| `claimed` | `claimed` | `scope-change` | Additions only; boundary grows |
| `claimed` | `blocked` | `block` | Self-block latch, or a contract incident naming the item |
| `blocked` | `claimed` | `unblock` | Reconciliation recorded; fence current |
| `claimed` | `done` | `done` | Candidate published and frozen; **scope stays reserved** |
| `done` | `claimed` | `block` | A contract incident invalidates the candidate |
| `claimed`/`blocked`/`done` | `todo` | `release` | Owner relinquishes; boundary freed; candidate retained then GC'd |
| `claimed`/`blocked`/`done` | `cancelled` | `cancel` | Owner abandons the item; boundary freed |
| `claimed`/`blocked`/`done` | `todo` | `revoke` | **Human-authorized** removal of another registration's claim (§8.7); boundary freed |
| `done` | `integrating` | `integration-started` | Acquires the singleton gate; mints `integration_attempt_id` |
| `integrating` | `integrated` | `integrated` | Validator passed, merge landed; boundary released |
| `integrating` | `blocked` | `validation-failed` | Invariant violation; retained for diagnosis |
| `integrating` | `done` | `integration-aborted` | Transient cause; candidate unchanged |

`cancelled` is terminal for that item unless a plan revision (§16) reintroduces it. `release` and
`revoke` both return the item to `todo` and free the boundary; they differ only in who authorized
it, which the event records.

### 8.7 Manual recovery

Recovery is an **explicit, human-authorized, expected-OID CAS**. It never branches on advisory
expiry — an expired lease is a display hint that invites a human decision, never authority.

Recovering an integration attempt **must first inspect whether that attempt's branch push landed**
(§14 step 13) before choosing `integrated` or `integration-aborted`. The CLI fails closed and
prints the exact recovery command.

## 9. `plan.json`

Committed by the human at `.baton-pass/plan.json`, then published as an immutable pinned revision
(§6.3). Strict JSON, hand-editable, single source of truth for the partition.

```json
{
  "schema_version": 1,
  "plan_id": "coordination-v1",
  "plan_revision": 1,
  "plan_base_oid": "<full-git-oid>",
  "integration_branch": "refs/heads/integration/coordination-v1",
  "max_concurrent_writers": 2,
  "contracts": {
    "public-api": { "path": "src/api/index.js", "sha256": "sha256:<hex>" }
  },
  "items": [
    {
      "id": "cli-control",
      "title": "Implement control-plane transitions",
      "prefer": ["codex", "claude"],
      "depends_on": [],
      "write_scope": [
        { "kind": "file", "path": "bin/baton-pass.js" },
        { "kind": "tree", "path": "lib/control/" }
      ],
      "contracts": ["public-api"],
      "acceptance": ["CAS rejects a stale expected OID"],
      "verify": [{ "name": "control tests",
                   "argv": ["node", "--test", "test/control.test.js"] }]
    }
  ]
}
```

- **No instance-level `$schema`.** `schema_version` selects the validator's bundled offline schema;
  validation must never depend on network retrieval.
- **Scope syntax is deliberately small: exact `file` and recursive `tree` only.** Arbitrary globs
  and exclusions make intersection undecidable and would undermine claim-time proof.
- A `tree` entry matches only at a **segment boundary**: `lib/control/` matches `lib/control/x` and
  not `lib/controller.js`.
- `prefer` is an ordered hint by agent family, never ownership.
- `depends_on` must form a DAG. Item and contract ids are unique and stable.
- `verify[].argv` runs **without a shell**.

### 9.1 Path normalization

Plan validation runs **before participants are known**, so it cannot consult a specific filesystem.
It applies **conservative portable normalization**: repo-relative, `/`-separated, Unicode **NFC**;
no `..`, absolute roots, `.git`, or Baton runtime/control paths. It rejects any two entries that
collide under NFC equivalence or ASCII case-folding.

At **registration**, a writer probes its actual filesystem. If that filesystem reveals a collision
the portable rules did not (for example an additional Unicode folding), **that writer is refused**
rather than the plan being retroactively invalidated.

Symlink targets outside the repository are not coordinate-able and are never treated as owned
output.

### 9.2 Validation

Checks scope intersection for **every unordered item pair**, rejects overlaps, verifies contract
hashes at `plan_base_oid`, ensures contract paths are not writable by consumers, checks the
integration ref syntax, and pins **both the plan commit OID and the plan blob OID** into the epoch,
matching the genesis record (§7) and the control envelope (§8).

Because the whole boundary is reserved at claim time, a poor partition costs **concurrency, not
integrity**: too broad serialises work; too narrow triggers an early blocking scope-change. It can
never silently authorise two unordered writers on one path, and a bad partition surfaces at *claim*
time rather than at merge time.

Ergonomics: `pair plan init`, `pair plan validate`, with concrete diagnostics
(`items cli-control and board overlap at lib/control/`).

## 10. Presence plane

One ref per registration: `<prefix>presence/<registration_id>`, pointing to a small commit whose
parent is that registration's prior presence commit.

Payload: `epoch_id`, `registration_id`, `registration_generation`, `seq`, `observed_at_advisory`,
`status`, `item_id`, `claim_generation`, `claim_base_oid`, `head_oid`, `observed_paths`,
`last_control_revision`.

### 10.1 Writer algorithm

"Single writer" is a *logical* identity — multiple detached hook processes are *physical* writers,
so an unconditional write is unsafe even for one registration.

1. **Allocate `seq` under a per-registration local lock or atomic counter**, then atomically replace
   `latest.json`. Atomic file replacement alone cannot allocate a strictly increasing sequence
   across concurrent hook processes.
   `seq` is scoped to `(epoch_id, registration_id, registration_generation)`.
2. A per-registration single-flight flusher coalesces beats.
3. Every publish uses **adapter CAS** against the last observed OID, so `common-dir` obeys §6.1.
4. On stale rejection, read the winner. Validate its `epoch_id` and `registration_id`, then compare
   **lexicographically by `(registration_generation, seq)`**. If the winner is greater or equal,
   discard the local beat; otherwise retry with the winner's OID as the new lease.
5. Readers keep the highest `(registration_generation, seq)` seen and never render a lower value.
   Reader guarding prevents UI regression but does not replace writer CAS — a freshly started board
   has no high-water mark.

Presence flushing is detached and never blocks a turn. The CAS rides the same publish operation, so
it costs no extra round trip.

### 10.2 Observed paths

Computed from `claim_base_oid` through `HEAD`, **unioned with staged, unstaged, and untracked
paths**, NUL-delimited, normalized per §9.1.

`git diff --name-only` alone is wrong: it omits untracked files and forgets committed work once the
tree is clean.

**Rename detection must be disabled** (or both sides retained) so a rename appears as touching both
old and new paths. Explanatory rename/type-change metadata is deferred to v1.1 only because the
path union already *detects* the collision.

### 10.3 Polling and GC

One presence ref listing at a time. Visible board: schedule the next poll **after completion** at
`max(15s, 3 × EWMA_RTT)`; after unchanged results back off through 30/60/120 s. Hidden board:
60–120 s or off. Never poll every 5 s when one request takes ~5 s. Fetch only changed refs.

Clean shutdown writes a final tombstone, commits `end-session`, then deletes its presence ref with
an expected-OID CAS. After a crash, any board or CLI may delete a presence ref only once control
says that exact incarnation ended or its lease expired beyond a **24 h retention grace**, again with
expected-OID CAS. `baton-pass pair gc` provides manual cleanup. **Deleting an advisory ref is never
claim takeover.**

## 11. Inbox

A per-`(registration_id, registration_generation)` **local spool**. It is local state, not a plane;
control is never read through it.

Each message carries `message_id`, target fence, source control revision and claim fence, `kind`,
`severity`, `enqueued_at_advisory`, and a **`payload`** — the human-readable summary that is
actually injected.

**Delivery is at-least-once, not exactly-once.** A crash between injection and acknowledgement is
indistinguishable from a crash before injection, so exactly-once is unachievable and must not be
claimed.

- **Enqueue** and **claim-for-delivery** are atomic, so two concurrent hook processes cannot deliver
  the same message simultaneously.
- The **`message_id` is exposed to the consumer** in the injected text, so a repeated notice is
  recognisable as a repeat rather than a new event.
- **Acknowledge** after injection. Unacknowledged messages **replay**, which is the price of
  at-least-once.
- **Deduplicate** against retained acknowledged `message_id`s, so a replayed producer cannot
  re-notify.
- **All handlers must be idempotent.** Re-injecting a notice is always safe; a notice never carries
  authority, only information (§2).
- **Retention**: acknowledged ids are retained for deduplication; the spool is discarded when the
  generation ends, since a fenced incarnation's notices are meaningless.

Producers are the board (§17) and the local guards (§13). `UserPromptSubmit` drains and injects.

## 12. Hooks, capability probe, and modes

### 12.1 Hook roles

| Event | Role |
|---|---|
| `UserPromptSubmit` | Drain the local inbox; inject concise context |
| `PreToolUse` | Deny structured edits outside the claimed boundary |
| `PostToolUse` | Refresh presence; detect drift for paths not knowable in advance |
| `Stop` | Emit the post-turn beat |

**Hooks are inert outside an explicitly active pair-mode epoch.** With no ready epoch and no
registration for this platform session, every hook returns immediately without reading control,
writing presence, or injecting context — so sequential Baton Pass is genuinely unchanged (§20).

Codex ships these as **plugin-bundled hooks**, so users do not hand-edit `config.toml`. Hooks are
skipped until the user trusts the exact hash via `/hooks`, and a plugin update changes the hash and
requires re-review. Onboarding: install → review in `/hooks` → `pair doctor` → observe nonce proofs
→ register. A hook cannot wake an idle session; events arrive at the next turn boundary.

### 12.2 Capability probe

Registration records **evidence, not self-declared booleans**. Probe independently: control
read/CAS, local runtime directory, plugin discovery, hook hash trusted, `UserPromptSubmit` execution
and inbox injection, `Stop` execution and beat, structured `PreToolUse` denial, `PostToolUse`
observation, presence publish/read, and **hook-payload/agent-CLI identity equality for one issued
nonce**.

The hook writes the nonce plus event name, platform session id, hook hash, and runtime version into
plugin data. The registrar accepts only the fresh nonce it issued.

**Proofs must be visible in control**, or a participant on another machine could never evaluate
"current proofs from every concurrently writing registration" — local plugin data is invisible to
peers. Therefore capability status is **materialized in `state.registrations`** (§8.1) by a
nonce-rotation protocol:

1. Registration issues an initial challenge nonce, recorded in control.
2. The hook writes the answering proof — nonce, event name, platform session id, hook hash, runtime
   version — into local plugin data.
3. **Every control event that actor writes carries the proof for the outstanding challenge and
   rotates a fresh challenge** for the next one. The CAS rejects an event whose proof is absent,
   stale, or carries a changed hook hash.

Capability status is therefore refreshed by the actor's own control writes, and every peer reads it
from the same authoritative chain.

**Staleness is defined without a wall clock.** A proof is current when it answers the outstanding
challenge for the **current `registration_generation`** with an unchanged hook hash. A session that
performs a control transition without the corresponding proof is downgraded. Elapsed time is never
the test. This is a cooperative protocol (§3): it detects broken or disabled hooks, not forgery.

### 12.3 Modes

Two user-facing modes; internally a capability bitset. Presence health
(`online`/`stale`/`offline`) is a separate indicator.

**Full** — control read/CAS passed, registration bound, plan validated, hooks trusted with current
nonce proofs from **every concurrently writing registration**, local runtime storage works. Permits
up to `max_concurrent_writers` claims whose boundaries the plan proves unordered and disjoint.

**Degraded** — any automatic hook, injection, or guard proof absent or stale. Control grants **at
most one global write claim** regardless of `max_concurrent_writers`; others may do read-only work.
Claims, sync, scope changes, `done`, and validation become explicit CLI moves. The UI permanently
labels real-time collision and inbox protection unavailable. The validator remains mandatory. **No
silent upgrade** — full mode begins only after fresh proofs pass.

If control CAS is unavailable, neither mode grants a new write claim. Offline work may be preserved
privately but cannot reach `done` or integration until control is reachable and its fence current.

## 13. Collision handling

Prevention is **claim-time reservation of the whole static boundary**, not post-hoc observation.
Observing touched paths detects a collision only after the writers have already edited.

Layered response, weakest to strongest:

1. **`PreToolUse` denial** (v1.0.0) — deny structured edits (`apply_patch`/Edit/Write and tool calls
   with explicit paths) outside the claimed boundary. Arbitrary shell cannot be perfectly
   classified, so this is an **economic guardrail, not the security boundary**. It ships in v1
   because without it the wasted-work window is unbounded: one autonomous turn may run for hours
   before `Stop` while editing out of scope.
2. **Local fail-closed latch, then self-block.** On observed drift, a contract mismatch, or a lost
   hook proof, the session **first sets a synchronous local latch that denies ALL ordinary
   mutation** — not merely out-of-scope mutation — permitting only the §13.1 remediation actions,
   and only then attempts the `block` control CAS. Denying only out-of-scope writes would be
   unsound: a session that has lost its hook proof cannot be trusted to evaluate its own scope. The latch does not depend on the
   network, so a session cannot keep writing while its control write is in flight or failing.
   A board **never** imposes authoritative quarantine; a delayed or false beat could halt valid work.
   Third-party quarantine is v1.1.
3. **Inbox alert** — cross-registration notices are enqueued (§11) and injected at the next turn
   boundary.
4. **Pre-integration validator** (§14) — the hard, fail-closed guarantee.

### 13.1 In-flight remediation

"In flight" means **the currently executing tool call may return**. It never authorises another
ordinary edit. After detection the claim is `blocked`; the session may read, diagnose, revert or
move out-of-scope work, and commit a preservation checkpoint on its private branch. That commit is
**quarantined by state** — it cannot produce `done`, pass validation, or enter integration until
scope is reconciled.

## 14. Pre-integration validator

Fail-closed, item-slice based. This is the load-bearing integrity guarantee, and it does not depend
on hooks working. All reads use the adapter (§6.1).

1. Read the integration ref and control ref; validate ref names and OID formats.
2. Validate the control chain to the **pinned genesis** (§7): parent links, monotonic revision,
   epoch, event ids, pinned plan ref and OID.
3. **CAS-acquire the singleton `integration-started` gate** for one item, against that exact control
   OID and integration head, minting an `integration_attempt_id`. The gate is a **singleton for the
   epoch**: at most one item integrates at a time. It blocks claim, scope, and plan transitions for
   the item and closes the snapshot-to-push TOCTOU.
4. Read the plan through its pinned ref and validate schema, DAG, contract hashes at
   `plan_base_oid`, and static scope intersections. **Reject if a plan gate is active.**
5. Verify the integrating registration and mode; the item's owner, `claim_id` and `claim_generation`;
   status `done`; unblocked; **generation not stale**; dependencies already `integrated`.
6. Read the frozen result ref (§6.3) and require expected ancestry from `claim_base_oid`, the
   declared commit range, and a clean worktree.
7. Compute changed paths from the authoritative range **with rename detection disabled**. Require
   every path inside effective scope and outside forbidden Baton/control paths. Compare to the
   `done` manifest and digest.
8. Re-hash every contract at the result head. Any mismatch without an approved plan revision blocks
   all affected items.
9. Compare actual paths against already-integrated ownership manifests. Overlap is allowed only when
   the plan's dependency edges strictly order the items.
10. Run configured `verify[].argv` **without a shell**; record exit code and output digest. Missing
    tools and timeouts fail explicitly. No command is silently skipped.
11. No-write merge analysis against the leased integration head. **Automatic validation fails on
    every merge conflict** — see §15.1.
12. Build the **authoritative report**, bound to epoch, plan ref with commit and blob OIDs, control
    revision, integration head, claim fence, result ref/OID/`candidate_generation`,
    `integration_attempt_id`, path and contract digests, and verification results.
13. Publish the report (step 12) at its epoch-namespaced ref with **expected-absent** CAS. Then
    create the merge commit with the **leased integration head as first parent and the frozen
    candidate head as second parent**, and **embed `integration_attempt_id` plus the report ref and
    OID in the merge commit message** so a later process can prove which attempt landed. Verify the
    tree, then publish the integration ref with expected-OID CAS.
14. CAS-write `integrated` with the merge OID, `integration_attempt_id`, and report ref/OID; release
    the item's reservation and the gate.

### 14.1 Failure disposition

**Releasing a held gate is itself a state change and requires a CAS.** Distinguish failures
*before* the gate is acquired from failures *after*.

| Situation | Event | Gate |
|---|---|---|
| Race at steps 1–3, gate never acquired | none — nothing to release | Not held; retry from step 1 |
| Invariant violation (steps 4–11) | `validation-failed`; claim → `blocked` | Released by that CAS |
| Transient read/CAS race after acquisition, or stale integration head | **`integration-aborted`** | Released by that CAS; restart from step 1 |
| Failure after the step 13 push, outcome uncertain | Explicit recovery (§8.7) — inspect whether the attempt landed | **Held** |
| Attempt landed but final CAS missing | `integrated` completed idempotently by `integration_attempt_id` | Released |

**Never merge twice.** Because the attempt id is inside the merge commit, recovery can prove
whether the exact attempt landed rather than guessing.

## 15. Merge flow

Two tiers:

- Agents merge their own validated slices into a **shared integration branch**, so dependencies
  unblock without a human in the loop. `done` = candidate ready (§8.3); `integrated` = merged.
- The gate out is a **single PR: integration → `main`**, reviewed by the human.

### 15.1 Conflict reconciliation

The validator has no conflict exception: step 11 fails on every conflict.

Resolution is a separate, **explicit human-authorized remediation**. Under it, an agent may resolve
conflicts **wholly inside its own effective scope**, publishing a **new immutable candidate at an
incremented `candidate_generation`** (§6.3 — candidate refs are write-once, so remediation never
overwrites the superseded one) and recording a new `done` transition; the validator then reruns from
step 1. Any conflict touching another
ownership boundary raises an event and stops. No agent ever silently edits another owner's files.

## 16. Plan revision

Advancing `main` alone does **not** stale a plan pinned to an immutable `plan_base_oid`. Staleness
occurs only when pair mode intentionally advances its integration base or accepts a contract change.

`pair plan revise` is allowed only at a **quiescent boundary**: no integration gate, no active
claims, nothing `done` awaiting integration. Work must first integrate, release, or be explicitly
cancelled or privately preserved.

CAS-acquire the singleton `plan-revision-started` gate against exact control and integration OIDs.
If absorbing upstream, a human or CLI advances the integration branch under that gate; the new
`plan_base_oid` must equal the resulting integration head and contract hashes are recomputed there.
Validate schema, DAG, scopes, contracts, stable item ids, and the immutable history of already
integrated items. Publish the new revision at `<prefix>e/<epoch_id>/plan/<n>` with
**expected-absent** CAS and pin its **commit and blob OIDs**, then CAS `plan-revised` with
`plan_revision + 1`, new refs and OIDs, and a `supersedes` link. **All old claim and validator
fences become invalid.** Release the gate only after the state transition; recovery is idempotent.

A `contract-changed` incident blocks affected claims first and cannot be acknowledged away; this
quiescent flow is the only way to adopt a changed contract.

## 17. Board

A long-lived local process. It renders control state plus presence, and runs the collision monitor
as a set intersection over observed paths — roughly fifty lines, **not a third agent**.

**Privileges.** The board uses only the adapter's **read, list, and object access** operations, and
writes **local inboxes**. It performs **no control or integration writes**. Optional leased presence
GC (§10.3) is its only ref write, and that is advisory. It cannot freeze a claim, and correctness
never depends on it running.

Local sessions update via filesystem events (sub-second); remote sessions via §10.3 polling. Lanes
render from a **data-driven list**, never fixed slots.

## 18. Concurrency generality

The product may be called "pair mode", but **no schema, adapter, or invariant may encode two**.

- Express the limit as `max_concurrent_writers = K`; v1 **policy** sets K=2.
- Use collections — `participants`, `claim_ids`, `conflicts` — and universal or pairwise quantifiers.
- Never use `peer`, `other`, `agent_a`/`agent_b`, or "both" in schemas or invariants.
- Scope disjointness quantifies over **item pairs**, not participant pairs, and is already
  K-agnostic.
- Polling, GC, recovery, quiescence, and collision notices quantify over all live registrations.

Nothing structural blocks a third writer. Registration ordinals, per-registration presence refs, and
pairwise scope validation all generalise. Costs that *do* grow with K: ref advertisement bytes,
object fetching, board processing, GC, and control-CAS retry amplification under synchronised
writers — which needs randomised exponential backoff, jitter, and fairness. At remote RTT of
4.5–6 s this is a throughput ceiling, not a correctness limit.

**The correctness model is K-generic in v1.** Shipping K>2 as a *supported configuration* is
scheduled for **v2** (§19) and requires load and UX validation, not a correctness-model rewrite.

## 19. Scope

**v1.0.0** — initialization and genesis; append-only control chain with CAS fences; static
whole-boundary claims; contract enforcement; `PreToolUse`/`PostToolUse` guards; local latch and
self-block; the validator; two modes; identity binding and probes; leased advisory presence; the
inbox; both backends; the board; two-tier merge; explicit manual recovery.

**v1.1** — automatic expired-claim and integration-gate takeover (requires an authoritative time
source, §8.5); third-party quarantine; explanatory rename metadata; Cloudflare transport;
usage-aware auto-handoff.

**v2** — three or more concurrent writers as a supported configuration.

## 20. Declared constraints

- Cooperative threat model (§3).
- Manual recovery in v1: expired claims and gates are advisory fields, never automatic authority
  transfer. The CLI fails closed and prints a precise recovery command.
- Restricted scope syntax reduces achievable concurrency in exchange for decidable intersection.
- Pair mode is **purely additive**. With no active epoch, hooks are inert (§12.1) and sequential
  Baton Pass users see no change.
