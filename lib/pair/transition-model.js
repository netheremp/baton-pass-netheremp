'use strict'

// Stage 1 is deliberately backend-free. The caller supplies every observation that a
// later adapter will obtain from refs, objects, probes, or the local runtime.

const EVENT_TYPES = Object.freeze([
  'epoch-ready',
  'epoch-closed',
  'register',
  'reactivate',
  'capability-upgrade',
  'capability-downgrade',
  'claim',
  'lease-renew',
  'scope-change',
  'contract-changed',
  'block',
  'unblock',
  'done',
  'release',
  'cancel',
  'revoke',
  'end-session',
  'integration-started',
  'validation-failed',
  'integration-aborted',
  'integrated',
  'plan-revision-started',
  'plan-revised',
])

const RejectReason = Object.freeze({
  INVALID_STATE: 'InvalidState',
  INVALID_EVENT: 'InvalidEvent',
  INVALID_EXTERNAL_FACTS: 'InvalidExternalFacts',
  UNKNOWN_EVENT: 'UnknownEvent',
  DUPLICATE_EVENT: 'DuplicateEvent',
  STALE_CONTROL_OID: 'StaleControlOid',
  INVALID_NEXT_CONTROL_OID: 'InvalidNextControlOid',
  CONTROL_OID_REUSED: 'ControlOidReused',
  EPOCH_NOT_INITIALIZING: 'EpochNotInitializing',
  EPOCH_NOT_READY: 'EpochNotReady',
  EPOCH_CLOSED: 'EpochClosed',
  NOT_QUIESCENT: 'NotQuiescent',
  HUMAN_AUTHORIZATION_REQUIRED: 'HumanAuthorizationRequired',
  INITIALIZATION_UNPROVEN: 'InitializationUnproven',
  BINDING_EXISTS: 'BindingExists',
  BINDING_NOT_FOUND: 'BindingNotFound',
  REGISTRATION_NOT_FOUND: 'RegistrationNotFound',
  REGISTRATION_ENDED: 'RegistrationEnded',
  STALE_REGISTRATION_GENERATION: 'StaleRegistrationGeneration',
  MAIN_ACTOR_REQUIRED: 'MainActorRequired',
  MACHINE_OR_PATH_UNPROVEN: 'MachineOrPathUnproven',
  MACHINE_LABEL_TAKEN: 'MachineLabelTaken',
  INVALID_CHALLENGE: 'InvalidChallenge',
  FRESH_PROOF_REQUIRED: 'FreshProofRequired',
  LOCAL_LATCH_UNPROVEN: 'LocalLatchUnproven',
  GLOBAL_WRITER_EXCLUSIVITY_REQUIRED: 'GlobalWriterExclusivityRequired',
  ACTIVE_CLAIM_EXISTS: 'ActiveClaimExists',
  OWNED_GATE_EXISTS: 'OwnedGateExists',
  ITEM_NOT_FOUND: 'ItemNotFound',
  ILLEGAL_ITEM_TRANSITION: 'IllegalItemTransition',
  CLAIM_NOT_FOUND: 'ClaimNotFound',
  CLAIM_OWNERSHIP_MISMATCH: 'ClaimOwnershipMismatch',
  STALE_CLAIM_FENCE: 'StaleClaimFence',
  CLAIM_ID_REUSED: 'ClaimIdReused',
  STALE_CLAIM_GENERATION: 'StaleClaimGeneration',
  DEPENDENCY_NOT_INTEGRATED: 'DependencyNotIntegrated',
  INTEGRATION_GATE_HELD: 'IntegrationGateHeld',
  PLAN_GATE_HELD: 'PlanGateHeld',
  WRITER_LIMIT_REACHED: 'WriterLimitReached',
  CAPABILITY_NOT_CURRENT: 'CapabilityNotCurrent',
  BOUNDARY_INVALID: 'BoundaryInvalid',
  BOUNDARY_MISMATCH: 'BoundaryMismatch',
  BOUNDARY_OVERLAP: 'BoundaryOverlap',
  SCOPE_DIGEST_MISMATCH: 'ScopeDigestMismatch',
  SCOPE_SHRINK_FORBIDDEN: 'ScopeShrinkForbidden',
  BRANCH_BASE_UNPROVEN: 'BranchBaseUnproven',
  CONTRACTS_UNPROVEN: 'ContractsUnproven',
  INCIDENT_EXISTS: 'IncidentExists',
  INCIDENT_NOT_FOUND: 'IncidentNotFound',
  INCIDENT_STILL_OPEN: 'IncidentStillOpen',
  RECONCILIATION_UNPROVEN: 'ReconciliationUnproven',
  CANDIDATE_NOT_PUBLISHED: 'CandidateNotPublished',
  CANDIDATE_COLLISION: 'CandidateCollision',
  CANDIDATE_GENERATION_MISMATCH: 'CandidateGenerationMismatch',
  SUPERSEDED_CANDIDATE_MISMATCH: 'SupersededCandidateMismatch',
  INTEGRATION_ATTEMPT_REUSED: 'IntegrationAttemptReused',
  INTEGRATION_HEAD_MISMATCH: 'IntegrationHeadMismatch',
  INTEGRATION_EVIDENCE_MISMATCH: 'IntegrationEvidenceMismatch',
  INTEGRATION_OUTCOME_UNCERTAIN: 'IntegrationOutcomeUncertain',
  INVARIANT_VIOLATION_UNPROVEN: 'InvariantViolationUnproven',
  ALREADY_INTEGRATED: 'AlreadyIntegrated',
  INTEGRATED_BY_OTHER_ATTEMPT: 'IntegratedByOtherAttempt',
  PLAN_REVISION_MISMATCH: 'PlanRevisionMismatch',
  PLAN_REVISION_UNPROVEN: 'PlanRevisionUnproven',
})

const ACTIVE_CLAIM_STATUSES = new Set(['claimed', 'blocked', 'done', 'integrating'])
function reject(reason, details) {
  return { ok: false, reject: details === undefined ? { reason } : { reason, details } }
}

function success(state) {
  return { ok: true, state }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone)
  if (isRecord(value)) {
    const out = {}
    for (const [key, child] of Object.entries(value)) out[key] = clone(child)
    return out
  }
  return value
}

function nonempty(value) {
  return typeof value === 'string' && value.length > 0
}

function bindingKey(platformKind, platformSessionId) {
  return `${platformKind}\u0000${platformSessionId}`
}

function ordinalKey(family, machineId) {
  return `${family}\u0000${machineId}`
}

function canonicalPathEntry(entry) {
  if (!isRecord(entry) || !['file', 'tree'].includes(entry.kind) || !nonempty(entry.path)) return null
  let value = entry.path.normalize('NFC').replace(/\\/g, '/')
  if (value.startsWith('/') || /^[A-Za-z]:\//.test(value)) return null
  const segments = value.split('/').filter(Boolean)
  if (segments.length === 0 || segments.some(part => part === '.' || part === '..')) return null
  if (segments[0].toLowerCase() === '.git' || segments[0].toLowerCase() === '.baton-pass') return null
  value = segments.join('/')
  if (entry.kind === 'tree') value += '/'
  return { kind: entry.kind, path: value }
}

function canonicalBoundary(boundary) {
  if (!Array.isArray(boundary) || boundary.length === 0) return null
  const entries = []
  const identities = new Set()
  const portable = new Set()
  for (const raw of boundary) {
    const entry = canonicalPathEntry(raw)
    if (!entry) return null
    const identity = `${entry.kind}:${entry.path}`
    const folded = identity.toLowerCase()
    if (identities.has(identity) || portable.has(folded)) return null
    identities.add(identity)
    portable.add(folded)
    entries.push(entry)
  }
  entries.sort((a, b) => `${a.kind}:${a.path}`.localeCompare(`${b.kind}:${b.path}`))
  return entries
}

function scopeDigest(boundary) {
  const canonical = canonicalBoundary(boundary)
  return canonical ? JSON.stringify(canonical) : null
}

function pathEntryOverlaps(left, right) {
  if (left.kind === 'file' && right.kind === 'file') return left.path === right.path
  if (left.kind === 'tree' && right.kind === 'tree') {
    return left.path.startsWith(right.path) || right.path.startsWith(left.path)
  }
  const tree = left.kind === 'tree' ? left : right
  const file = left.kind === 'file' ? left : right
  return file.path.startsWith(tree.path)
}

function boundariesOverlap(left, right) {
  const a = canonicalBoundary(left)
  const b = canonicalBoundary(right)
  if (!a || !b) return true
  return a.some(x => b.some(y => pathEntryOverlaps(x, y)))
}

function boundariesEqual(left, right) {
  const a = scopeDigest(left)
  const b = scopeDigest(right)
  return a !== null && a === b
}

function planItemsFrom(configItems) {
  const items = {}
  if (!Array.isArray(configItems) || configItems.length === 0) return null
  for (const raw of configItems) {
    if (!isRecord(raw) || !nonempty(raw.id) || items[raw.id]) return null
    const boundary = canonicalBoundary(raw.boundary || raw.writeScope)
    if (!boundary || !Array.isArray(raw.dependsOn || [])) return null
    items[raw.id] = {
      id: raw.id,
      dependsOn: [...(raw.dependsOn || [])],
      boundary,
      contracts: [...(raw.contracts || [])],
    }
  }
  return items
}

function reaches(planItems, from, target, seen = new Set()) {
  if (from === target) return true
  if (seen.has(from) || !planItems[from]) return false
  seen.add(from)
  return planItems[from].dependsOn.some(dep => reaches(planItems, dep, target, seen))
}

function itemsOrdered(planItems, leftId, rightId) {
  return reaches(planItems, leftId, rightId) || reaches(planItems, rightId, leftId)
}

function validatePlanItems(items) {
  if (!isRecord(items) || Object.keys(items).length === 0) return 'plan has no items'
  for (const item of Object.values(items)) {
    if (!item.dependsOn.every(dep => dep !== item.id && items[dep])) return `invalid dependency for ${item.id}`
    if (item.dependsOn.some(dep => reaches(items, dep, item.id))) return `dependency cycle at ${item.id}`
  }
  const ids = Object.keys(items)
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i]
      const b = ids[j]
      if (!itemsOrdered(items, a, b) && boundariesOverlap(items[a].boundary, items[b].boundary)) {
        return `unordered plan boundaries overlap: ${a}, ${b}`
      }
    }
  }
  return null
}

function createInitialState(config) {
  try {
    if (!isRecord(config) || !nonempty(config.controlOid) || !isRecord(config.epoch) || !isRecord(config.plan) ||
        ![config.epoch.id, config.epoch.coordinationBackendId, config.epoch.refPrefix,
          config.epoch.integrationHeadOid, config.plan.ref, config.plan.commitOid,
          config.plan.blobOid, config.plan.baseOid].every(nonempty)) {
      return reject(RejectReason.INVALID_STATE, 'missing genesis fields')
    }
    const planItems = planItemsFrom(config.plan.items)
    const planError = validatePlanItems(planItems)
    if (planError) return reject(RejectReason.INVALID_STATE, planError)
    if (!Number.isInteger(config.epoch.maxConcurrentWriters) || config.epoch.maxConcurrentWriters < 1) {
      return reject(RejectReason.INVALID_STATE, 'invalid maxConcurrentWriters')
    }
    const items = {}
    for (const id of Object.keys(planItems)) items[id] = { status: 'todo', activeClaimId: null, integrated: null }
    return success({
      schemaVersion: 1,
      controlOid: config.controlOid,
      revision: 0,
      epoch: {
        id: config.epoch.id,
        predecessorId: config.epoch.predecessorId || null,
        coordinationBackendId: config.epoch.coordinationBackendId,
        refPrefix: config.epoch.refPrefix,
        status: 'initializing',
        maxConcurrentWriters: config.epoch.maxConcurrentWriters,
        integrationHeadOid: config.epoch.integrationHeadOid,
      },
      plan: {
        revision: 1,
        ref: config.plan.ref,
        commitOid: config.plan.commitOid,
        blobOid: config.plan.blobOid,
        baseOid: config.plan.baseOid,
        items: planItems,
        supersessions: [],
      },
      registrations: {},
      bindings: {},
      machineLabels: {},
      nextOrdinals: {},
      items,
      claims: {},
      contractIncidents: {},
      integrationGate: null,
      planGate: null,
      attempts: {},
      candidateRefs: {},
      eventIds: {},
      controlOids: { [config.controlOid]: true },
    })
  } catch (error) {
    return reject(RejectReason.INVALID_STATE, error.message)
  }
}

function activeClaim(state, itemId) {
  const item = state.items[itemId]
  return item && item.activeClaimId ? state.claims[item.activeClaimId] : null
}

function activeClaims(state) {
  return Object.values(state.claims).filter(claim => ACTIVE_CLAIM_STATUSES.has(claim.status))
}

function activeWriterRegistrationIds(state) {
  return new Set(activeClaims(state).map(claim => claim.owner.registrationId))
}

function hasOpenIncident(state, itemId) {
  return Object.values(state.contractIncidents).some(incident => incident.status === 'open' && incident.affectedItemIds.includes(itemId))
}

function capabilityCurrent(registration) {
  const proof = registration.lastAcceptedCapabilityProof
  return registration.mode === 'full' && proof && proof.generation === registration.generation && proof.hookHash === registration.hookHash
}

function allWriterProofsCurrent(state, additionalRegistrationId) {
  const ids = activeWriterRegistrationIds(state)
  if (additionalRegistrationId) ids.add(additionalRegistrationId)
  for (const id of ids) {
    const registration = state.registrations[id]
    if (!registration || !capabilityCurrent(registration)) return false
  }
  return true
}

function actorRegistration(state, event) {
  if (!isRecord(event.actor) || !nonempty(event.actor.registrationId) || !Number.isInteger(event.actor.registrationGeneration)) {
    return reject(RejectReason.INVALID_EVENT, 'actor fence required')
  }
  const registration = state.registrations[event.actor.registrationId]
  if (!registration) return reject(RejectReason.REGISTRATION_NOT_FOUND)
  if (registration.status !== 'active') return reject(RejectReason.REGISTRATION_ENDED)
  if (registration.generation !== event.actor.registrationGeneration) {
    return reject(RejectReason.STALE_REGISTRATION_GENERATION, {
      expected: registration.generation,
      actual: event.actor.registrationGeneration,
    })
  }
  return { ok: true, registration }
}

function ownedClaim(state, event, allowedStatuses) {
  const actorResult = actorRegistration(state, event)
  if (!actorResult.ok) return actorResult
  const item = state.items[event.itemId]
  if (!item) return reject(RejectReason.ITEM_NOT_FOUND)
  const claim = activeClaim(state, event.itemId)
  if (!claim) return reject(RejectReason.CLAIM_NOT_FOUND)
  if (claim.id !== event.claimId || claim.generation !== event.claimGeneration) {
    return reject(RejectReason.STALE_CLAIM_FENCE)
  }
  if (claim.owner.registrationId !== event.actor.registrationId) {
    return reject(RejectReason.CLAIM_OWNERSHIP_MISMATCH)
  }
  if (claim.owner.registrationGeneration !== event.actor.registrationGeneration) {
    return reject(RejectReason.STALE_REGISTRATION_GENERATION)
  }
  if (!allowedStatuses.includes(item.status) || claim.status !== item.status) {
    return reject(RejectReason.ILLEGAL_ITEM_TRANSITION, { from: item.status, event: event.type })
  }
  return { ok: true, registration: actorResult.registration, item, claim }
}

function currentReservedBoundary(state, itemId) {
  const claim = activeClaim(state, itemId)
  return claim ? claim.effectiveBoundary : state.plan.items[itemId].boundary
}

function validateState(state) {
  const problems = []
  if (!isRecord(state) || state.schemaVersion !== 1) return ['state envelope is invalid']
  if (!nonempty(state.controlOid) || !Number.isInteger(state.revision) || state.revision < 0) problems.push('control fence is invalid')
  if (!isRecord(state.epoch) || !['initializing', 'ready', 'closed'].includes(state.epoch.status)) problems.push('epoch status is invalid')
  if (!isRecord(state.plan) || validatePlanItems(state.plan.items)) problems.push('plan is invalid')
  if (!isRecord(state.items) || !isRecord(state.claims)) problems.push('item collections are invalid')
  if (!isRecord(state.controlOids) || !state.controlOids[state.controlOid]) problems.push('control OID lineage is invalid')
  if (problems.length) return problems

  for (const [itemId, item] of Object.entries(state.items)) {
    if (!state.plan.items[itemId]) problems.push(`unknown materialized item ${itemId}`)
    const claim = activeClaim(state, itemId)
    if (item.activeClaimId) {
      if (!claim) problems.push(`missing active claim for ${itemId}`)
      else if (claim.status !== item.status || !ACTIVE_CLAIM_STATUSES.has(item.status)) problems.push(`claim/item status mismatch for ${itemId}`)
    } else if (ACTIVE_CLAIM_STATUSES.has(item.status)) {
      problems.push(`active item lacks claim ${itemId}`)
    }
  }

  const claims = activeClaims(state)
  for (let i = 0; i < claims.length; i += 1) {
    const claim = claims[i]
    const registration = state.registrations[claim.owner.registrationId]
    if (!registration || registration.generation !== claim.owner.registrationGeneration) {
      problems.push(`stale owner fence for ${claim.id}`)
    }
    for (let j = i + 1; j < claims.length; j += 1) {
      const other = claims[j]
      if (!itemsOrdered(state.plan.items, claim.itemId, other.itemId) && boundariesOverlap(claim.effectiveBoundary, other.effectiveBoundary)) {
        problems.push(`unordered active claims overlap: ${claim.id}, ${other.id}`)
      }
    }
  }

  if (state.integrationGate) {
    const claim = activeClaim(state, state.integrationGate.itemId)
    if (!claim || claim.status !== 'integrating' || claim.id !== state.integrationGate.claimId) {
      problems.push('integration gate has no matching integrating claim')
    }
  } else if (claims.some(claim => claim.status === 'integrating')) {
    problems.push('integrating claim has no gate')
  }
  if (claims.filter(claim => claim.status === 'integrating').length > 1) problems.push('multiple integrating claims')
  return problems
}

function verifyCommonFence(state, event, facts) {
  if (!isRecord(event) || !nonempty(event.type) || !nonempty(event.eventId) || !nonempty(event.epochId)) {
    return reject(RejectReason.INVALID_EVENT, 'event envelope is incomplete')
  }
  if (!EVENT_TYPES.includes(event.type)) return reject(RejectReason.UNKNOWN_EVENT, event.type)
  if (state.eventIds[event.eventId]) return reject(RejectReason.DUPLICATE_EVENT)
  if (event.epochId !== state.epoch.id) return reject(RejectReason.INVALID_EVENT, 'epoch fence mismatch')
  if (!isRecord(facts) || !nonempty(facts.observedControlOid)) return reject(RejectReason.INVALID_EXTERNAL_FACTS, 'observedControlOid required')
  if (event.expectedControlOid !== state.controlOid || facts.observedControlOid !== state.controlOid) {
    return reject(RejectReason.STALE_CONTROL_OID, { expected: state.controlOid, event: event.expectedControlOid, observed: facts.observedControlOid })
  }
  if (!nonempty(facts.nextControlOid) || facts.nextControlOid === state.controlOid) {
    return reject(RejectReason.INVALID_NEXT_CONTROL_OID)
  }
  if (state.controlOids[facts.nextControlOid]) return reject(RejectReason.CONTROL_OID_REUSED)
  if (state.epoch.status === 'closed') return reject(RejectReason.EPOCH_CLOSED)
  return null
}

function freshProof(registration, event, facts, generation) {
  const proof = event.proof
  const pending = registration.nextPendingChallenge
  return facts.capabilityProofAccepted === true && isRecord(proof) && isRecord(pending) &&
    proof.nonce === pending.nonce && proof.platformSessionId === registration.platformSessionId &&
    proof.hookHash === registration.hookHash && nonempty(proof.runtimeVersion) &&
    isRecord(event.nextPendingChallenge) && nonempty(event.nextPendingChallenge.nonce) &&
    event.nextPendingChallenge.nonce !== proof.nonce && Number.isInteger(generation)
}

function quiescent(state) {
  return !state.integrationGate && !state.planGate && activeClaims(state).length === 0 &&
    !Object.values(state.items).some(item => item.status === 'done' || item.status === 'integrating')
}

function setItemClaimStatus(item, claim, status) {
  item.status = status
  claim.status = status
}

function applyEpochReady(state, event, facts) {
  if (state.epoch.status !== 'initializing') return reject(RejectReason.EPOCH_NOT_INITIALIZING)
  if (facts.initializationValidated !== true) return reject(RejectReason.INITIALIZATION_UNPROVEN)
  state.epoch.status = 'ready'
  return null
}

function applyEpochClosed(state, event, facts) {
  if (state.epoch.status !== 'ready') return reject(RejectReason.EPOCH_NOT_READY)
  if (facts.humanAuthorized !== true) return reject(RejectReason.HUMAN_AUTHORIZATION_REQUIRED)
  if (!quiescent(state)) return reject(RejectReason.NOT_QUIESCENT)
  if (event.integrationHeadOid !== state.epoch.integrationHeadOid) return reject(RejectReason.INTEGRATION_HEAD_MISMATCH)
  state.epoch.status = 'closed'
  state.epoch.finalRevision = state.revision + 1
  state.epoch.finalIntegrationHeadOid = event.integrationHeadOid
  return null
}

function applyRegister(state, event, facts) {
  if (state.epoch.status !== 'ready') return reject(RejectReason.EPOCH_NOT_READY)
  if (![event.platformKind, event.platformSessionId, event.registrationId, event.machineId, event.machineLabel, event.family, event.hookHash].every(nonempty)) {
    return reject(RejectReason.INVALID_EVENT, 'registration fields are incomplete')
  }
  const key = bindingKey(event.platformKind, event.platformSessionId)
  if (state.bindings[key]) return reject(RejectReason.BINDING_EXISTS)
  if (state.registrations[event.registrationId]) return reject(RejectReason.INVALID_EVENT, 'registration id reused')
  if (facts.machineAndPathValid !== true) return reject(RejectReason.MACHINE_OR_PATH_UNPROVEN)
  const reserved = state.machineLabels[event.machineLabel]
  if (reserved && reserved !== event.machineId) return reject(RejectReason.MACHINE_LABEL_TAKEN)
  if (!isRecord(event.nextPendingChallenge) || !nonempty(event.nextPendingChallenge.nonce)) return reject(RejectReason.INVALID_CHALLENGE)
  const ordinalKeyValue = ordinalKey(event.family, event.machineId)
  const ordinal = state.nextOrdinals[ordinalKeyValue] || 1
  if (event.ordinal !== undefined && event.ordinal !== ordinal) return reject(RejectReason.INVALID_EVENT, 'ordinal mismatch')
  state.nextOrdinals[ordinalKeyValue] = ordinal + 1
  state.machineLabels[event.machineLabel] = event.machineId
  state.bindings[key] = event.registrationId
  state.registrations[event.registrationId] = {
    id: event.registrationId,
    platformKind: event.platformKind,
    platformSessionId: event.platformSessionId,
    generation: 1,
    machineId: event.machineId,
    machineLabel: event.machineLabel,
    family: event.family,
    ordinal,
    hookHash: event.hookHash,
    mode: 'degraded',
    capabilityStatus: 'probing',
    lastAcceptedCapabilityProof: null,
    nextPendingChallenge: clone(event.nextPendingChallenge),
    status: 'active',
  }
  return null
}

function applyReactivate(state, event, facts) {
  const key = bindingKey(event.platformKind, event.platformSessionId)
  const registrationId = state.bindings[key]
  if (!registrationId) return reject(RejectReason.BINDING_NOT_FOUND)
  const actorResult = actorRegistration(state, event)
  if (!actorResult.ok) return actorResult
  const registration = actorResult.registration
  if (registration.id !== registrationId) return reject(RejectReason.BINDING_NOT_FOUND)
  const owned = activeClaims(state).filter(claim => claim.owner.registrationId === registration.id)
  if (owned.some(claim => claim.status === 'integrating')) return reject(RejectReason.INTEGRATION_GATE_HELD)
  const nextGeneration = registration.generation + 1
  registration.generation = nextGeneration
  if (event.mode === 'full') {
    if (!freshProof(registration, event, facts, nextGeneration)) return reject(RejectReason.FRESH_PROOF_REQUIRED)
    registration.lastAcceptedCapabilityProof = { ...clone(event.proof), generation: nextGeneration }
    registration.nextPendingChallenge = clone(event.nextPendingChallenge)
    registration.capabilityStatus = 'accepted'
    registration.mode = 'full'
    const otherWriterIds = activeWriterRegistrationIds(state)
    otherWriterIds.add(registration.id)
    for (const id of otherWriterIds) {
      const writer = id === registration.id ? registration : state.registrations[id]
      if (!writer || !capabilityCurrent(writer)) return reject(RejectReason.CAPABILITY_NOT_CURRENT)
    }
  } else if (event.mode === 'degraded') {
    const otherClaims = activeClaims(state).filter(claim => claim.owner.registrationId !== registration.id)
    if (otherClaims.length > 0 || owned.length > 1) return reject(RejectReason.GLOBAL_WRITER_EXCLUSIVITY_REQUIRED)
    if (!isRecord(event.nextPendingChallenge) || !nonempty(event.nextPendingChallenge.nonce)) return reject(RejectReason.INVALID_CHALLENGE)
    registration.nextPendingChallenge = clone(event.nextPendingChallenge)
    registration.mode = 'degraded'
    registration.capabilityStatus = registration.lastAcceptedCapabilityProof ? 'degraded' : 'probing'
  } else {
    return reject(RejectReason.INVALID_EVENT, 'reactivation mode required')
  }
  for (const claim of owned) claim.owner.registrationGeneration = nextGeneration
  return null
}

function applyCapabilityUpgrade(state, event, facts) {
  const actorResult = actorRegistration(state, event)
  if (!actorResult.ok) return actorResult
  const registration = actorResult.registration
  if (!freshProof(registration, event, facts, registration.generation)) return reject(RejectReason.FRESH_PROOF_REQUIRED)
  registration.lastAcceptedCapabilityProof = { ...clone(event.proof), generation: registration.generation }
  registration.nextPendingChallenge = clone(event.nextPendingChallenge)
  registration.capabilityStatus = 'accepted'
  registration.mode = 'full'
  if (!allWriterProofsCurrent(state, registration.id)) return reject(RejectReason.CAPABILITY_NOT_CURRENT)
  return null
}

function applyCapabilityDowngrade(state, event, facts) {
  const actorResult = actorRegistration(state, event)
  if (!actorResult.ok) return actorResult
  if (facts.localLatchSet !== true) return reject(RejectReason.LOCAL_LATCH_UNPROVEN)
  actorResult.registration.mode = 'degraded'
  actorResult.registration.capabilityStatus = actorResult.registration.lastAcceptedCapabilityProof ? 'degraded' : 'probing'
  return null
}

function applyClaim(state, event, facts) {
  const actorResult = actorRegistration(state, event)
  if (!actorResult.ok) return actorResult
  if (event.actor.platformActorId) return reject(RejectReason.MAIN_ACTOR_REQUIRED)
  const registration = actorResult.registration
  const item = state.items[event.itemId]
  const planItem = state.plan.items[event.itemId]
  if (!item || !planItem) return reject(RejectReason.ITEM_NOT_FOUND)
  if (item.status !== 'todo' || item.activeClaimId) return reject(RejectReason.ACTIVE_CLAIM_EXISTS)
  if (state.integrationGate) return reject(RejectReason.INTEGRATION_GATE_HELD)
  if (state.planGate) return reject(RejectReason.PLAN_GATE_HELD)
  for (const dependency of planItem.dependsOn) {
    if (state.items[dependency].status !== 'integrated') return reject(RejectReason.DEPENDENCY_NOT_INTEGRATED, dependency)
  }
  if (!nonempty(event.claimId) || state.claims[event.claimId]) return reject(RejectReason.CLAIM_ID_REUSED)
  const previousGeneration = Math.max(0, ...Object.values(state.claims).filter(claim => claim.itemId === event.itemId).map(claim => claim.generation))
  if (event.claimGeneration !== previousGeneration + 1) return reject(RejectReason.STALE_CLAIM_GENERATION)
  const boundary = canonicalBoundary(event.effectiveBoundary)
  if (!boundary) return reject(RejectReason.BOUNDARY_INVALID)
  if (!boundariesEqual(boundary, planItem.boundary)) return reject(RejectReason.BOUNDARY_MISMATCH)
  for (const otherId of Object.keys(state.plan.items)) {
    if (otherId === event.itemId || itemsOrdered(state.plan.items, event.itemId, otherId)) continue
    if (boundariesOverlap(boundary, currentReservedBoundary(state, otherId))) {
      return reject(RejectReason.BOUNDARY_OVERLAP, otherId)
    }
  }
  if (event.claimBaseOid !== state.epoch.integrationHeadOid) return reject(RejectReason.INTEGRATION_HEAD_MISMATCH)
  if (facts.privateBranchAbsent !== true && !(facts.privateBranchHeadOid && facts.claimBaseIsAncestor === true)) {
    return reject(RejectReason.BRANCH_BASE_UNPROVEN)
  }
  if (facts.contractsMatch !== true) return reject(RejectReason.CONTRACTS_UNPROVEN)
  if (event.mode !== registration.mode) return reject(RejectReason.CAPABILITY_NOT_CURRENT)
  if (registration.capabilityStatus === 'probing') return reject(RejectReason.FRESH_PROOF_REQUIRED)
  const writers = activeWriterRegistrationIds(state)
  if (registration.mode === 'full') {
    if (!capabilityCurrent(registration) || !allWriterProofsCurrent(state, registration.id)) return reject(RejectReason.CAPABILITY_NOT_CURRENT)
    if (!writers.has(registration.id) && writers.size >= state.epoch.maxConcurrentWriters) return reject(RejectReason.WRITER_LIMIT_REACHED)
  } else if (activeClaims(state).length > 0) {
    return reject(RejectReason.GLOBAL_WRITER_EXCLUSIVITY_REQUIRED)
  }
  const claim = {
    id: event.claimId,
    itemId: event.itemId,
    generation: event.claimGeneration,
    owner: {
      registrationId: registration.id,
      registrationGeneration: registration.generation,
      platformActorId: null,
    },
    effectiveBoundary: boundary,
    scopeDigest: scopeDigest(boundary),
    claimBaseOid: event.claimBaseOid,
    branchRef: event.branchRef,
    contractHashes: clone(event.contractHashes || {}),
    leaseDurationMs: event.leaseDurationMs,
    expiresAtAdvisory: event.expiresAtAdvisory,
    mode: event.mode,
    status: 'claimed',
    candidates: [],
  }
  state.claims[claim.id] = claim
  item.status = 'claimed'
  item.activeClaimId = claim.id
  return null
}

function applyLeaseRenew(state, event) {
  const owned = ownedClaim(state, event, ['claimed'])
  if (!owned.ok) return owned
  owned.claim.leaseDurationMs = event.leaseDurationMs
  owned.claim.expiresAtAdvisory = event.expiresAtAdvisory
  owned.claim.renewedAtRevision = state.revision + 1
  return null
}

function applyScopeChange(state, event) {
  const owned = ownedClaim(state, event, ['claimed', 'blocked'])
  if (!owned.ok) return owned
  if (state.planGate) return reject(RejectReason.PLAN_GATE_HELD)
  if (event.priorScopeDigest !== owned.claim.scopeDigest) return reject(RejectReason.SCOPE_DIGEST_MISMATCH)
  const additions = canonicalBoundary(event.additions)
  if (!additions) return reject(RejectReason.BOUNDARY_INVALID)
  const existing = owned.claim.effectiveBoundary
  const combined = canonicalBoundary([...existing, ...additions])
  if (!combined || combined.length <= existing.length) return reject(RejectReason.SCOPE_SHRINK_FORBIDDEN)
  for (const otherId of Object.keys(state.plan.items)) {
    if (otherId === event.itemId || itemsOrdered(state.plan.items, event.itemId, otherId)) continue
    if (boundariesOverlap(combined, currentReservedBoundary(state, otherId))) return reject(RejectReason.BOUNDARY_OVERLAP, otherId)
  }
  owned.claim.effectiveBoundary = combined
  owned.claim.scopeDigest = scopeDigest(combined)
  return null
}

function applyBlock(state, event, facts) {
  const allowed = event.contractIncidentId ? ['claimed', 'done'] : ['claimed']
  const owned = ownedClaim(state, event, allowed)
  if (!owned.ok) return owned
  if (event.contractIncidentId && !state.contractIncidents[event.contractIncidentId]) return reject(RejectReason.INCIDENT_NOT_FOUND)
  if (owned.item.status === 'done' && !event.contractIncidentId) return reject(RejectReason.ILLEGAL_ITEM_TRANSITION)
  if (!event.contractIncidentId && facts.localLatchSet !== true) return reject(RejectReason.LOCAL_LATCH_UNPROVEN)
  setItemClaimStatus(owned.item, owned.claim, 'blocked')
  if (owned.claim.candidates.length) owned.claim.candidates[owned.claim.candidates.length - 1].invalidated = Boolean(event.contractIncidentId)
  return null
}

function applyUnblock(state, event, facts) {
  const owned = ownedClaim(state, event, ['blocked'])
  if (!owned.ok) return owned
  if (facts.reconciliationRecorded !== true) return reject(RejectReason.RECONCILIATION_UNPROVEN)
  if (hasOpenIncident(state, event.itemId)) return reject(RejectReason.INCIDENT_STILL_OPEN)
  setItemClaimStatus(owned.item, owned.claim, 'claimed')
  return null
}

function applyContractChanged(state, event, facts) {
  const owned = ownedClaim(state, event, ['claimed', 'blocked', 'done', 'integrating'])
  if (!owned.ok) return owned
  if (!nonempty(event.incidentId) || state.contractIncidents[event.incidentId]) return reject(RejectReason.INCIDENT_EXISTS)
  if (!Array.isArray(event.affectedItemIds) || !event.affectedItemIds.includes(event.itemId) || facts.affectedItemsProven !== true) {
    return reject(RejectReason.INVALID_EXTERNAL_FACTS, 'affected items are unproven')
  }
  for (const itemId of event.affectedItemIds) if (!state.items[itemId]) return reject(RejectReason.ITEM_NOT_FOUND, itemId)
  state.contractIncidents[event.incidentId] = {
    id: event.incidentId,
    contractId: event.contractId,
    affectedItemIds: [...new Set(event.affectedItemIds)],
    status: 'open',
  }
  for (const itemId of state.contractIncidents[event.incidentId].affectedItemIds) {
    const claim = activeClaim(state, itemId)
    if (!claim || !ACTIVE_CLAIM_STATUSES.has(claim.status)) continue
    if (claim.candidates.length) claim.candidates[claim.candidates.length - 1].invalidated = true
    if (claim.status !== 'integrating') setItemClaimStatus(state.items[itemId], claim, 'blocked')
  }
  return null
}

function applyDone(state, event, facts) {
  const owned = ownedClaim(state, event, ['claimed'])
  if (!owned.ok) return owned
  if (hasOpenIncident(state, event.itemId)) return reject(RejectReason.INCIDENT_STILL_OPEN)
  const prior = owned.claim.candidates.length ? owned.claim.candidates[owned.claim.candidates.length - 1] : null
  const expectedGeneration = prior ? prior.generation + 1 : 1
  if (event.candidateGeneration !== expectedGeneration) return reject(RejectReason.CANDIDATE_GENERATION_MISMATCH)
  if (prior && event.supersedesCandidateRef !== prior.ref) return reject(RejectReason.SUPERSEDED_CANDIDATE_MISMATCH)
  if (!prior && event.supersedesCandidateRef) return reject(RejectReason.SUPERSEDED_CANDIDATE_MISMATCH)
  if (!nonempty(event.candidateRef) || state.candidateRefs[event.candidateRef]) return reject(RejectReason.CANDIDATE_COLLISION)
  const candidate = facts.candidate
  if (!isRecord(candidate) || candidate.published !== true || candidate.expectedAbsent !== true ||
      candidate.ref !== event.candidateRef || candidate.oid !== event.candidateOid ||
      candidate.generation !== event.candidateGeneration || candidate.ancestryValid !== true ||
      candidate.manifestMatches !== true || candidate.contractsMatch !== true) {
    return reject(RejectReason.CANDIDATE_NOT_PUBLISHED)
  }
  const record = {
    generation: event.candidateGeneration,
    ref: event.candidateRef,
    oid: event.candidateOid,
    supersedes: prior ? prior.ref : null,
    commitRange: clone(event.commitRange),
    actualPaths: clone(event.actualPaths || []),
    manifestDigest: event.manifestDigest,
    contractHashes: clone(event.contractHashes || {}),
    preflightReportDigest: event.preflightReportDigest,
    invalidated: false,
  }
  if (prior) prior.supersededBy = record.ref
  owned.claim.candidates.push(record)
  state.candidateRefs[record.ref] = { claimId: owned.claim.id, generation: record.generation, oid: record.oid }
  setItemClaimStatus(owned.item, owned.claim, 'done')
  return null
}

function relinquish(state, event, target, terminalClaimStatus, facts, human) {
  const owned = ownedClaim(state, event, ['claimed', 'blocked', 'done'])
  if (!owned.ok) return owned
  if (human && facts.humanAuthorized !== true) return reject(RejectReason.HUMAN_AUTHORIZATION_REQUIRED)
  owned.claim.status = terminalClaimStatus
  owned.item.status = target
  owned.item.activeClaimId = null
  return null
}

function applyRevoke(state, event, facts) {
  if (facts.humanAuthorized !== true) return reject(RejectReason.HUMAN_AUTHORIZATION_REQUIRED)
  const item = state.items[event.itemId]
  const claim = activeClaim(state, event.itemId)
  if (!item || !claim) return reject(RejectReason.CLAIM_NOT_FOUND)
  if (!['claimed', 'blocked', 'done'].includes(item.status)) return reject(RejectReason.ILLEGAL_ITEM_TRANSITION)
  if (claim.id !== event.claimId || claim.generation !== event.claimGeneration) return reject(RejectReason.STALE_CLAIM_FENCE)
  claim.status = 'revoked'
  item.status = 'todo'
  item.activeClaimId = null
  return null
}

function applyEndSession(state, event) {
  const actorResult = actorRegistration(state, event)
  if (!actorResult.ok) return actorResult
  const id = actorResult.registration.id
  if (activeClaims(state).some(claim => claim.owner.registrationId === id)) return reject(RejectReason.ACTIVE_CLAIM_EXISTS)
  if (state.integrationGate && state.integrationGate.ownerRegistrationId === id) return reject(RejectReason.OWNED_GATE_EXISTS)
  actorResult.registration.status = 'ended'
  return null
}

function applyIntegrationStarted(state, event, facts) {
  const owned = ownedClaim(state, event, ['done'])
  if (!owned.ok) return owned
  if (state.integrationGate) return reject(RejectReason.INTEGRATION_GATE_HELD)
  if (state.planGate) return reject(RejectReason.PLAN_GATE_HELD)
  for (const dependency of state.plan.items[event.itemId].dependsOn) {
    if (state.items[dependency].status !== 'integrated') return reject(RejectReason.DEPENDENCY_NOT_INTEGRATED)
  }
  if (hasOpenIncident(state, event.itemId)) return reject(RejectReason.INCIDENT_STILL_OPEN)
  if (!nonempty(event.integrationAttemptId) || state.attempts[event.integrationAttemptId]) return reject(RejectReason.INTEGRATION_ATTEMPT_REUSED)
  if (facts.integrationHeadOid !== state.epoch.integrationHeadOid || event.integrationHeadOid !== state.epoch.integrationHeadOid) {
    return reject(RejectReason.INTEGRATION_HEAD_MISMATCH)
  }
  const candidate = owned.claim.candidates[owned.claim.candidates.length - 1]
  if (!candidate || candidate.invalidated) return reject(RejectReason.CANDIDATE_NOT_PUBLISHED)
  state.integrationGate = {
    itemId: event.itemId,
    claimId: owned.claim.id,
    claimGeneration: owned.claim.generation,
    ownerRegistrationId: owned.claim.owner.registrationId,
    ownerRegistrationGeneration: owned.claim.owner.registrationGeneration,
    integrationAttemptId: event.integrationAttemptId,
    controlOidAtAcquisition: state.controlOid,
    controlRevisionAtAcquisition: state.revision,
    integrationHeadOid: state.epoch.integrationHeadOid,
    candidateRef: candidate.ref,
    candidateOid: candidate.oid,
    candidateGeneration: candidate.generation,
  }
  state.attempts[event.integrationAttemptId] = { status: 'integrating', itemId: event.itemId }
  setItemClaimStatus(owned.item, owned.claim, 'integrating')
  return null
}

function matchingGate(state, event, owned) {
  const gate = state.integrationGate
  return gate && gate.itemId === event.itemId && gate.claimId === owned.claim.id &&
    gate.claimGeneration === owned.claim.generation && gate.integrationAttemptId === event.integrationAttemptId
}

function applyValidationFailed(state, event, facts) {
  const owned = ownedClaim(state, event, ['integrating'])
  if (!owned.ok) return owned
  if (!matchingGate(state, event, owned)) return reject(RejectReason.INTEGRATION_EVIDENCE_MISMATCH)
  if (facts.invariantViolation !== true) return reject(RejectReason.INVARIANT_VIOLATION_UNPROVEN)
  setItemClaimStatus(owned.item, owned.claim, 'blocked')
  state.attempts[event.integrationAttemptId].status = 'validation-failed'
  state.integrationGate = null
  return null
}

function applyIntegrationAborted(state, event, facts) {
  const owned = ownedClaim(state, event, ['integrating'])
  if (!owned.ok) return owned
  if (!matchingGate(state, event, owned)) return reject(RejectReason.INTEGRATION_EVIDENCE_MISMATCH)
  if (facts.integrationOutcome !== 'not-landed') return reject(RejectReason.INTEGRATION_OUTCOME_UNCERTAIN)
  const destination = hasOpenIncident(state, event.itemId) ? 'blocked' : 'done'
  setItemClaimStatus(owned.item, owned.claim, destination)
  state.attempts[event.integrationAttemptId].status = 'aborted'
  state.integrationGate = null
  return null
}

function integrationIdentity(event) {
  return {
    integrationAttemptId: event.integrationAttemptId,
    mergeOid: event.mergeOid,
    reportRef: event.reportRef,
    reportOid: event.reportOid,
    candidateRef: event.candidateRef,
    candidateOid: event.candidateOid,
    candidateGeneration: event.candidateGeneration,
    firstParentOid: event.firstParentOid,
    secondParentOid: event.secondParentOid,
    prospectiveTreeOid: event.prospectiveTreeOid,
  }
}

function identitiesEqual(left, right) {
  return Object.keys(left).every(key => left[key] === right[key])
}

function exactIntegrationEvidence(state, event, facts, gate) {
  const identity = integrationIdentity(event)
  if (identity.firstParentOid !== gate.integrationHeadOid || identity.secondParentOid !== gate.candidateOid ||
      identity.candidateRef !== gate.candidateRef || identity.candidateOid !== gate.candidateOid ||
      identity.candidateGeneration !== gate.candidateGeneration) return false
  const merge = facts.merge
  const report = facts.report
  return facts.integrationRefOid === event.mergeOid && isRecord(merge) && isRecord(report) &&
    merge.oid === event.mergeOid && merge.integrationAttemptId === event.integrationAttemptId &&
    merge.reportRef === event.reportRef && merge.reportOid === event.reportOid &&
    Array.isArray(merge.parents) && merge.parents.length === 2 &&
    merge.parents[0] === event.firstParentOid && merge.parents[1] === event.secondParentOid &&
    merge.treeOid === event.prospectiveTreeOid && report.published === true &&
    report.expectedAbsent === true && report.ref === event.reportRef && report.oid === event.reportOid &&
    report.integrationAttemptId === event.integrationAttemptId && report.candidateRef === event.candidateRef &&
    report.candidateOid === event.candidateOid && report.candidateGeneration === event.candidateGeneration &&
    report.integrationHeadOid === event.firstParentOid && report.prospectiveTreeOid === event.prospectiveTreeOid
}

function applyIntegrated(state, event, facts) {
  const item = state.items[event.itemId]
  if (!item) return reject(RejectReason.ITEM_NOT_FOUND)
  if (item.status === 'integrated') {
    const recorded = item.integrated
    if (recorded.integrationAttemptId !== event.integrationAttemptId) return reject(RejectReason.INTEGRATED_BY_OTHER_ATTEMPT)
    if (identitiesEqual(recorded, integrationIdentity(event))) return reject(RejectReason.ALREADY_INTEGRATED)
    return reject(RejectReason.INTEGRATION_EVIDENCE_MISMATCH)
  }
  const owned = ownedClaim(state, event, ['integrating'])
  if (!owned.ok) return owned
  if (!matchingGate(state, event, owned)) return reject(RejectReason.INTEGRATION_EVIDENCE_MISMATCH)
  const gate = state.integrationGate
  if (!exactIntegrationEvidence(state, event, facts, gate)) return reject(RejectReason.INTEGRATION_EVIDENCE_MISMATCH)
  const identity = integrationIdentity(event)
  owned.claim.status = 'integrated'
  owned.item.status = 'integrated'
  owned.item.activeClaimId = null
  owned.item.integrated = identity
  state.attempts[event.integrationAttemptId] = { status: 'integrated', itemId: event.itemId, ...identity }
  state.epoch.integrationHeadOid = event.mergeOid
  state.integrationGate = null
  return null
}

function applyPlanRevisionStarted(state, event, facts) {
  if (facts.humanAuthorized !== true) return reject(RejectReason.HUMAN_AUTHORIZATION_REQUIRED)
  if (!quiescent(state)) return reject(RejectReason.NOT_QUIESCENT)
  if (event.nextPlanRevision !== state.plan.revision + 1) return reject(RejectReason.PLAN_REVISION_MISMATCH)
  if (event.integrationHeadOid !== state.epoch.integrationHeadOid || facts.integrationHeadOid !== state.epoch.integrationHeadOid) {
    return reject(RejectReason.INTEGRATION_HEAD_MISMATCH)
  }
  state.planGate = {
    nextPlanRevision: event.nextPlanRevision,
    integrationHeadOid: event.integrationHeadOid,
    controlOidAtAcquisition: state.controlOid,
    attemptId: event.planRevisionAttemptId,
  }
  return null
}

function applyPlanRevised(state, event, facts) {
  if (facts.humanAuthorized !== true) return reject(RejectReason.HUMAN_AUTHORIZATION_REQUIRED)
  const gate = state.planGate
  if (!gate || gate.nextPlanRevision !== event.plan.revision || gate.attemptId !== event.planRevisionAttemptId) {
    return reject(RejectReason.PLAN_REVISION_MISMATCH)
  }
  if (facts.proposalPublished !== true || facts.planValidated !== true || facts.exactRevisionLanded !== true) {
    return reject(RejectReason.PLAN_REVISION_UNPROVEN)
  }
  if (event.plan.baseOid !== state.epoch.integrationHeadOid) return reject(RejectReason.INTEGRATION_HEAD_MISMATCH)
  const newItems = planItemsFrom(event.plan.items)
  const planError = validatePlanItems(newItems)
  if (planError) return reject(RejectReason.PLAN_REVISION_UNPROVEN, planError)
  for (const [id, item] of Object.entries(state.items)) {
    if (item.status === 'integrated' && (!newItems[id] || facts.integratedHistoryStable !== true)) {
      return reject(RejectReason.PLAN_REVISION_UNPROVEN, 'integrated history changed')
    }
  }
  state.plan.supersessions.push({ revision: state.plan.revision, ref: state.plan.ref, commitOid: state.plan.commitOid, blobOid: state.plan.blobOid })
  state.plan = {
    revision: event.plan.revision,
    ref: event.plan.ref,
    commitOid: event.plan.commitOid,
    blobOid: event.plan.blobOid,
    baseOid: event.plan.baseOid,
    items: newItems,
    supersessions: state.plan.supersessions,
  }
  const materialized = {}
  for (const id of Object.keys(newItems)) {
    const prior = state.items[id]
    materialized[id] = prior && prior.status === 'integrated' ? prior : { status: 'todo', activeClaimId: null, integrated: null }
  }
  state.items = materialized
  for (const incident of Object.values(state.contractIncidents)) incident.status = 'resolved'
  state.planGate = null
  return null
}

const handlers = {
  'epoch-ready': applyEpochReady,
  'epoch-closed': applyEpochClosed,
  register: applyRegister,
  reactivate: applyReactivate,
  'capability-upgrade': applyCapabilityUpgrade,
  'capability-downgrade': applyCapabilityDowngrade,
  claim: applyClaim,
  'lease-renew': applyLeaseRenew,
  'scope-change': applyScopeChange,
  'contract-changed': applyContractChanged,
  block: applyBlock,
  unblock: applyUnblock,
  done: applyDone,
  release: (state, event, facts) => relinquish(state, event, 'todo', 'released', facts, false),
  cancel: (state, event, facts) => relinquish(state, event, 'cancelled', 'cancelled', facts, false),
  revoke: applyRevoke,
  'end-session': applyEndSession,
  'integration-started': applyIntegrationStarted,
  'validation-failed': applyValidationFailed,
  'integration-aborted': applyIntegrationAborted,
  integrated: applyIntegrated,
  'plan-revision-started': applyPlanRevisionStarted,
  'plan-revised': applyPlanRevised,
}

function transition(inputState, event, externalFacts) {
  try {
    const initialProblems = validateState(inputState)
    if (initialProblems.length) return reject(RejectReason.INVALID_STATE, initialProblems)
    const fenceFailure = verifyCommonFence(inputState, event, externalFacts)
    if (fenceFailure) return fenceFailure
    const state = clone(inputState)
    const eventCopy = clone(event)
    const factsCopy = clone(externalFacts)
    const handler = handlers[event.type]
    const failure = handler(state, eventCopy, factsCopy)
    if (failure) return failure
    state.revision = inputState.revision + 1
    state.controlOid = externalFacts.nextControlOid
    state.controlOids[state.controlOid] = true
    state.eventIds[event.eventId] = { revision: state.revision, type: event.type }
    const finalProblems = validateState(state)
    if (finalProblems.length) return reject(RejectReason.INVALID_STATE, finalProblems)
    return success(state)
  } catch (error) {
    return reject(RejectReason.INVALID_EVENT, error.message)
  }
}

module.exports = {
  EVENT_TYPES,
  RejectReason,
  boundariesOverlap,
  canonicalBoundary,
  createInitialState,
  scopeDigest,
  transition,
  validateState,
}
