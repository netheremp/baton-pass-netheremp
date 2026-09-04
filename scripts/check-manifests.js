#!/usr/bin/env node
'use strict'

// Repo consistency check — no dependencies. Run: node scripts/check-manifests.js
//  - every manifest is valid JSON
//  - one version across package.json + both plugin manifests + marketplace.json
//  - .codex-plugin/plugin.json satisfies the OpenAI plugin contract
//  - referenced skill / icon files exist
//  - skills/baton-pass/SKILL.md has name + description frontmatter

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const errors = []
const p = (...s) => path.join(ROOT, ...s)

function readJSON(rel) {
  try {
    return JSON.parse(fs.readFileSync(p(rel), 'utf8'))
  } catch (e) {
    errors.push(`${rel}: ${e.message}`)
    return null
  }
}

const pkg = readJSON('package.json')
const claudePlugin = readJSON('.claude-plugin/plugin.json')
const marketplace = readJSON('.claude-plugin/marketplace.json')
const codexPlugin = readJSON('.codex-plugin/plugin.json')

// --- versions in lockstep ------------------------------------------------
const versions = {
  'package.json': pkg?.version,
  '.claude-plugin/plugin.json': claudePlugin?.version,
  '.claude-plugin/marketplace.json': marketplace?.version,
  '.claude-plugin/marketplace.json plugins[0]': marketplace?.plugins?.[0]?.version,
  '.codex-plugin/plugin.json': codexPlugin?.version,
}
const distinct = [...new Set(Object.values(versions).filter(Boolean))]
if (distinct.length > 1) {
  errors.push(`version mismatch: ${JSON.stringify(versions)}`)
}
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
if (pkg && !SEMVER.test(pkg.version || '')) errors.push(`package.json version not semver: ${pkg.version}`)

// --- .codex-plugin/plugin.json contract --------------------------------
if (codexPlugin) {
  const m = codexPlugin
  const allowedTop = new Set([
    'id', 'name', 'version', 'description', 'skills', 'apps', 'mcpServers',
    'interface', 'author', 'homepage', 'repository', 'license', 'keywords',
  ])
  for (const k of Object.keys(m)) {
    if (!allowedTop.has(k)) errors.push(`.codex-plugin/plugin.json: unknown top-level field "${k}"`)
  }
  for (const k of ['name', 'version', 'description']) {
    if (!m[k] || typeof m[k] !== 'string') errors.push(`.codex-plugin/plugin.json: "${k}" is required`)
  }
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(m.name || '')) {
    errors.push(`.codex-plugin/plugin.json: name must be kebab-case identifier`)
  }
  if (m.author && (typeof m.author !== 'object' || !m.author.name)) {
    errors.push(`.codex-plugin/plugin.json: author must be an object with a name`)
  }
  if (m.skills && m.skills !== './skills/') {
    errors.push(`.codex-plugin/plugin.json: skills should be "./skills/" (got ${JSON.stringify(m.skills)})`)
  }

  const iface = m.interface
  if (!iface || typeof iface !== 'object') {
    errors.push(`.codex-plugin/plugin.json: interface object is required`)
  } else {
    for (const k of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category']) {
      if (!iface[k] || typeof iface[k] !== 'string') errors.push(`interface.${k} is required`)
    }
    if (!Array.isArray(iface.capabilities) || !iface.capabilities.every(c => typeof c === 'string' && c)) {
      errors.push(`interface.capabilities must be a non-empty string array`)
    }
    const prompts = iface.defaultPrompt || iface.default_prompt
    if (!Array.isArray(prompts) || prompts.length === 0) {
      errors.push(`interface.defaultPrompt is required`)
    }
    if (iface.brandColor && !/^#[0-9A-Fa-f]{6}$/.test(iface.brandColor)) {
      errors.push(`interface.brandColor must be #RRGGBB`)
    }
    for (const k of ['websiteURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
      if (iface[k] && !/^https:\/\/\S+$/.test(iface[k])) errors.push(`interface.${k} must be an https URL`)
    }
    for (const k of ['composerIcon', 'logo', 'logoDark']) {
      if (iface[k]) {
        if (!iface[k].startsWith('./')) errors.push(`interface.${k} must be a relative "./" path`)
        else if (!fs.existsSync(p(iface[k]))) errors.push(`interface.${k} points to a missing file: ${iface[k]}`)
      }
    }
  }
}

// --- skill file --------------------------------------------------------
const skillMd = p('skills', 'baton-pass', 'SKILL.md')
if (!fs.existsSync(skillMd)) {
  errors.push('skills/baton-pass/SKILL.md is missing')
} else {
  const s = fs.readFileSync(skillMd, 'utf8')
  const fm = s.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) errors.push('skills/baton-pass/SKILL.md: no YAML frontmatter')
  else {
    if (!/^name:\s*\S/m.test(fm[1])) errors.push('SKILL.md frontmatter: name is required')
    if (!/^description:\s*\S/m.test(fm[1])) errors.push('SKILL.md frontmatter: description is required')
  }
}

// --- report ----------------------------------------------------------
if (errors.length) {
  console.error('manifest check FAILED:')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(`manifest check OK — version ${distinct[0]}`)
