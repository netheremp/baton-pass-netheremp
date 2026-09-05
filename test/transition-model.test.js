'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  EVENT_TYPES,
  RejectReason,
  boundariesOverlap,
  createInitialState,
  scopeDigest,
  transition,
  validateState,
} = require('../lib/pair/transition-model')

let sequence = 0

function oid(label = 'control') {
  sequence += 1
  return `${label}-${sequence}`
}

function genesis(overrides = {}) {
  const config = {
    controlOid: oid('genesis'),
    epoch: {
      id: 'epoch-1',
      predecessorId: null,
      coordinationBackendId: 'common-dir:repo-1',
      refPrefix: 'refs/baton-pass/',
      maxConcurrentWriters: 2,
      integrationHeadOid: 'head-0',
    },
    plan: {
      ref: 'refs/baton-pass/e/epoch-1/plan/1',
      commitOid: 'plan-commit-1',
      blobOid: 'plan-blob-1',
      baseOid: 'head-0',
      items: [
        { id: 'alpha', dependsOn: [], boundary: [{ kind: 'tree', path: 'src/alpha/' }], contracts: ['api'] },
        { id: 'beta', dependsOn: [], boundary: [{ kind: 'tree', path: 'src/beta/' }], contracts: ['api'] },
        { id: 'after-alpha', dependsOn: ['alpha'], boundary: [{ kind: 'file', path: 'src/shared.js' }], contracts: [] },
      ],
    },
  }
  if (overrides.planItems) config.plan.items = overrides.planItems
  if (overrides.maxConcurrentWriters) config.epoch.maxConcurrentWriters = overrides.maxConcurrentWriters
  const result = createInitialState(config)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.state
}

function envelope(state, type, fields = {}) {
  return {
    type,
    eventId: oid(`event-${type}`),
    epochId: state.epoch.id,
    expectedControlOid: state.controlOid,
    ...fields,
  }
}

function facts(state, fields = {}) {
  return {
    observedControlOid: state.controlOid,
    nextControlOid: oid('control'),
    ...fields,
  }
}

function apply(state, type, eventFields = {}, factFields = {}) {
  const result = transition(state, envelope(state, type, eventFields), facts(state, factFields))
  assert.equal(result.ok, true, `${type}: ${JSON.stringify(result.reject)}`)
  return result.state
}

function rejected(result, reason) {
  assert.equal(result.ok, false)
  assert.equal(result.reject.reason, reason, JSON.stringify(result.reject))
}

function ready(state = genesis()) {
  return apply(state, 'epoch-ready', {}, { initializationValidated: true })
}

function registrationEvent(id, session, machine = id) {
  return {
    platformKind: 'codex',
    platformSessionId: session,
    registrationId: id,
    machineId: machine,
    machineLabel: machine,
    family: 'codex',
    hookHash: 'hook-v1',
    nextPendingChallenge: { nonce: `nonce-${id}-1` },
  }
}

function register(state, id, session, machine = id) {
  return apply(state, 'register', registrationEvent(id, session, machine), { machineAndPathValid: true })
}

function actor(state, id) {
  return {
    registrationId: id,
    registrationGeneration: state.registrations[id].generation,
    platformActorId: null,
  }
}

function upgrade(state, id) {
  const registration = state.registrations[id]
  return apply(state, 'capability-upgrade', {
    actor: actor(state, id),
    proof: {
      nonce: registration.nextPendingChallenge.nonce,
      platformSessionId: registration.platformSessionId,
      hookHash: registration.hookHash,
      runtimeVersion: '1.0.0',
    },
    nextPendingChallenge: { nonce: `${registration.nextPendingChallenge.nonce}-next` },
  }, { capabilityProofAccepted: true })
}

function registeredFull(ids = ['r1']) {
  let state = ready()
  for (const id of ids) {
    state = register(state, id, `session-${id}`)
    state = upgrade(state, id)
  }
  return state
}

function claim(state, registrationId, itemId, claimId, generation = 1) {
  return apply(state, 'claim', {
    actor: actor(state, registrationId),
    itemId,
    claimId,
    claimGeneration: generation,
    claimBaseOid: state.epoch.integrationHeadOid,
    branchRef: `refs/heads/private/${claimId}`,
    effectiveBoundary: state.plan.items[itemId].boundary,
    contractHashes: { api: 'sha256:ok' },
    leaseDurationMs: 60_000,
    expiresAtAdvisory: '2099-01-01T00:00:00Z',
    mode: state.registrations[registrationId].mode,
  }, {
    privateBranchAbsent: true,
    contractsMatch: true,
  })
}

function claimFence(state, registrationId, itemId, claimId, extra = {}) {
  return {
    actor: actor(state, registrationId),
    itemId,
    claimId,
    claimGeneration: state.claims[claimId].generation,
    ...extra,
  }
}

function done(state, registrationId, itemId, claimId, generation = 1, candidateRef = `refs/result/${claimId}/${generation}`) {
  const candidates = state.claims[claimId].candidates
  const previous = candidates[candidates.length - 1]
  const fields = claimFence(state, registrationId, itemId, claimId, {
    candidateGeneration: generation,
    candidateRef,
    candidateOid: `candidate-${claimId}-${generation}`,
    commitRange: [state.claims[claimId].claimBaseOid, `candidate-${claimId}-${generation}`],
    actualPaths: [`src/${itemId}/change.js`],
    manifestDigest: `manifest-${generation}`,
    contractHashes: { api: 'sha256:ok' },
    preflightReportDigest: `preflight-${generation}`,
    supersedesCandidateRef: previous ? previous.ref : undefined,
  })
  return apply(state, 'done', fields, {
    candidate: {
      published: true,
      expectedAbsent: true,
      ref: fields.candidateRef,
      oid: fields.candidateOid,
      generation,
      ancestryValid: true,
      manifestMatches: true,
      contractsMatch: true,
    },
  })
}

function integrationStarted(state, registrationId, itemId, claimId, attemptId) {
  return apply(state, 'integration-started', claimFence(state, registrationId, itemId, claimId, {
    integrationAttemptId: attemptId,
    integrationHeadOid: state.epoch.integrationHeadOid,
  }), { integrationHeadOid: state.epoch.integrationHeadOid })
}

function integratedFields(state, registrationId, itemId, claimId, attemptId) {
  const gate = state.integrationGate
  return claimFence(state, registrationId, itemId, claimId, {
    integrationAttemptId: attemptId,
    mergeOid: `merge-${attemptId}`,
    reportRef: `refs/report/${attemptId}`,
    reportOid: `report-${attemptId}`,
    candidateRef: gate.candidateRef,
    candidateOid: gate.candidateOid,
    candidateGeneration: gate.candidateGeneration,
    firstParentOid: gate.integrationHeadOid,
    secondParentOid: gate.candidateOid,
    prospectiveTreeOid: `tree-${attemptId}`,
  })
}

function landedFacts(state, fields) {
  return {
    integrationRefOid: fields.mergeOid,
    merge: {
      oid: fields.mergeOid,
      integrationAttemptId: fields.integrationAttemptId,
      reportRef: fields.reportRef,
      reportOid: fields.reportOid,
      parents: [fields.firstParentOid, fields.secondParentOid],
      treeOid: fields.prospectiveTreeOid,
    },
    report: {
      published: true,
      expectedAbsent: true,
      ref: fields.reportRef,
      oid: fields.reportOid,
      integrationAttemptId: fields.integrationAttemptId,
      candidateRef: fields.candidateRef,
      candidateOid: fields.candidateOid,
      candidateGeneration: fields.candidateGeneration,
      integrationHeadOid: fields.firstParentOid,
      prospectiveTreeOid: fields.prospectiveTreeOid,
    },
  }
}

test('plan validation rejects unordered overlapping boundaries', () => {
  const result = createInitialState({
    controlOid: 'g',
    epoch: { id: 'e', coordinationBackendId: 'b', refPrefix: 'refs/b/', maxConcurrentWriters: 2, integrationHeadOid: 'h' },
    plan: {
      ref: 'p', commitOid: 'pc', blobOid: 'pb', baseOid: 'h',
      items: [
        { id: 'a', dependsOn: [], boundary: [{ kind: 'tree', path: 'src/' }] },
        { id: 'b', dependsOn: [], boundary: [{ kind: 'file', path: 'src/x.js' }] },
      ],
    },
  })
  rejected(result, RejectReason.INVALID_STATE)
})

test('every declared event is total on a valid state', () => {
  const state = ready()
  for (const type of EVENT_TYPES) {
    const result = transition(state, envelope(state, type), facts(state))
    assert.equal(typeof result.ok, 'boolean', type)
    assert.ok(result.ok || result.reject.reason, type)
  }
  rejected(transition(state, envelope(state, 'invented'), facts(state)), RejectReason.UNKNOWN_EVENT)
})

test('a stale expected OID loses and succeeds only after rereading', () => {
  const state = ready()
  const firstEvent = envelope(state, 'register', registrationEvent('r1', 's1'))
  const secondEvent = envelope(state, 'register', registrationEvent('r2', 's2'))
  const firstFacts = facts(state, { machineAndPathValid: true })
  const secondFacts = facts(state, { machineAndPathValid: true })
  const first = transition(state, firstEvent, firstFacts)
  assert.equal(first.ok, true)
  rejected(transition(first.state, secondEvent, secondFacts), RejectReason.STALE_CONTROL_OID)

  const retry = transition(first.state, {
    ...secondEvent,
    eventId: oid('retry-register'),
    expectedControlOid: first.state.controlOid,
  }, facts(first.state, { machineAndPathValid: true }))
  assert.equal(retry.ok, true)
  assert.equal(Object.keys(retry.state.registrations).length, 2)
})

test('append-only control lineage rejects an ABA OID reuse', () => {
  let state = ready()
  const oldOid = state.controlOid
  state = register(state, 'r1', 's1')
  const event = envelope(state, 'capability-downgrade', { actor: actor(state, 'r1') })
  const result = transition(state, event, {
    observedControlOid: state.controlOid,
    nextControlOid: oldOid,
    localLatchSet: true,
  })
  rejected(result, RejectReason.CONTROL_OID_REUSED)
})

test('simultaneous same-session registrations have one winner in either order', () => {
  for (const reverse of [false, true]) {
    const state = ready()
    const contenders = [
      envelope(state, 'register', registrationEvent('r1', 'same-session', 'm1')),
      envelope(state, 'register', registrationEvent('r2', 'same-session', 'm2')),
    ]
    if (reverse) contenders.reverse()
    const winner = transition(state, contenders[0], facts(state, { machineAndPathValid: true }))
    assert.equal(winner.ok, true)
    rejected(transition(winner.state, contenders[1], {
      observedControlOid: state.controlOid,
      nextControlOid: oid('loser'),
      machineAndPathValid: true,
    }), RejectReason.STALE_CONTROL_OID)
    const retry = transition(winner.state, {
      ...contenders[1],
      eventId: oid('retry'),
      expectedControlOid: winner.state.controlOid,
    }, facts(winner.state, { machineAndPathValid: true }))
    rejected(retry, RejectReason.BINDING_EXISTS)
  }
})

test('machine labels are shared only by the same machine id', () => {
  let state = ready()
  state = register(state, 'r1', 's1', 'machine-1')
  const sameMachine = transition(state,
    envelope(state, 'register', { ...registrationEvent('r2', 's2', 'machine-1'), machineLabel: 'machine-1' }),
    facts(state, { machineAndPathValid: true }))
  assert.equal(sameMachine.ok, true)
  assert.equal(sameMachine.state.registrations.r2.ordinal, 2)

  const otherMachine = transition(sameMachine.state,
    envelope(sameMachine.state, 'register', { ...registrationEvent('r3', 's3', 'machine-2'), machineLabel: 'machine-1' }),
    facts(sameMachine.state, { machineAndPathValid: true }))
  rejected(otherMachine, RejectReason.MACHINE_LABEL_TAKEN)
})

test('capability upgrade requires fresh proof; downgrade requires only the prior local latch', () => {
  let state = register(ready(), 'r1', 's1')
  const missingProof = transition(state,
    envelope(state, 'capability-upgrade', { actor: actor(state, 'r1') }),
    facts(state))
  rejected(missingProof, RejectReason.FRESH_PROOF_REQUIRED)

  state = upgrade(state, 'r1')
  const acceptedNonce = state.registrations.r1.lastAcceptedCapabilityProof.nonce
  assert.notEqual(acceptedNonce, state.registrations.r1.nextPendingChallenge.nonce)
  assert.equal(state.registrations.r1.mode, 'full', 'new pending challenge must not stale accepted proof')

  const noLatch = transition(state,
    envelope(state, 'capability-downgrade', { actor: actor(state, 'r1') }),
    facts(state))
  rejected(noLatch, RejectReason.LOCAL_LATCH_UNPROVEN)
  state = apply(state, 'capability-downgrade', { actor: actor(state, 'r1') }, { localLatchSet: true })
  assert.equal(state.registrations.r1.mode, 'degraded')
})

test('a new probing registration cannot claim by calling itself degraded', () => {
  let state = register(ready(), 'r1', 's1')
  const eventFields = {
    actor: actor(state, 'r1'), itemId: 'alpha', claimId: 'claim-a', claimGeneration: 1,
    claimBaseOid: 'head-0', branchRef: 'refs/private/a', effectiveBoundary: state.plan.items.alpha.boundary,
    mode: 'degraded',
  }
  rejected(transition(state, envelope(state, 'claim', eventFields), facts(state, {
    privateBranchAbsent: true,
    contractsMatch: true,
  })), RejectReason.FRESH_PROOF_REQUIRED)

  state = apply(state, 'capability-downgrade', { actor: actor(state, 'r1') }, { localLatchSet: true })
  rejected(transition(state, envelope(state, 'claim', { ...eventFields, actor: actor(state, 'r1') }), facts(state, {
    privateBranchAbsent: true,
    contractsMatch: true,
  })), RejectReason.FRESH_PROOF_REQUIRED)
})

test('stale registration generations are fenced after atomic reactivation', () => {
  let state = registeredFull(['r1'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  const oldActor = actor(state, 'r1')
  const registration = state.registrations.r1
  state = apply(state, 'reactivate', {
    actor: oldActor,
    platformKind: registration.platformKind,
    platformSessionId: registration.platformSessionId,
    mode: 'full',
    proof: {
      nonce: registration.nextPendingChallenge.nonce,
      platformSessionId: registration.platformSessionId,
      hookHash: registration.hookHash,
      runtimeVersion: '1.0.0',
    },
    nextPendingChallenge: { nonce: 'reactivated-next' },
  }, { capabilityProofAccepted: true })
  assert.equal(state.claims['claim-a'].owner.registrationGeneration, 2)

  const stale = transition(state, envelope(state, 'lease-renew', {
    actor: oldActor,
    itemId: 'alpha',
    claimId: 'claim-a',
    claimGeneration: 1,
  }), facts(state))
  rejected(stale, RejectReason.STALE_REGISTRATION_GENERATION)
})

test('simultaneous reactivations have one generation winner and fence the loser', () => {
  const state = register(ready(), 'r1', 's1')
  const base = {
    actor: actor(state, 'r1'),
    platformKind: 'codex',
    platformSessionId: 's1',
    mode: 'degraded',
  }
  const firstEvent = envelope(state, 'reactivate', { ...base, nextPendingChallenge: { nonce: 'resume-1' } })
  const secondEvent = envelope(state, 'reactivate', { ...base, nextPendingChallenge: { nonce: 'resume-2' } })
  const first = transition(state, firstEvent, facts(state))
  assert.equal(first.ok, true)
  assert.equal(first.state.registrations.r1.generation, 2)
  rejected(transition(first.state, secondEvent, {
    observedControlOid: state.controlOid,
    nextControlOid: oid('stale-resume'),
  }), RejectReason.STALE_CONTROL_OID)
  const retry = transition(first.state, {
    ...secondEvent,
    eventId: oid('retry-resume'),
    expectedControlOid: first.state.controlOid,
  }, facts(first.state))
  rejected(retry, RejectReason.STALE_REGISTRATION_GENERATION)
})

test('reactivation is rejected while an owned claim is integrating', () => {
  let state = registeredFull(['r1'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  state = done(state, 'r1', 'alpha', 'claim-a')
  state = integrationStarted(state, 'r1', 'alpha', 'claim-a', 'attempt-a')
  const registration = state.registrations.r1
  const result = transition(state, envelope(state, 'reactivate', {
    actor: actor(state, 'r1'),
    platformKind: registration.platformKind,
    platformSessionId: registration.platformSessionId,
    mode: 'degraded',
    nextPendingChallenge: { nonce: 'resume' },
  }), facts(state))
  rejected(result, RejectReason.INTEGRATION_GATE_HELD)
})

test('claims reject unmet dependencies and a held integration gate', () => {
  let state = registeredFull(['r1', 'r2'])
  const dependency = transition(state,
    envelope(state, 'claim', {
      actor: actor(state, 'r2'), itemId: 'after-alpha', claimId: 'too-early', claimGeneration: 1,
      claimBaseOid: 'head-0', branchRef: 'refs/private/early', effectiveBoundary: state.plan.items['after-alpha'].boundary,
      mode: 'full',
    }),
    facts(state, { privateBranchAbsent: true, contractsMatch: true }))
  rejected(dependency, RejectReason.DEPENDENCY_NOT_INTEGRATED)

  state = claim(state, 'r1', 'alpha', 'claim-a')
  state = done(state, 'r1', 'alpha', 'claim-a')
  state = integrationStarted(state, 'r1', 'alpha', 'claim-a', 'attempt-a')
  const gated = transition(state,
    envelope(state, 'claim', {
      actor: actor(state, 'r2'), itemId: 'beta', claimId: 'claim-b', claimGeneration: 1,
      claimBaseOid: 'head-0', branchRef: 'refs/private/b', effectiveBoundary: state.plan.items.beta.boundary,
      mode: 'full',
    }),
    facts(state, { privateBranchAbsent: true, contractsMatch: true }))
  rejected(gated, RejectReason.INTEGRATION_GATE_HELD)
})

test('simultaneous disjoint claims use CAS; the loser retries on the new OID', () => {
  const state = registeredFull(['r1', 'r2'])
  const makeClaim = (registrationId, itemId, claimId) => envelope(state, 'claim', {
    actor: actor(state, registrationId), itemId, claimId, claimGeneration: 1,
    claimBaseOid: state.epoch.integrationHeadOid, branchRef: `refs/private/${claimId}`,
    effectiveBoundary: state.plan.items[itemId].boundary, mode: 'full',
  })
  const eventA = makeClaim('r1', 'alpha', 'claim-a')
  const eventB = makeClaim('r2', 'beta', 'claim-b')
  const resultA = transition(state, eventA, facts(state, { privateBranchAbsent: true, contractsMatch: true }))
  assert.equal(resultA.ok, true)
  rejected(transition(resultA.state, eventB, {
    observedControlOid: state.controlOid,
    nextControlOid: oid('stale'),
    privateBranchAbsent: true,
    contractsMatch: true,
  }), RejectReason.STALE_CONTROL_OID)
  const retried = transition(resultA.state, {
    ...eventB,
    eventId: oid('retry-claim'),
    expectedControlOid: resultA.state.controlOid,
  }, facts(resultA.state, { privateBranchAbsent: true, contractsMatch: true }))
  assert.equal(retried.ok, true)
  assert.deepEqual(validateState(retried.state), [])
})

test('scope additions cannot overlap an unordered item reserved boundary, claimed or not', () => {
  let state = registeredFull(['r1'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  const result = transition(state, envelope(state, 'scope-change', claimFence(state, 'r1', 'alpha', 'claim-a', {
    priorScopeDigest: scopeDigest(state.claims['claim-a'].effectiveBoundary),
    additions: [{ kind: 'file', path: 'src/beta/new.js' }],
  })), facts(state))
  rejected(result, RejectReason.BOUNDARY_OVERLAP)
})

test('degraded mode grants at most one global claim', () => {
  let state = registeredFull(['r1', 'r2'])
  state = apply(state, 'capability-downgrade', { actor: actor(state, 'r1') }, { localLatchSet: true })
  state = apply(state, 'capability-downgrade', { actor: actor(state, 'r2') }, { localLatchSet: true })
  state = claim(state, 'r1', 'alpha', 'claim-a')
  const result = transition(state, envelope(state, 'claim', {
    actor: actor(state, 'r2'), itemId: 'beta', claimId: 'claim-b', claimGeneration: 1,
    claimBaseOid: 'head-0', branchRef: 'refs/private/b', effectiveBoundary: state.plan.items.beta.boundary,
    mode: 'degraded',
  }), facts(state, { privateBranchAbsent: true, contractsMatch: true }))
  rejected(result, RejectReason.GLOBAL_WRITER_EXCLUSIVITY_REQUIRED)
})

test('candidate refs and generations are immutable and collision-safe', () => {
  let state = registeredFull(['r1', 'r2'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  state = done(state, 'r1', 'alpha', 'claim-a', 1, 'refs/result/shared')

  const duplicate = transition(state,
    envelope(state, 'done', claimFence(state, 'r1', 'alpha', 'claim-a', {
      candidateGeneration: 1,
      candidateRef: 'refs/result/shared',
      candidateOid: 'candidate-duplicate',
    })),
    facts(state, { candidate: { published: true } }))
  rejected(duplicate, RejectReason.ILLEGAL_ITEM_TRANSITION)

  state = claim(state, 'r2', 'beta', 'claim-b')
  const collisionFields = claimFence(state, 'r2', 'beta', 'claim-b', {
    candidateGeneration: 1,
    candidateRef: 'refs/result/shared',
    candidateOid: 'candidate-b',
  })
  const collision = transition(state, envelope(state, 'done', collisionFields), facts(state, {
    candidate: {
      published: true, expectedAbsent: true, ref: 'refs/result/shared', oid: 'candidate-b', generation: 1,
      ancestryValid: true, manifestMatches: true, contractsMatch: true,
    },
  }))
  rejected(collision, RejectReason.CANDIDATE_COLLISION)
})

test('candidate remediation increments exactly one generation and names its predecessor', () => {
  let state = registeredFull(['r1'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  state = done(state, 'r1', 'alpha', 'claim-a')
  state = integrationStarted(state, 'r1', 'alpha', 'claim-a', 'attempt-a')
  state = apply(state, 'validation-failed', claimFence(state, 'r1', 'alpha', 'claim-a', {
    integrationAttemptId: 'attempt-a',
  }), { invariantViolation: true })
  state = apply(state, 'unblock', claimFence(state, 'r1', 'alpha', 'claim-a'), { reconciliationRecorded: true })

  const skipped = transition(state, envelope(state, 'done', claimFence(state, 'r1', 'alpha', 'claim-a', {
    candidateGeneration: 3,
    candidateRef: 'refs/result/claim-a/3',
    candidateOid: 'candidate-3',
    supersedesCandidateRef: 'refs/result/claim-a/1',
  })), facts(state, { candidate: { published: true } }))
  rejected(skipped, RejectReason.CANDIDATE_GENERATION_MISMATCH)

  state = done(state, 'r1', 'alpha', 'claim-a', 2)
  assert.equal(state.claims['claim-a'].candidates[1].supersedes, 'refs/result/claim-a/1')
  assert.equal(state.claims['claim-a'].candidates[0].supersededBy, 'refs/result/claim-a/2')
})

test('integration requires exact attempt, report, candidate, parents, and prospective tree', () => {
  let state = registeredFull(['r1'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  state = done(state, 'r1', 'alpha', 'claim-a')
  state = integrationStarted(state, 'r1', 'alpha', 'claim-a', 'attempt-a')
  const fields = integratedFields(state, 'r1', 'alpha', 'claim-a', 'attempt-a')
  const bad = landedFacts(state, fields)
  bad.merge.treeOid = 'different-tree'
  rejected(transition(state, envelope(state, 'integrated', fields), facts(state, bad)), RejectReason.INTEGRATION_EVIDENCE_MISMATCH)

  state = apply(state, 'integrated', fields, landedFacts(state, fields))
  assert.equal(state.epoch.integrationHeadOid, 'merge-attempt-a')
  assert.equal(state.integrationGate, null)

  const replay = transition(state, envelope(state, 'integrated', fields), facts(state, landedFacts(state, fields)))
  rejected(replay, RejectReason.ALREADY_INTEGRATED)
  const other = transition(state, envelope(state, 'integrated', { ...fields, integrationAttemptId: 'attempt-b' }), facts(state, landedFacts(state, fields)))
  rejected(other, RejectReason.INTEGRATED_BY_OTHER_ATTEMPT)
})

test('crash recovery finalizes an exact landed attempt once without a second merge', () => {
  let state = registeredFull(['r1'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  state = done(state, 'r1', 'alpha', 'claim-a')
  state = integrationStarted(state, 'r1', 'alpha', 'claim-a', 'attempt-crash')
  const fields = integratedFields(state, 'r1', 'alpha', 'claim-a', 'attempt-crash')
  const evidence = landedFacts(state, fields)
  const recovered = transition(state, envelope(state, 'integrated', fields), facts(state, evidence))
  assert.equal(recovered.ok, true)
  assert.equal(recovered.state.attempts['attempt-crash'].status, 'integrated')
  rejected(transition(recovered.state, envelope(recovered.state, 'integrated', fields), facts(recovered.state, evidence)), RejectReason.ALREADY_INTEGRATED)
})

test('an uncertain integration outcome holds the gate', () => {
  let state = registeredFull(['r1'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  state = done(state, 'r1', 'alpha', 'claim-a')
  state = integrationStarted(state, 'r1', 'alpha', 'claim-a', 'attempt-a')
  const abort = claimFence(state, 'r1', 'alpha', 'claim-a', { integrationAttemptId: 'attempt-a' })
  const result = transition(state, envelope(state, 'integration-aborted', abort), facts(state, { integrationOutcome: 'uncertain' }))
  rejected(result, RejectReason.INTEGRATION_OUTCOME_UNCERTAIN)
  assert.ok(state.integrationGate)
})

test('contract incident during integration preserves recovery and aborts to blocked', () => {
  let state = registeredFull(['r1'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  state = done(state, 'r1', 'alpha', 'claim-a')
  state = integrationStarted(state, 'r1', 'alpha', 'claim-a', 'attempt-a')
  state = apply(state, 'contract-changed', claimFence(state, 'r1', 'alpha', 'claim-a', {
    incidentId: 'incident-1',
    contractId: 'api',
    affectedItemIds: ['alpha'],
  }), { affectedItemsProven: true })
  assert.equal(state.items.alpha.status, 'integrating')
  assert.ok(state.integrationGate)
  assert.equal(state.claims['claim-a'].candidates[0].invalidated, true)

  state = apply(state, 'integration-aborted', claimFence(state, 'r1', 'alpha', 'claim-a', {
    integrationAttemptId: 'attempt-a',
  }), { integrationOutcome: 'not-landed' })
  assert.equal(state.items.alpha.status, 'blocked')
  assert.equal(state.integrationGate, null)
})

test('contract incident invalidates a done candidate and blocks the claim', () => {
  let state = registeredFull(['r1'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  state = done(state, 'r1', 'alpha', 'claim-a')
  state = apply(state, 'contract-changed', claimFence(state, 'r1', 'alpha', 'claim-a', {
    incidentId: 'incident-1', contractId: 'api', affectedItemIds: ['alpha'],
  }), { affectedItemsProven: true })
  assert.equal(state.items.alpha.status, 'blocked')
  assert.equal(state.claims['claim-a'].candidates[0].invalidated, true)
})

test('an exact attempt that landed before a contract incident is still finalized', () => {
  let state = registeredFull(['r1'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  state = done(state, 'r1', 'alpha', 'claim-a')
  state = integrationStarted(state, 'r1', 'alpha', 'claim-a', 'attempt-a')
  const fields = integratedFields(state, 'r1', 'alpha', 'claim-a', 'attempt-a')
  const evidence = landedFacts(state, fields)
  state = apply(state, 'contract-changed', claimFence(state, 'r1', 'alpha', 'claim-a', {
    incidentId: 'incident-1', contractId: 'api', affectedItemIds: ['alpha'],
  }), { affectedItemsProven: true })
  state = apply(state, 'integrated', fields, evidence)
  assert.equal(state.items.alpha.status, 'integrated')
  assert.equal(state.contractIncidents['incident-1'].status, 'open')
})

test('seeded CAS contention never admits more winners than serialized retries', () => {
  let seed = 0x5eed1234
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
  for (let run = 0; run < 100; run += 1) {
    let state = registeredFull(['r1', 'r2'])
    const snapshot = state
    const contenders = [
      envelope(snapshot, 'claim', {
        actor: actor(snapshot, 'r1'), itemId: 'alpha', claimId: `a-${run}`, claimGeneration: 1,
        claimBaseOid: 'head-0', branchRef: `refs/private/a-${run}`, effectiveBoundary: snapshot.plan.items.alpha.boundary, mode: 'full',
      }),
      envelope(snapshot, 'claim', {
        actor: actor(snapshot, 'r2'), itemId: 'beta', claimId: `b-${run}`, claimGeneration: 1,
        claimBaseOid: 'head-0', branchRef: `refs/private/b-${run}`, effectiveBoundary: snapshot.plan.items.beta.boundary, mode: 'full',
      }),
    ]
    if (random() < 0.5) contenders.reverse()
    const first = transition(state, contenders[0], facts(snapshot, { privateBranchAbsent: true, contractsMatch: true }))
    assert.equal(first.ok, true)
    state = first.state
    const stale = transition(state, contenders[1], {
      observedControlOid: snapshot.controlOid,
      nextControlOid: oid('stale-property'),
      privateBranchAbsent: true,
      contractsMatch: true,
    })
    rejected(stale, RejectReason.STALE_CONTROL_OID)
    const retried = transition(state, {
      ...contenders[1], eventId: oid('property-retry'), expectedControlOid: state.controlOid,
    }, facts(state, { privateBranchAbsent: true, contractsMatch: true }))
    assert.equal(retried.ok, true)
    assert.equal(new Set(Object.values(retried.state.claims).filter(c => c.status === 'claimed').map(c => c.owner.registrationId)).size, 2)
    assert.deepEqual(validateState(retried.state), [])
  }
})

test('plan revision and epoch closure require explicit gates, proof, and quiescence', () => {
  let state = registeredFull(['r1'])
  state = apply(state, 'plan-revision-started', {
    nextPlanRevision: 2,
    planRevisionAttemptId: 'plan-attempt-2',
    integrationHeadOid: state.epoch.integrationHeadOid,
  }, {
    humanAuthorized: true,
    integrationHeadOid: state.epoch.integrationHeadOid,
  })
  state = apply(state, 'plan-revised', {
    planRevisionAttemptId: 'plan-attempt-2',
    plan: {
      revision: 2,
      ref: 'refs/baton-pass/e/epoch-1/plan/2',
      commitOid: 'plan-commit-2',
      blobOid: 'plan-blob-2',
      baseOid: state.epoch.integrationHeadOid,
      items: Object.values(state.plan.items).map(item => ({
        id: item.id,
        dependsOn: item.dependsOn,
        boundary: item.boundary,
        contracts: item.contracts,
      })),
    },
  }, {
    humanAuthorized: true,
    proposalPublished: true,
    planValidated: true,
    exactRevisionLanded: true,
    integratedHistoryStable: true,
  })
  assert.equal(state.plan.revision, 2)
  state = apply(state, 'epoch-closed', { integrationHeadOid: state.epoch.integrationHeadOid }, { humanAuthorized: true })
  assert.equal(state.epoch.status, 'closed')
  rejected(transition(state, envelope(state, 'register', registrationEvent('r2', 's2')), facts(state, { machineAndPathValid: true })), RejectReason.EPOCH_CLOSED)
})

test('end-session rejects a registration that still owns a nonterminal claim', () => {
  let state = registeredFull(['r1'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  const result = transition(state, envelope(state, 'end-session', { actor: actor(state, 'r1') }), facts(state))
  rejected(result, RejectReason.ACTIVE_CLAIM_EXISTS)
})

test('ordinary claim lifecycle events have explicit successful transitions', () => {
  let state = registeredFull(['r1'])
  state = claim(state, 'r1', 'alpha', 'claim-a')
  state = apply(state, 'lease-renew', claimFence(state, 'r1', 'alpha', 'claim-a', {
    leaseDurationMs: 120_000,
    expiresAtAdvisory: '2099-01-02T00:00:00Z',
  }))
  assert.equal(state.claims['claim-a'].leaseDurationMs, 120_000)
  state = apply(state, 'scope-change', claimFence(state, 'r1', 'alpha', 'claim-a', {
    priorScopeDigest: state.claims['claim-a'].scopeDigest,
    additions: [{ kind: 'tree', path: 'docs/alpha-extra/' }],
  }))
  assert.equal(state.claims['claim-a'].effectiveBoundary.length, 2)
  state = apply(state, 'block', claimFence(state, 'r1', 'alpha', 'claim-a'), { localLatchSet: true })
  assert.equal(state.items.alpha.status, 'blocked')
  state = apply(state, 'unblock', claimFence(state, 'r1', 'alpha', 'claim-a'), { reconciliationRecorded: true })
  state = apply(state, 'release', claimFence(state, 'r1', 'alpha', 'claim-a'))
  assert.equal(state.items.alpha.status, 'todo')
  assert.equal(state.claims['claim-a'].status, 'released')
  state = apply(state, 'end-session', { actor: actor(state, 'r1') })
  assert.equal(state.registrations.r1.status, 'ended')

  let cancelled = registeredFull(['r1'])
  cancelled = claim(cancelled, 'r1', 'alpha', 'claim-cancel')
  cancelled = apply(cancelled, 'cancel', claimFence(cancelled, 'r1', 'alpha', 'claim-cancel'))
  assert.equal(cancelled.items.alpha.status, 'cancelled')

  let revoked = registeredFull(['r1'])
  revoked = claim(revoked, 'r1', 'alpha', 'claim-revoke')
  revoked = apply(revoked, 'revoke', {
    itemId: 'alpha',
    claimId: 'claim-revoke',
    claimGeneration: 1,
  }, { humanAuthorized: true })
  assert.equal(revoked.items.alpha.status, 'todo')
  assert.equal(revoked.claims['claim-revoke'].status, 'revoked')
})

test('transitions are pure on success and rejection', () => {
  const state = registeredFull(['r1'])
  const before = JSON.stringify(state)
  const successful = transition(state, envelope(state, 'capability-downgrade', { actor: actor(state, 'r1') }), facts(state, { localLatchSet: true }))
  assert.equal(successful.ok, true)
  assert.equal(JSON.stringify(state), before)
  const rejectedResult = transition(state, envelope(state, 'capability-upgrade', { actor: actor(state, 'r1') }), facts(state))
  rejected(rejectedResult, RejectReason.FRESH_PROOF_REQUIRED)
  assert.equal(JSON.stringify(state), before)
})

test('boundary intersection uses segment-aware file/tree semantics', () => {
  assert.equal(boundariesOverlap([{ kind: 'tree', path: 'lib/control/' }], [{ kind: 'file', path: 'lib/control/x.js' }]), true)
  assert.equal(boundariesOverlap([{ kind: 'tree', path: 'lib/control/' }], [{ kind: 'file', path: 'lib/controller.js' }]), false)
})
