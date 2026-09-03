#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')

const PKG_ROOT = path.resolve(__dirname, '..')
const COMMANDS_SRC = path.join(PKG_ROOT, 'commands')
const TEMPLATES_SRC = path.join(PKG_ROOT, 'templates')
const SKILL_SRC = path.join(PKG_ROOT, 'skills', 'baton-pass')
const SKILL_NAME = 'baton-pass'

const MOVES = ['new-game', 'save-state', 'baton-pass', 'foresight', 'dragon-dance', 'party-check', 'hindsight']
const LOCAL_GITIGNORE_BLOCK = [
  '# Baton Pass local files',
  '.claude/settings.local.json',
  '.npm-cache/',
  '.tmp-*/',
  '',
  '# Baton Pass local state',
  'baton-pass.config.json',
  'baton-pass.state.json',
  'docs/',
].join('\n')
const TRACKED_GITIGNORE_BLOCK = [
  '# Baton Pass local files',
  '.claude/settings.local.json',
  '.npm-cache/',
  '.tmp-*/',
].join('\n')

const HELP = `
baton-pass — low-token handoff workflow for multi-agent repos

Usage:
  npx baton-pass install [flags]         install the skill + moves for Claude and Codex (user-level)
  npx baton-pass init [target-dir]       set up the current repo (memory files + Claude commands)
  npx baton-pass init --track-state      same, but leave state files trackable by git
  npx baton-pass commands [target-dir]   install only Claude Code slash commands into a repo
  npx baton-pass help                    show this message

install flags:
  --claude                 install into ~/.claude only
  --codex                  install into every ~/.codex* home only
  --claude-home <dir>      use an explicit Claude home (repeatable)
  --codex-home <dir>       use an explicit Codex home (repeatable; $CODEX_HOME is also picked up)
  --skill-only             skip slash commands / app prompts, install the skill only
  --link                   symlink the skill dir instead of copying (updates on git pull)
  --force                  overwrite existing files (default: skip and report)

With no target flags, install auto-detects: ~/.claude (if present) and every ~/.codex* home.

After install:
  Claude Code (CLI + IDE)   skill auto-loads; /new-game /save-state /baton-pass /foresight
                            /dragon-dance /party-check /hindsight
  Codex CLI                 skill auto-loads; run it explicitly with $baton-pass
  Codex desktop app         skill auto-loads; /prompts:baton-pass in the composer
`.trim()

// ---------------------------------------------------------------------------
// fs helpers
// ---------------------------------------------------------------------------

function lexists(p) {
  try { fs.lstatSync(p); return true } catch { return false }
}

function copyFile(src, dest, force) {
  const dir = path.dirname(dest)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (fs.existsSync(dest) && !force) {
    console.log(`  skip   ${dest}`)
    return
  }
  fs.copyFileSync(src, dest)
  console.log(`  write  ${dest}`)
}

function copyTree(src, dest, force) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dest, entry), force)
    }
  } else {
    copyFile(src, dest, force)
  }
}

function linkDir(src, dest, force) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (lexists(dest)) {
    const isLink = fs.lstatSync(dest).isSymbolicLink()
    if (isLink && path.resolve(path.dirname(dest), fs.readlinkSync(dest)) === src) {
      console.log(`  ok     ${dest} -> ${src}`)
      return
    }
    if (!force) {
      console.log(`  skip   ${dest} (exists; pass --force to replace)`)
      return
    }
    if (!isLink) {
      // Never recursively delete a real directory. Ask the user to move it aside.
      console.log(`  skip   ${dest} (real directory, not a link — move it aside to use --link)`)
      return
    }
    fs.unlinkSync(dest) // swap one symlink for another
  }
  fs.symlinkSync(src, dest, 'dir')
  console.log(`  link   ${dest} -> ${src}`)
}

// ---------------------------------------------------------------------------
// repo-scoped install (init / commands) — unchanged behavior
// ---------------------------------------------------------------------------

function installCommands(targetDir, force) {
  const dest = path.join(targetDir, '.claude', 'commands')
  console.log('\nInstalling Claude Code slash commands...')
  for (const move of MOVES) {
    const src = path.join(COMMANDS_SRC, `${move}.md`)
    if (fs.existsSync(src)) {
      copyFile(src, path.join(dest, `${move}.md`), force)
    }
  }
}

function installDocs(targetDir, force) {
  const configDest = path.join(targetDir, 'baton-pass.config.json')
  copyFile(path.join(TEMPLATES_SRC, 'baton-pass.config.template.json'), configDest, force)

  const config = JSON.parse(fs.readFileSync(configDest, 'utf8'))
  const p = config.paths

  const docFiles = [
    { template: 'agent-handoff.template.md',       dest: p.handoff },
    { template: 'current-state.template.md',        dest: p.currentState },
    { template: 'next-task.template.md',             dest: p.nextTask },
    { template: 'progress-log.template.md',          dest: p.progressLog },
    { template: 'baton-pass.state.template.json',    dest: p.stateFile },
  ]

  console.log('\nInstalling shared memory files...')
  for (const entry of docFiles) {
    const src = path.join(TEMPLATES_SRC, entry.template)
    copyFile(src, path.join(targetDir, entry.dest), force)
  }
}

function installGitignore(targetDir, trackState) {
  const dest = path.join(targetDir, '.gitignore')
  const marker = '# Baton Pass local files'
  const block = trackState ? TRACKED_GITIGNORE_BLOCK : LOCAL_GITIGNORE_BLOCK
  let current = ''

  if (fs.existsSync(dest)) {
    current = fs.readFileSync(dest, 'utf8')
    if (current.includes(marker)) {
      console.log('\nUpdating .gitignore...')
      console.log(`  skip   ${dest}`)
      return
    }
  }

  const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : ''
  const spacer = current.trim().length > 0 ? '\n' : ''
  fs.appendFileSync(dest, `${prefix}${spacer}${block}\n`)
  console.log('\nUpdating .gitignore...')
  console.log(`  write  ${dest}`)
}

function init(targetDir, force, trackState) {
  console.log(`\nRunning baton-pass new-game in: ${path.resolve(targetDir)}`)
  installDocs(targetDir, force)
  installCommands(targetDir, force)
  installGitignore(targetDir, trackState)
  console.log(`
Done. Next steps:
  1. Review baton-pass.config.json — adjust paths if needed
  2. Fill in docs/current-state.md and docs/next-task.md
  3. Customize docs/agent-handoff.md with repo-specific rules
  4. Review the Baton Pass block added to .gitignore (${trackState ? 'state files are trackable' : 'state files are local-only'})
  5. Start appending sessions to docs/progress.md

Slash commands are ready in .claude/commands/
Use /new-game, /save-state, /baton-pass, /foresight, /dragon-dance, /party-check, /hindsight in Claude Code.
`)
}

// ---------------------------------------------------------------------------
// user-level install (install) — Claude + Codex, CLI + app
// ---------------------------------------------------------------------------

function installSkillInto(agentHome, { link, force }) {
  const dest = path.join(agentHome, 'skills', SKILL_NAME)
  if (link) {
    linkDir(SKILL_SRC, dest, force)
  } else {
    copyTree(SKILL_SRC, dest, force)
  }
}

function installMovesInto(dir, force) {
  for (const move of MOVES) {
    const src = path.join(COMMANDS_SRC, `${move}.md`)
    if (fs.existsSync(src)) copyFile(src, path.join(dir, `${move}.md`), force)
  }
}

function discoverCodexHomes() {
  const homes = new Set()
  if (process.env.CODEX_HOME) homes.add(path.resolve(process.env.CODEX_HOME))
  const home = os.homedir()
  for (const entry of fs.readdirSync(home)) {
    if (entry === '.codex' || entry.startsWith('.codex-')) {
      const full = path.join(home, entry)
      if (fs.statSync(full).isDirectory()) homes.add(full)
    }
  }
  return [...homes]
}

function installAgents(opts) {
  const claudeHomes = opts.claudeHomes.map(d => path.resolve(d))
  const codexHomes = opts.codexHomes.map(d => path.resolve(d))

  const autodetect = !opts.claude && !opts.codex && claudeHomes.length === 0 && codexHomes.length === 0
  const doClaude = opts.claude || claudeHomes.length > 0 || autodetect
  const doCodex = opts.codex || codexHomes.length > 0 || autodetect

  const targets = { claude: [], codex: [] }

  if (doClaude) {
    if (claudeHomes.length > 0) {
      targets.claude = claudeHomes
    } else {
      const def = path.join(os.homedir(), '.claude')
      if (fs.existsSync(def)) targets.claude = [def]
      else if (opts.claude) targets.claude = [def] // explicit --claude: create it
    }
  }

  if (doCodex) {
    targets.codex = codexHomes.length > 0 ? codexHomes : discoverCodexHomes()
  }

  if (targets.claude.length === 0 && targets.codex.length === 0) {
    console.error('No install targets found.')
    console.error('Pass --claude-home <dir> or --codex-home <dir>, or create ~/.claude / ~/.codex first.')
    process.exit(1)
  }

  console.log(`\nbaton-pass install  (${opts.link ? 'symlink' : 'copy'}${opts.force ? ', force' : ''})`)

  for (const h of targets.claude) {
    console.log(`\nClaude  ${h}`)
    installSkillInto(h, opts)
    if (!opts.skillOnly) {
      console.log('  commands ->')
      installMovesInto(path.join(h, 'commands'), opts.force)
    }
  }

  for (const h of targets.codex) {
    console.log(`\nCodex   ${h}`)
    installSkillInto(h, opts)
    if (!opts.skillOnly) {
      console.log('  prompts (desktop app) ->')
      installMovesInto(path.join(h, 'prompts'), opts.force)
    }
  }

  console.log(`
Done.
  Claude Code (CLI + IDE)   skill auto-loads; /new-game … /hindsight are available
  Codex CLI                 skill auto-loads; run it with  $baton-pass
  Codex desktop app         skill auto-loads; /prompts:baton-pass in the composer
${opts.link ? '  (symlinked — `git pull` in this repo updates every surface)\n' : ''}`)
}

function parseInstallArgs(argv) {
  const opts = {
    claude: false, codex: false,
    claudeHomes: [], codexHomes: [],
    skillOnly: false, link: false, force: false,
  }
  const takeValue = (flag, i) => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) {
      console.error(`install: ${flag} needs a directory argument\n`)
      process.exit(1)
    }
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0) }
    switch (a) {
      case '--claude': opts.claude = true; break
      case '--codex': opts.codex = true; break
      case '--claude-home': opts.claudeHomes.push(takeValue(a, i)); i++; break
      case '--codex-home': opts.codexHomes.push(takeValue(a, i)); i++; break
      case '--skill-only': opts.skillOnly = true; break
      case '--link': opts.link = true; break
      case '--force': opts.force = true; break
      default:
        console.error(`install: unknown argument "${a}"\n`)
        console.log(HELP)
        process.exit(1)
    }
  }
  return opts
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const cmd = args[0]
const rest = args.slice(1)
const targetDir = rest.find(a => !a.startsWith('--')) || '.'
const force = args.includes('--force')
const trackState = args.includes('--track-state')

switch (cmd) {
  case 'install':
    installAgents(parseInstallArgs(rest))
    break
  case 'init':
    init(targetDir, force, trackState)
    break
  case 'commands':
    installCommands(targetDir, force)
    console.log('\nDone.')
    break
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    console.log(HELP)
    break
  default:
    console.error(`Unknown command: ${cmd}\n`)
    console.log(HELP)
    process.exit(1)
}
