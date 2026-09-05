'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  BackendError,
  CommonDirGitBackend,
  RemoteGitBackend,
  selectCoordinationBackend,
} = require('../lib/pair/git-backend')

function git(repoDir, args, options = {}) {
  return execFileSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
    input: options.input,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function temporaryDirectory(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`))
}

function initializeRepository(repoDir, bare = false) {
  fs.mkdirSync(repoDir, { recursive: true })
  execFileSync('git', ['init', ...(bare ? ['--bare'] : []), repoDir], { stdio: 'ignore' })
  if (!bare) {
    git(repoDir, ['config', 'user.name', 'Baton Test'])
    git(repoDir, ['config', 'user.email', 'baton@example.invalid'])
  }
}

function commitFile(repoDir, relativePath, contents, message) {
  const target = path.join(repoDir, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents)
  git(repoDir, ['add', relativePath])
  git(repoDir, ['commit', '-m', message])
  return git(repoDir, ['rev-parse', 'HEAD'])
}

function clone(remoteDir, cloneDir) {
  execFileSync('git', ['clone', remoteDir, cloneDir], { stdio: 'ignore' })
  git(cloneDir, ['config', 'user.name', 'Baton Test'])
  git(cloneDir, ['config', 'user.email', 'baton@example.invalid'])
}

test('common-dir adapter exposes only the four backend operations', () => {
  const root = temporaryDirectory('baton-common-surface')
  const repo = path.join(root, 'repo')
  initializeRepository(repo)
  commitFile(repo, 'README.md', 'base\n', 'base')
  const backend = new CommonDirGitBackend(repo)
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(backend)).filter(name => name !== 'constructor').sort()
  assert.deepEqual(methods, ['compareAndSwap', 'list', 'read', 'readObject'])
})

test('common-dir CAS rejects stale expected OIDs and preserves the winner', () => {
  const root = temporaryDirectory('baton-common-cas')
  const repo = path.join(root, 'repo')
  const linked = path.join(root, 'linked')
  initializeRepository(repo)
  const firstOid = commitFile(repo, 'value.txt', 'one\n', 'one')
  const secondOid = commitFile(repo, 'value.txt', 'two\n', 'two')
  git(repo, ['worktree', 'add', '-b', 'linked-test', linked, firstOid])

  const first = new CommonDirGitBackend(repo)
  const second = new CommonDirGitBackend(linked)
  assert.equal(first.id, second.id)
  assert.equal(selectCoordinationBackend([repo, linked]).kind, 'common-dir')

  const ref = 'refs/baton-pass/state'
  assert.equal(first.read(ref), null)
  assert.deepEqual(first.compareAndSwap(ref, firstOid, null), {
    ok: true, ref, oid: firstOid, previousOid: null,
  })
  const stale = second.compareAndSwap(ref, secondOid, null)
  assert.deepEqual(stale, { ok: false, reason: 'stale', ref, expectedOid: null, actualOid: firstOid })
  assert.equal(first.read(ref), firstOid)
  assert.equal(second.compareAndSwap(ref, secondOid, firstOid).ok, true)
  assert.equal(first.read(ref), secondOid)
  assert.deepEqual(first.list('refs/baton-pass/'), [{ ref, oid: secondOid }])
  const object = second.readObject(secondOid)
  assert.equal(object.type, 'commit')
  assert.match(object.content, /two/)
})

test('remote adapter provides expected-OID CAS across two independent clones', () => {
  const root = temporaryDirectory('baton-remote-cas')
  const remote = path.join(root, 'remote.git')
  const cloneA = path.join(root, 'clone-a')
  const cloneB = path.join(root, 'clone-b')
  initializeRepository(remote, true)
  clone(remote, cloneA)
  const baseOid = commitFile(cloneA, 'base.txt', 'base\n', 'base')
  git(cloneA, ['branch', '-M', 'main'])
  git(cloneA, ['push', '-u', 'origin', 'main'])
  git(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  clone(remote, cloneB)
  assert.equal(git(cloneB, ['rev-parse', 'HEAD']), baseOid)

  const candidateA = commitFile(cloneA, 'a.txt', 'agent a\n', 'candidate-a')
  const candidateB = commitFile(cloneB, 'b.txt', 'agent b\n', 'candidate-b')
  const backendA = new RemoteGitBackend(cloneA)
  const backendB = new RemoteGitBackend(cloneB)
  assert.equal(backendA.id, backendB.id)
  assert.notEqual(new CommonDirGitBackend(cloneA).id, new CommonDirGitBackend(cloneB).id)
  assert.equal(selectCoordinationBackend([cloneA, cloneB]).kind, 'remote')

  const ref = 'refs/baton-pass/state'
  assert.equal(backendA.compareAndSwap(ref, candidateA, null).ok, true)
  const loser = backendB.compareAndSwap(ref, candidateB, null)
  assert.deepEqual(loser, { ok: false, reason: 'stale', ref, expectedOid: null, actualOid: candidateA })
  assert.equal(backendB.read(ref), candidateA)

  const fetched = backendB.readObject(candidateA, { reachableFromRef: ref })
  assert.equal(fetched.type, 'commit')
  assert.match(fetched.content, /candidate-a/)
  assert.throws(
    () => backendB.readObject(candidateB, { reachableFromRef: ref }),
    error => error instanceof BackendError && error.code === 'ObjectUnreachable',
    'a private local object is not authority unless the advertised ref reaches it',
  )

  const retry = backendB.compareAndSwap(ref, candidateB, candidateA)
  assert.equal(retry.ok, true)
  assert.equal(backendA.read(ref), candidateB)
  assert.deepEqual(backendA.list('refs/baton-pass/'), [{ ref, oid: candidateB }])
})

test('remote object access fails closed without an advertised reachability ref', () => {
  const root = temporaryDirectory('baton-remote-object')
  const remote = path.join(root, 'remote.git')
  const repo = path.join(root, 'repo')
  initializeRepository(remote, true)
  clone(remote, repo)
  const objectOid = commitFile(repo, 'private.txt', 'private\n', 'private')
  const backend = new RemoteGitBackend(repo)
  assert.throws(
    () => backend.readObject(objectOid, {}),
    error => error instanceof BackendError && error.code === 'InvalidRef',
  )
})

test('backend selection rejects participants pinned to different remotes', () => {
  const root = temporaryDirectory('baton-backend-mismatch')
  const remoteA = path.join(root, 'a.git')
  const remoteB = path.join(root, 'b.git')
  const repoA = path.join(root, 'repo-a')
  const repoB = path.join(root, 'repo-b')
  initializeRepository(remoteA, true)
  initializeRepository(remoteB, true)
  clone(remoteA, repoA)
  clone(remoteB, repoB)
  assert.throws(
    () => selectCoordinationBackend([repoA, repoB]),
    error => error instanceof BackendError && error.code === 'BackendMismatch',
  )
})
