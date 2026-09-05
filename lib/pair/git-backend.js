'use strict'

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

class BackendError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'BackendError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

function runGit(repoDir, args, options = {}) {
  const result = spawnSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
    input: options.input,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) throw new BackendError('GitUnavailable', result.error.message)
  return {
    code: result.status === null ? 1 : result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  }
}

function checkedGit(repoDir, args, options) {
  const result = runGit(repoDir, args, options)
  if (result.code !== 0) {
    throw new BackendError('GitCommandFailed', `git ${args[0]} failed`, {
      code: result.code,
      stderr: result.stderr.trim(),
    })
  }
  return result.stdout
}

function requireRepository(repoDir) {
  if (typeof repoDir !== 'string' || repoDir.length === 0) throw new BackendError('InvalidRepository', 'repository path is required')
  const resolved = path.resolve(repoDir)
  const probe = runGit(resolved, ['rev-parse', '--git-dir'])
  if (probe.code !== 0) throw new BackendError('InvalidRepository', `${resolved} is not a Git repository`)
  return resolved
}

function commonDirectory(repoDir) {
  const raw = checkedGit(repoDir, ['rev-parse', '--git-common-dir']).trim()
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(repoDir, raw)
  return fs.realpathSync(absolute)
}

function objectFormat(repoDir) {
  const result = runGit(repoDir, ['rev-parse', '--show-object-format'])
  return result.code === 0 && result.stdout.trim() === 'sha256' ? 'sha256' : 'sha1'
}

function nullOidFor(format) {
  return '0'.repeat(format === 'sha256' ? 64 : 40)
}

function validOid(oid, format) {
  const length = format === 'sha256' ? 64 : 40
  return typeof oid === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(oid)
}

function validateRef(repoDir, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('refs/')) throw new BackendError('InvalidRef', `invalid ref: ${String(ref)}`)
  const result = runGit(repoDir, ['check-ref-format', ref])
  if (result.code !== 0) throw new BackendError('InvalidRef', `invalid ref: ${ref}`)
  return ref
}

function validatePrefix(repoDir, prefix) {
  if (typeof prefix !== 'string' || !prefix.startsWith('refs/') || !prefix.endsWith('/')) {
    throw new BackendError('InvalidRefPrefix', `invalid ref prefix: ${String(prefix)}`)
  }
  validateRef(repoDir, `${prefix}probe`)
  return prefix
}

function requireLocalObject(repoDir, oid, format) {
  if (!validOid(oid, format)) throw new BackendError('InvalidOid', `invalid ${format} object id`)
  const result = runGit(repoDir, ['cat-file', '-e', `${oid}^{object}`])
  if (result.code !== 0) throw new BackendError('ObjectMissing', `object is not present locally: ${oid}`)
}

function parseRefLines(output, prefix) {
  const refs = []
  for (const line of output.trim().split('\n')) {
    if (!line) continue
    const match = /^([0-9a-f]+)[\t ]+(refs\/\S+)$/.exec(line)
    if (!match || !match[2].startsWith(prefix)) continue
    refs.push({ ref: match[2], oid: match[1] })
  }
  refs.sort((a, b) => a.ref.localeCompare(b.ref))
  return refs
}

function objectContents(repoDir, oid, format) {
  requireLocalObject(repoDir, oid, format)
  const type = checkedGit(repoDir, ['cat-file', '-t', oid]).trim()
  const content = checkedGit(repoDir, ['cat-file', '-p', oid])
  return { oid, type, content }
}

function objectReachableFrom(repoDir, rootOid, targetOid) {
  const output = checkedGit(repoDir, ['rev-list', '--objects', rootOid])
  return output.split('\n').some(line => line.split(' ', 1)[0] === targetOid)
}

class CommonDirGitBackend {
  constructor(repoDir) {
    this.repoDir = requireRepository(repoDir)
    this.commonDir = commonDirectory(this.repoDir)
    this.kind = 'common-dir'
    this.id = `common-dir:${this.commonDir}`
    this.objectFormat = objectFormat(this.repoDir)
    this.nullOid = nullOidFor(this.objectFormat)
  }

  read(ref) {
    validateRef(this.repoDir, ref)
    const result = runGit(this.repoDir, ['show-ref', '--verify', '--hash', ref])
    if (result.code === 1 || /not a valid ref/i.test(result.stderr)) return null
    if (result.code !== 0) throw new BackendError('GitCommandFailed', 'git show-ref failed', { stderr: result.stderr.trim() })
    return result.stdout.trim()
  }

  compareAndSwap(ref, newOid, expectedOid = null) {
    validateRef(this.repoDir, ref)
    requireLocalObject(this.repoDir, newOid, this.objectFormat)
    if (expectedOid !== null && !validOid(expectedOid, this.objectFormat)) throw new BackendError('InvalidOid', 'invalid expected object id')
    const result = runGit(this.repoDir, ['update-ref', ref, newOid, expectedOid || this.nullOid])
    if (result.code === 0) return { ok: true, ref, oid: newOid, previousOid: expectedOid }
    const actualOid = this.read(ref)
    if (actualOid !== expectedOid) return { ok: false, reason: 'stale', ref, expectedOid, actualOid }
    throw new BackendError('CasFailed', 'local ref CAS failed without a stale lease', { stderr: result.stderr.trim() })
  }

  list(prefix) {
    validatePrefix(this.repoDir, prefix)
    const output = checkedGit(this.repoDir, ['for-each-ref', '--format=%(objectname) %(refname)', prefix])
    return parseRefLines(output, prefix)
  }

  readObject(oid, options = {}) {
    if (options.reachableFromRef !== undefined) {
      validateRef(this.repoDir, options.reachableFromRef)
      const rootOid = this.read(options.reachableFromRef)
      if (!rootOid || !objectReachableFrom(this.repoDir, rootOid, oid)) {
        throw new BackendError('ObjectUnreachable', `object is not reachable from the advertised ref: ${oid}`)
      }
    }
    return objectContents(this.repoDir, oid, this.objectFormat)
  }
}

function scrubRemoteUrl(rawUrl, repoDir) {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(rawUrl)) {
    try {
      const parsed = new URL(rawUrl)
      parsed.username = ''
      parsed.password = ''
      return parsed.toString()
    } catch {
      throw new BackendError('InvalidRemote', 'remote URL is invalid')
    }
  }
  if (/^[^/]+@[^:]+:.+/.test(rawUrl)) return rawUrl.replace(/^[^@]+@/, '')
  const absolute = path.isAbsolute(rawUrl) ? rawUrl : path.resolve(repoDir, rawUrl)
  return fs.existsSync(absolute) ? fs.realpathSync(absolute) : absolute
}

function remoteIdentity(repoDir, remoteName) {
  const result = runGit(repoDir, ['remote', 'get-url', remoteName])
  if (result.code !== 0) throw new BackendError('RemoteMissing', `remote is not configured: ${remoteName}`)
  return scrubRemoteUrl(result.stdout.trim(), repoDir)
}

class RemoteGitBackend {
  constructor(repoDir, remoteName = 'origin') {
    this.repoDir = requireRepository(repoDir)
    this.remoteName = remoteName
    this.remoteUrl = remoteIdentity(this.repoDir, remoteName)
    this.kind = 'remote'
    this.id = `remote:${this.remoteUrl}`
    this.objectFormat = objectFormat(this.repoDir)
  }

  read(ref) {
    validateRef(this.repoDir, ref)
    const result = runGit(this.repoDir, ['ls-remote', '--refs', this.remoteName, ref])
    if (result.code !== 0) throw new BackendError('RemoteReadFailed', 'remote ref read failed', { stderr: result.stderr.trim() })
    const refs = parseRefLines(result.stdout, ref).filter(entry => entry.ref === ref)
    if (refs.length === 0) return null
    if (refs.length !== 1) throw new BackendError('RemoteReadFailed', `remote returned multiple values for ${ref}`)
    return refs[0].oid
  }

  compareAndSwap(ref, newOid, expectedOid = null) {
    validateRef(this.repoDir, ref)
    requireLocalObject(this.repoDir, newOid, this.objectFormat)
    if (expectedOid !== null && !validOid(expectedOid, this.objectFormat)) throw new BackendError('InvalidOid', 'invalid expected object id')
    const lease = `--force-with-lease=${ref}:${expectedOid || ''}`
    const result = runGit(this.repoDir, ['push', '--porcelain', lease, this.remoteName, `${newOid}:${ref}`])
    if (result.code === 0) return { ok: true, ref, oid: newOid, previousOid: expectedOid }
    let actualOid
    try {
      actualOid = this.read(ref)
    } catch (readError) {
      throw new BackendError('RemoteCasUnknown', 'remote CAS failed and the current ref could not be read', {
        push: result.stderr.trim(),
        read: readError.message,
      })
    }
    if (actualOid !== expectedOid) return { ok: false, reason: 'stale', ref, expectedOid, actualOid }
    throw new BackendError('CasFailed', 'remote ref CAS failed without a stale lease', { stderr: result.stderr.trim() })
  }

  list(prefix) {
    validatePrefix(this.repoDir, prefix)
    const result = runGit(this.repoDir, ['ls-remote', '--refs', this.remoteName, `${prefix}*`])
    if (result.code !== 0) throw new BackendError('RemoteReadFailed', 'remote ref listing failed', { stderr: result.stderr.trim() })
    return parseRefLines(result.stdout, prefix)
  }

  readObject(oid, options = {}) {
    const reachableFromRef = options.reachableFromRef
    validateRef(this.repoDir, reachableFromRef)
    const advertisedOid = this.read(reachableFromRef)
    if (!advertisedOid) throw new BackendError('ObjectUnreachable', `advertised ref is absent: ${reachableFromRef}`)
    const fetch = runGit(this.repoDir, ['fetch', '--quiet', '--no-tags', this.remoteName, reachableFromRef])
    if (fetch.code !== 0) throw new BackendError('ObjectFetchFailed', 'failed to fetch advertised ref', { stderr: fetch.stderr.trim() })
    const fetchedOid = checkedGit(this.repoDir, ['rev-parse', 'FETCH_HEAD']).trim()
    if (!objectReachableFrom(this.repoDir, fetchedOid, oid)) {
      throw new BackendError('ObjectUnreachable', `object is not reachable from the advertised ref: ${oid}`)
    }
    try {
      return objectContents(this.repoDir, oid, this.objectFormat)
    } catch (error) {
      if (error instanceof BackendError && error.code === 'ObjectMissing') {
        throw new BackendError('ObjectUnreachable', `object is not reachable from the advertised ref: ${oid}`)
      }
      throw error
    }
  }
}

function selectCoordinationBackend(repoDirs, options = {}) {
  if (!Array.isArray(repoDirs) || repoDirs.length === 0) throw new BackendError('InvalidRepository', 'at least one repository is required')
  const repositories = repoDirs.map(requireRepository)
  const commonDirs = repositories.map(commonDirectory)
  if (commonDirs.every(value => value === commonDirs[0])) return new CommonDirGitBackend(repositories[0])
  const remoteName = options.remoteName || 'origin'
  const identities = repositories.map(repoDir => remoteIdentity(repoDir, remoteName))
  if (!identities.every(value => value === identities[0])) {
    throw new BackendError('BackendMismatch', 'participants do not share a Git common directory or remote identity')
  }
  return new RemoteGitBackend(repositories[0], remoteName)
}

module.exports = {
  BackendError,
  CommonDirGitBackend,
  RemoteGitBackend,
  selectCoordinationBackend,
}
