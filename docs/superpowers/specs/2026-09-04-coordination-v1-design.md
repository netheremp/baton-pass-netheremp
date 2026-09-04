# Baton Pass v1.0.0 — Pair Mode Coordination Design

Status: agreed by `claude@studio#1` and `codex@sol#1` after four adversarial review rounds
(2026-09-04). Awaiting implementation planning.

## 1. Purpose

Let two named agent sessions, potentially on two machines, work in parallel on one shared plan
without conflicting — with a live human-facing board, and near-zero agent token cost for
coordination.

### Goals

- Two concurrent writers cannot claim the same work item.
- Two concurrent writers cannot write the same file without a blocking, explicit transition.
- A human sees live status without spending agent tokens.
- Coordination costs the agent approximately nothing per turn.
- The existing sequential Baton Pass workflow is unchanged.

### Non-goals for v1.0.0

- Automatic takeover of a dead session's claim (v1.1).
- More than two concurrent writers (v1.1+ policy change; see §16).
- Defence against a malicious holder of repository write credentials (§3).

## 2. Core principle

**Control is authoritative. Presence is advisory.**

Every correctness property is enforced by the control plane. Presence improves freshness and
human experience, and may be lost, delayed, or reordered without affecting correctness. No
authoritative transition may branch on presence data.

An earlier draft violated this by building collision integrity on presence. That inconsistency
drove most of the redesign.

## 3. Threat model

This is **cooperative coordination, not a security boundary**. Fences and chain validation
catch accidents, races, and stale clients. Anyone with repository write access can forge or
force-update refs and bypass the CLI. Cryptographic actor authentication is out of scope for v1.

## 4. Identity

### 4.1 Terms

Do not overload the word "session".

| Term | Meaning |
|---|---|
| `platform_session_id` | Native conversation/thread id supplied by the runtime |
| `platform_actor_id` | Native subagent id; absent means the main actor |
| `registration_id` | Opaque Baton UUID allocated at registration |
| `registration_generation` | CAS-incremented incarnation fence |
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
the hook JSON correctly carries the *inner* id. Hooks read stdin. Only agent-invoked CLI reads
the environment variable.

`CLAUDE_CODE_HOST_SESSION_ID` is an entrypoint/host alias, not authority.

### 4.3 Runtime-verified behaviour

| Case | Behaviour |
|---|---|
| Same session, all hook events | Identical `session_id`; only `turn_id` changes |
| Resume | Same platform id; registration reactivated with **incremented generation** |
| Fork | New platform id, with `forked_from_id`; never inherits the parent's claim |
| Two new sessions, same worktree | Distinct ids |
| Two simultaneous resumes of one thread | Fails closed (thread-store writer conflict) |
| Subagent | Carries the **parent's** `session_id` plus `agent_id`; subordinate actor under the parent's registration, scope, and fence. Cannot independently claim an item in v1 |

Separation of two sessions in one worktree is by native platform id. **Never** by cwd, and never
via a cwd-keyed runtime singleton file. `cwd`, machine id, repo identity, model, version, and
entrypoint are recorded context and policy inputs, not identity keys.

### 4.4 Failure behaviour

An agent-launched CLI that cannot produce a matching native id **cannot enter full mode**. A
manual CLI outside an agent is read-only/admin until the user selects a registration explicitly.
Mismatch, absent binding, changed hook hash, stale generation, or a simultaneous registration CAS
all fail closed.

## 5. Architecture

Two planes over one pluggable backend.

```
agent turn ──> hook ──> local presence file        (instant, no network, no tokens)
                 │
                 └────> local inbox drain ──> injected context   (push, not poll)

control plane  : append-only commit chain at refs/baton-pass/state       (authoritative)
presence plane : one ref per session at refs/baton-pass/presence/<id>    (advisory)
```

Agents write local files. Network cost lives in the CLI at decision points and in a
throttled background flusher — never on the agent's critical path.

## 6. Backend adapter

The control and presence planes speak to an adapter exposing exactly: **read**, **expected-OID
compare-and-swap**, **ref listing**, and **object access**.

| Backend | Applies when | CAS mechanism |
|---|---|---|
| `common-dir` | All participants resolve the **same absolute `--git-common-dir`** (linked worktrees) | `git update-ref <ref> <new> <expected-old>` |
| `remote` | Otherwise, including independent clones on one machine | `git push --force-with-lease=<ref>:<expected-oid>` |

Both verified empirically. Local CAS rejects a stale expected-old with exit 128 and preserves the
winner; remote CAS rejects with `(stale info)`. GitHub accepts the custom `refs/baton-pass/*`
namespace. Measured SSH round trip on the reference connection: **4.5–6 s**; local: sub-millisecond.

**"Same machine" is not sufficient for `common-dir`.** Independent clones have distinct ref
namespaces.

`coordination_backend_id` (kind plus stable repository identity) is pinned in epoch genesis and
verified by every participant before registration. **Never silently fall back between backends** —
that would create split authority. Migration requires quiescence and a new epoch.

The validator and integration gate consume the adapter and must not assume a remote. Because git
refuses to check out one branch in two linked worktrees, integration uses a dedicated integration
worktree or ref plumbing.

## 7. Control plane

`refs/baton-pass/state` points to an append-only commit chain. Every commit has exactly one parent
(except genesis), and **its parent must equal the explicit leased OID**. The tree holds canonical
`state.json` plus one `event.json`.

The chain — not a reusable blob — is what closes the **ABA hazard**: a blob whose content cycles
back to an earlier value recreates the earlier OID, letting a stale lease win. Claim → release →
re-claim produces byte-identical state, so this is reachable in practice.

```json
{
  "schema_version": 1,
  "epoch_id": "<uuid>",
  "revision": 42,
  "parent_oid": "<full-git-oid>",
  "plan_commit_oid": "<full-git-oid>",
  "plan_blob_oid": "<full-git-oid>",
  "plan_revision": 1,
  "event_id": "<uuid>",
  "event_type": "claim",
  "actor": { "registration_id": "<uuid>", "registration_generation": 1,
             "platform_actor_id": null },
  "recorded_at_advisory": "<RFC3339 UTC>"
}
```

`revision` strictly increments. Readers validate the chain segment before trusting state.

### 7.1 Events

| Event | Notes |
|---|---|
| `register` | Under CAS, allocates a never-reused ordinal for `(epoch, family, machine_id)` and returns `display_identity` + `registration_generation`. Sessions never choose their own ordinal. Carries capability evidence and probe nonce |
| `claim` | Actor fence, `item_id`, `claim_id`, incremented item `claim_generation`, `base_oid`, private `branch_ref`, `head_oid_at_claim`, **entire effective write boundary**, contract hashes, `lease_duration_ms`, `expires_at_advisory`, mode. CAS requires dependencies satisfied, no live claim, no unordered scope overlap |
| `scope-change` | Additions only, with current fence and prior effective-scope digest. Always a blocking CAS. Rejects overlap with any unordered item's reserved boundary — even unclaimed ones. Shrinking forbidden while work is unintegrated |
| `contract-changed` | Atomically blocks the reporting claim and all active consumers. Cannot be acknowledged away; only a plan revision resolves it |
| `done` | Immutable result `head_oid`, commit range, actual-path manifest + digest, contract hashes, verification results, validator report digest. **Does not release scope** — the reservation holds until `integrated` |
| `release` / `cancel` | Explicit relinquish |
| `end-session` | Session tombstone |
| `validation-failed` | Keeps the claim blocked for diagnosis |
| `integration-started` / `integrated` / `integration-aborted` | Integration gate transitions |
| `plan-revision-started` / `plan-revised` | §12 |

The item fencing token is `(epoch_id, item_id, claim_generation, claim_id)`.

### 7.2 Time

**The only authoritative ordering is `(control revision, commit-parent chain)`.** Every wall-clock
field is advisory and **named with an `_advisory` suffix** so consumers cannot mistake it for
authority. No v1 ownership, fencing, recovery, release, or integration transition may branch on a
timestamp.

v1 records `lease_duration_ms` and the revision/generation at issue or renewal, preserving lineage
for migration. Monotonic clocks are unsuitable across machines (no shared origin; reboot breaks
continuity) and git commit timestamps are writer-supplied. **v1.1 automatic takeover therefore
requires an authoritative time/lease source plus a successful CAS to fence the old holder.** Until
then, takeover is manual.

## 8. `plan.json`

Committed by the human at `.baton-pass/plan.json`. Strict JSON, hand-editable, single source of
truth for the partition.

```json
{
  "schema_version": 1,
  "plan_id": "coordination-v1",
  "plan_revision": 1,
  "base_oid": "<full-git-oid>",
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
- Paths are repo-relative, `/`-separated, Unicode-normalised; may not contain `..`, absolute roots,
  `.git`, or Baton runtime/control paths. Validation rejects two entries that normalise to the same
  path under either participating filesystem's case behaviour. Symlink targets outside the
  repository are not coordinate-able and are never treated as owned output.
- `prefer` is an ordered hint by agent family, never ownership.
- `depends_on` must form a DAG. Item and contract ids are unique and stable.
- `verify[].argv` runs **without a shell**.

**Plan validation** checks scope intersection for every unordered item pair, rejects overlaps,
verifies contract hashes at `base_oid`, ensures contract paths are not writable by consumers,
checks the integration ref syntax, and pins the plan blob and commit OIDs into the epoch.

Because the whole boundary is reserved at claim time, a poor partition costs **concurrency, not
integrity**: too broad serialises work; too narrow triggers an early, blocking scope-change. It can
never silently authorise two unordered writers on one path. A bad partition surfaces at *claim*
time rather than at merge time.

Ergonomics: `pair plan init`, `pair plan validate`, with concrete diagnostics
(`items cli-control and board overlap at lib/control/`).

## 9. Presence plane

One ref per session: `refs/baton-pass/presence/<registration_id>`, pointing to a small commit whose
parent is that session's prior presence commit.

Payload: `epoch_id`, `registration_id`, `registration_generation`, `seq`, `observed_at_advisory`,
`status`, `item_id`, `claim_generation`, `base_oid`, `head_oid`, `observed_paths`,
`last_control_revision`.

### 9.1 Writer algorithm

"Single writer" is a *logical* identity — multiple detached hook processes are *physical* writers,
so unconditional force-push is unsafe even for one session.

1. Every local event atomically replaces `latest.json` with a strictly increasing `seq` scoped to
   `(epoch_id, registration_id, registration_generation)`.
2. A per-session single-flight flusher coalesces beats.
3. Every remote update uses explicit-OID CAS against the last observed OID — part of the same push,
   so it costs no extra round trip.
4. On stale rejection, read the winner. If its generation is newer or its `seq` is greater or equal,
   **discard** the local beat; otherwise retry with the winner's OID as the new lease.
5. Readers keep the highest `(registration_generation, seq)` seen and never render a lower value.
   Reader guarding prevents UI regression but does not replace writer CAS — a freshly started board
   has no high-water mark.

Presence flushing is detached and never blocks a turn.

### 9.2 Observed paths

Computed from the claim's immutable `base_oid` through `HEAD`, **unioned with staged, unstaged, and
untracked paths**, NUL-delimited, path-normalised.

`git diff --name-only` alone is wrong: it omits untracked files and forgets committed work once the
tree is clean.

**Rename detection must be disabled** (or both sides retained) so a rename appears as touching both
old and new paths. Explanatory rename/type-change metadata is deferred to v1.1 only because the
path union already *detects* the collision.

### 9.3 Polling and GC

One `ls-remote 'refs/baton-pass/presence/*'` at a time. Visible board: schedule the next poll after
completion at `max(15s, 3 × EWMA_RTT)`; after unchanged results back off through 30/60/120 s. Hidden
board: 60–120 s or off. Never poll every 5 s when one request takes ~5 s. Fetch only changed refs.

Clean shutdown writes a final tombstone, commits the control `end-session` event, then deletes its
presence ref with an explicit lease. After a crash, any board or CLI may delete a presence ref only
once control says that exact incarnation ended or its lease expired beyond a **24 h retention
grace**, again with an explicit lease. `baton-pass pair gc` provides manual cleanup. Deleting an
advisory ref is never claim takeover.

## 10. Hooks, capability probe, and modes

### 10.1 Hook roles

| Event | Role |
|---|---|
| `UserPromptSubmit` | Drain the local inbox; inject concise context |
| `PreToolUse` | Deny structured edits outside the claimed boundary |
| `PostToolUse` | Refresh presence; detect drift for paths not knowable in advance |
| `Stop` | Emit the post-turn beat |

Codex ships these as **plugin-bundled hooks** (`hooks/hooks.json` or declared in
`.codex-plugin/plugin.json`), so users do not hand-edit `config.toml`. Hooks are skipped until the
user reviews and trusts the exact hash via `/hooks`, and a plugin update changes the hash and
requires re-review. Onboarding is: install → review in `/hooks` → `pair doctor` → observe nonce
proofs → register.

A hook cannot wake an idle session; events arrive at the next turn boundary.

### 10.2 Capability probe

Registration records **evidence, not self-declared booleans**. Probe independently: control
fetch/read, expected-lease CAS, local runtime directory, plugin discovery, hook hash trusted,
`UserPromptSubmit` execution and inbox injection, `Stop` execution and beat, structured `PreToolUse`
denial, `PostToolUse` observation, presence push/read, and **hook-payload/agent-CLI identity
equality for one issued nonce**.

The hook writes the nonce plus event name, platform session id, hook hash, CLI version, and
timestamp into plugin data. The registrar accepts only the fresh nonce it issued. Hook
acknowledgements continue during work; a missing expected proof or changed hook hash **immediately
downgrades** the session. Platform name never substitutes for observed capability.

### 10.3 Modes

Two user-facing modes; internally a capability bitset. Presence health
(`online`/`stale`/`offline`) is a separate indicator.

**Full** — control read/CAS passed, atomic registration completed, plan validated, hooks trusted
with live nonce proofs from **every concurrently writing registration**, local runtime storage
works. Permits up to `max_concurrent_writers` claims whose boundaries the plan proves unordered and
disjoint.

**Degraded** — any automatic hook, injection, or guard proof absent or stale. Control grants **at
most one global write claim**; others may do read-only work. Claims, sync, scope changes, `done`,
and validation become explicit CLI moves. The UI permanently labels real-time collision and inbox
protection unavailable. The validator remains mandatory. **No silent upgrade** — full mode begins
only after fresh probes pass.

If control CAS is unavailable, neither mode grants a new write claim. Offline work may be preserved
privately but cannot be marked done or integrated until control is reachable and its fence current.

## 11. Collision handling

Prevention is **claim-time reservation of the whole static boundary**, not post-hoc observation.
Observing touched paths detects a collision only after the writers have already edited.

Layered response, weakest to strongest:

1. **`PreToolUse` denial** (v1.0.0) — deny structured edits (`apply_patch`/Edit/Write and tool calls
   with explicit paths) outside the claimed boundary. Arbitrary shell cannot be perfectly
   classified, so this is an **economic guardrail, not the security boundary**. It ships in v1
   because without it the wasted-work window is unbounded: one autonomous turn may run for hours
   before `Stop` while editing out of scope.
2. **Self-blocking** — when the local guard observes drift or a contract change, that session
   **synchronously records its own claim as `blocked`**. A board must never unilaterally freeze
   authoritative state; a delayed or false beat could halt valid work. Third-party quarantine is
   v1.1.
3. **Inbox alert** — cross-machine presence raises a notice, injected at the next turn boundary.
4. **Pre-integration validator** (§12) — the hard, fail-closed guarantee.

### 11.1 In-flight remediation

"In flight" means **the currently executing tool call may return**. It never authorises another
ordinary edit. After detection the claim is `blocked`; the session may read, diagnose, revert or
move out-of-scope work, and commit a preservation checkpoint on its private branch. That commit is
**quarantined by state** — it cannot produce `done`, pass validation, or enter integration until
scope is reconciled. Recoverability without reopening authority.

## 12. Pre-integration validator

Fail-closed, item-slice based. This is the load-bearing integrity guarantee, and it does not depend
on hooks working.

1. Fetch the integration branch and control ref via the adapter; validate ref names and OID formats.
2. Validate the control chain to its trusted epoch genesis: parent links, monotonic revision, epoch,
   event ids, pinned plan OIDs.
3. **CAS-acquire `integration-started`** for one item against that exact control OID and integration
   head. Closes the snapshot-to-push TOCTOU and blocks claim/scope/plan transitions for the item.
4. Load and validate the pinned plan and schema. Recheck DAG, contract hashes at base, static scope
   intersections. **Reject if any plan-revision gate is active.**
5. Verify the integrating registration and mode; the item's owner, claim id and generation; status
   `done`; unblocked; **not a stale registration generation**; dependencies already integrated.
6. Fetch the immutable done head; require expected ancestry from `base_oid`, the declared commit
   range, and no uncommitted local changes.
7. Compute changed paths from the authoritative git range **with rename detection disabled**.
   Require every path inside effective scope and outside forbidden Baton/control paths. Compare to
   the `done` manifest and digest.
8. Re-hash every contract at the result head. Any mismatch without an approved plan revision blocks
   all affected items.
9. Compare actual paths against already-integrated ownership manifests. Overlap is allowed only when
   the plan's dependency edges strictly order the items.
10. Run configured `verify[].argv` without a shell; record exit code and output digest. Missing
    tools and timeouts fail explicitly. No command is silently skipped.
11. No-write merge analysis against the leased integration head. **v1 requires conflict-free output**
    — any conflict goes to explicit human reconciliation. No agent silently edits another owner's
    files.
12. Emit a validation report bound to epoch, plan OIDs, control revision, integration head, claim
    fence, result head, path and contract digests, and verification results.
13. Create the merge commit with the leased integration head as first parent, verify its tree, push
    the integration branch with an explicit expected-head lease.
14. CAS-write `integrated` with the merge OID and report digest; release the item's reservation and
    gate.

Failure before the branch push leaves integration unchanged. Invariant violations write
`validation-failed` and keep the claim blocked. Transient races retry or release without pretending
success. A stale integration head restarts from step 1. **If the branch push succeeded but the final
CAS did not, recovery recognises the event id and completes rather than merging twice.**

## 13. Merge flow

Two tiers:

- Agents merge their own completed slices into a **shared integration branch**, so dependencies
  unblock without a human in the loop. `done` = validated and merged to integration.
- The gate out is a **single PR: integration → `main`**, reviewed by the human.

An agent may resolve a conflict only in files it owns per the plan. Any conflict touching another
owner's files raises a control event and stops.

## 14. Plan revision

Advancing `main` alone does **not** stale a plan pinned to an immutable `base_oid`. Staleness occurs
only when pair mode intentionally advances its integration base or accepts a contract change.

`pair plan revise` is allowed only at a **quiescent boundary**: no integration gate, no active
claims, nothing `done` awaiting integration. Work must first integrate, release, or be explicitly
cancelled or privately preserved.

CAS-acquire a global `plan-revision-started` gate against exact control and integration OIDs. If
absorbing upstream, a human or CLI advances the integration branch under that gate; the new
`base_oid` must equal the resulting integration head and contract hashes are recomputed there.
Validate schema, DAG, scopes, contracts, stable item ids, and the immutable history of already
integrated items. Publish and pin the new plan commit and blob, then CAS `plan-revised` with
`plan_revision + 1`, new OIDs, and a `supersedes` link. **All old claim and validator fences become
invalid.** Release the gate only after the state transition; recovery is idempotent.

## 15. Board

A long-lived local process. It renders control state plus presence, and runs the collision monitor
as a set intersection over observed paths — roughly fifty lines, **not a third agent**.

The board never holds authority. It cannot freeze a claim, and correctness never depends on it
running. Local sessions update via filesystem events (sub-second); remote sessions via §9.3 polling.

Lanes are rendered from a **data-driven list**, never two hardcoded slots.

## 16. Concurrency generality

The product may be called "pair mode", but **no schema, adapter, or invariant may encode two**.

- Express the limit as `max_concurrent_writers = K`; v1 **policy** sets K=2.
- Use collections — `participants`, `claim_ids`, `conflicts` — and universal or pairwise
  quantifiers.
- Never use `peer`, `other`, `agent_a`/`agent_b`, or "both" in schemas or invariants.
- Scope disjointness quantifies over **item pairs**, not agent pairs, and is already K-agnostic.
- Polling, GC, recovery, quiescence, and collision notices quantify over all live registrations.

Nothing structural blocks a third writer. Registration ordinals, per-session presence refs, and
pairwise scope validation all generalise. Costs that *do* grow with K: ref advertisement bytes,
object fetching, board processing, GC, and control-CAS retry amplification under synchronised
writers — which needs randomised exponential backoff, jitter, and fairness. At remote RTT of
4.5–6 s this is a throughput ceiling, not a correctness limit. Enabling K>2 in v1.1+ requires load
and UX validation, **not a correctness-model rewrite**.

## 17. Scope

**v1.0.0** — append-only control chain with CAS fences; static whole-boundary claims; contract
enforcement; `PreToolUse`/`PostToolUse` guards; self-blocking; the validator; two modes; identity
probes; leased advisory presence; both backends; the board; two-tier merge; explicit manual recovery.

**v1.1** — automatic expired-claim and integration-gate takeover (requires an authoritative time
source, §7.2); third-party quarantine; explanatory rename metadata; Cloudflare transport;
usage-aware auto-handoff.

**v2** — three or more concurrent writers as a supported configuration.

## 18. Declared constraints

- Cooperative threat model (§3).
- Manual recovery in v1: expired claims and gates are advisory fields, not automatic authority
  transfer. The CLI fails closed and prints a precise recovery command.
- Restricted scope syntax reduces achievable concurrency in exchange for decidable intersection.
- Pair mode is **purely additive**. Sequential Baton Pass users see no change.
