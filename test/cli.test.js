'use strict'

// Smoke tests for bin/baton-pass.js. Run with: node --test test/
// Requires Node >= 18 (node:test). The package itself still supports Node >= 16.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BIN = path.resolve(__dirname, '..', 'bin', 'baton-pass.js')

function run(args, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    })
    return { code: 0, stdout, stderr: '' }
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout || '', stderr: e.stderr || '' }
  }
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bp-test-'))
}

// --- help / dispatch -------------------------------------------------------

test('help prints usage and exits 0', () => {
  const r = run(['help'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /baton-pass install/)
  assert.match(r.stdout, /baton-pass status/)
})

test('no command prints usage', () => {
  assert.match(run([]).stdout, /Usage:/)
})

test('unknown command exits 1', () => {
  const r = run(['bogus'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /Unknown command/)
})

// --- install -------------------------------------------------------------

test('install --help exits 0 with usage', () => {
  const r = run(['install', '--help'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /install flags:/)
})

test('install --codex-home: copy, idempotent, then --force', () => {
  const dir = tmp()
  const home = path.join(dir, '.codex')
  fs.mkdirSync(home)

  let r = run(['install', '--codex-home', home, '--skill-only'])
  assert.equal(r.code, 0)
  assert.ok(fs.existsSync(path.join(home, 'skills', 'baton-pass', 'SKILL.md')))
  assert.match(r.stdout, /write/)

  r = run(['install', '--codex-home', home, '--skill-only'])
  assert.match(r.stdout, /skip/)
  assert.doesNotMatch(r.stdout, /write/)

  r = run(['install', '--codex-home', home, '--skill-only', '--force'])
  assert.match(r.stdout, /write/)
})

test('install without --skill-only also drops prompt files for a codex home', () => {
  const home = path.join(tmp(), '.codex')
  fs.mkdirSync(home, { recursive: true })
  run(['install', '--codex-home', home])
  assert.ok(fs.existsSync(path.join(home, 'prompts', 'baton-pass.md')))
  assert.ok(fs.existsSync(path.join(home, 'prompts', 'hindsight.md')))
})

test('install --link symlinks, and --link --force never deletes a real dir', () => {
  const home = path.join(tmp(), '.codex')
  const dest = path.join(home, 'skills', 'baton-pass')
  fs.mkdirSync(home, { recursive: true })

  run(['install', '--codex-home', home, '--skill-only', '--link'])
  assert.ok(fs.lstatSync(dest).isSymbolicLink())

  // replace the symlink with a real dir holding a user file
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  fs.writeFileSync(path.join(dest, 'mine.txt'), 'keep me')

  const r = run(['install', '--codex-home', home, '--skill-only', '--link', '--force'])
  assert.match(r.stdout, /real directory/)
  assert.ok(fs.existsSync(path.join(dest, 'mine.txt')), 'user file must survive')
})

test('install --codex-home with no value exits 1', () => {
  const r = run(['install', '--codex-home'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /needs a directory/)
})

test('install with an unknown flag exits 1', () => {
  assert.equal(run(['install', '--nope']).code, 1)
})

// --- init --------------------------------------------------------------

test('init scaffolds a repo; rerun skips; --force overwrites', () => {
  const dir = tmp()
  let r = run(['init', dir])
  assert.equal(r.code, 0)
  for (const f of [
    'baton-pass.config.json',
    'baton-pass.state.json',
    'docs/agent-handoff.md',
    'docs/current-state.md',
    'docs/next-task.md',
    'docs/progress.md',
    '.gitignore',
    '.claude/commands/baton-pass.md',
  ]) {
    assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`)
  }
  assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /# Baton Pass local files/)

  r = run(['init', dir])
  assert.match(r.stdout, /skip/)

  r = run(['init', dir, '--force'])
  assert.match(r.stdout, /write/)
})

// --- status ----------------------------------------------------------

test('status in an uninitialized dir exits 1', () => {
  const r = run(['status', tmp()])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /No Baton Pass setup/)
})

test('status after init prints a readout', () => {
  const dir = tmp()
  run(['init', dir])
  const r = run(['status', dir])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /Baton Pass — status/)
  assert.match(r.stdout, /last move:\s+new-game/)
})

test('status --json emits parseable structured output', () => {
  const dir = tmp()
  run(['init', dir])
  const data = JSON.parse(run(['status', dir, '--json']).stdout)
  assert.equal(data.stateFile.lastMove, 'new-game')
  assert.ok('turnState' in data)
  assert.ok(Array.isArray(data.recentSessions))
})

test('status flags a state.json / next-task.md disagreement', () => {
  const dir = tmp()
  run(['init', dir])
  const sf = path.join(dir, 'baton-pass.state.json')
  const s = JSON.parse(fs.readFileSync(sf, 'utf8'))
  s.state = 'handed-off'
  fs.writeFileSync(sf, JSON.stringify(s))
  // next-task.md template still says "State: active"
  const r = run(['status', dir])
  assert.match(r.stdout, /disagrees on: state/)
  assert.match(r.stdout, /next-task wins/)
})
