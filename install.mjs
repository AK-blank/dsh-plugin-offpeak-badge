#!/usr/bin/env node
/**
 * dsh-plugin-offpeak-badge installer.
 *
 * Deploys this package into a DSH home as a **global plugin** of a profile:
 *
 *   1. puts the package under `<dsh-home>/plugins/dsh-plugin-offpeak-badge/`
 *      (a copy by default, a symlink with `--link`);
 *   2. links it into `<dsh-home>/profiles/node_modules/dsh-plugin-offpeak-badge`
 *      so Cordis can resolve the bare package name from the profile tree;
 *   3. appends the plugin entry to `<dsh-home>/profiles/<profile>/cordis.patch.yml`
 *      (idempotent, with a timestamped backup first).
 *
 * Usage:
 *   node install.mjs [options]
 *
 *   --home <dir>       DSH home (default: $DSH_HOME or ~/.dsh)
 *   --profile <name>   profile to patch (default: web)
 *   --dir <path>       deploy directory (default: <home>/plugins/<package>)
 *   --link             symlink the deploy directory to this checkout instead of copying
 *   --copy             copy the package (default)
 *   --uninstall        remove the patch entry and the profile link
 *   --purge            with --uninstall: also delete the deploy directory
 *   --dry-run          print what would happen, change nothing
 *   --help             this text
 *
 * Nothing outside the DSH home is ever written or removed.
 */

import { existsSync } from 'node:fs'
import { cp, lstat, mkdir, readFile, readlink, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_NAME = 'dsh-plugin-offpeak-badge'
const ENTRY_ID = 'offpeak-badge'
const MARK_BEGIN = `# >>> ${PACKAGE_NAME} — installed by install.mjs >>>`
const MARK_END = `# <<< ${PACKAGE_NAME} <<<`
const HERE = dirname(fileURLToPath(import.meta.url))
const SKIP = new Set(['.git', 'node_modules', '.DS_Store', 'browser-tmp'])

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const value = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback
}

const HELP = `dsh-plugin-offpeak-badge installer

  node install.mjs [--home <dir>] [--profile <name>] [--dir <path>]
                   [--link|--copy] [--uninstall [--purge]] [--dry-run]

  Defaults: home=$DSH_HOME or ~/.dsh, profile=web, mode=copy
  English + 中文 are both shipped by the plugin itself; this script only wires it up.
`

if (flag('help')) {
  process.stdout.write(HELP)
  process.exit(0)
}

const dryRun = flag('dry-run')
const uninstall = flag('uninstall')
const purge = flag('purge')
const useLink = flag('link') && !flag('copy')
const home = resolve(value('home', process.env.DSH_HOME ?? join(homedir(), '.dsh')))
const profile = value('profile', 'web')
const profileDir = join(home, 'profiles', profile)
const patchPath = join(profileDir, 'cordis.patch.yml')
const modulesDir = join(home, 'profiles', 'node_modules')
const linkPath = join(modulesDir, PACKAGE_NAME)
const deployDir = resolve(value('dir', join(home, 'plugins', PACKAGE_NAME)))

const say = (line) => process.stdout.write(`${line}\n`)
const en = (line) => say(`  ${line}`)
const zh = (line) => say(`  ${line}`)
const step = (line) => say(`\n▸ ${line}`)
const act = (line) => say(`  ${dryRun ? '[dry-run] ' : ''}${line}`)

/** Refuse to touch anything outside the DSH home. */
function assertInsideHome(target) {
  if (target !== home && !target.startsWith(home + sep)) {
    throw new Error(`refusing to modify ${target} (outside DSH home ${home})`)
  }
}

/** The YAML block this installer owns. */
function entryBlock() {
  return [
    MARK_BEGIN,
    '# DeepSeek peak/off-peak badge for the Web GUI (bilingual 空闲/高峰 · Idle/Peak).',
    '# Rule: Beijing Mon-Fri 09:00-12:00 & 14:00-18:00, excluding Chinese public holidays,',
    '# is peak; every other hour (weekends and public holidays in full) is off-peak.',
    '# Source and self-test: ~/.dsh/plugins/' + PACKAGE_NAME + '/ (node selftest.mjs)',
    '- insert:',
    `    - id: ${ENTRY_ID}`,
    `      name: '${PACKAGE_NAME}'`,
    MARK_END,
    ''
  ].join('\n')
}

async function ensureProfileNodeModules() {
  if (!existsSync(modulesDir)) {
    act(`mkdir ${modulesDir}`)
    if (!dryRun) await mkdir(modulesDir, { recursive: true })
  }
}

async function deployPackage() {
  step(`deploy ${useLink ? '(symlink)' : '(copy)'} → ${deployDir}`)
  const present = existsSync(deployDir)
  let kind = 'absent'
  if (present) kind = (await lstat(deployDir)).isSymbolicLink() ? 'symlink' : 'directory'

  if (useLink) {
    const target = HERE
    if (kind === 'symlink') {
      const current = resolve(dirname(deployDir), await readlink(deployDir))
      if (current === target) {
        act(`already linked to ${target}`)
        return
      }
    }
    if (present) {
      act(`replace existing ${kind}`)
      if (!dryRun) await rm(deployDir, { recursive: true, force: true })
    }
    act(`symlink ${deployDir} → ${target}`)
    if (!dryRun) await symlink(target, deployDir, 'dir')
    return
  }

  act(`${present ? 'refresh' : 'create'} copy at ${deployDir}`)
  if (!dryRun) {
    if (present && kind === 'symlink') await unlink(deployDir)
    await cp(HERE, deployDir, {
      recursive: true,
      filter: (source) => !SKIP.has(source.slice(source.lastIndexOf(sep) + 1))
    })
  }
}

async function linkIntoProfile() {
  step(`link into the profile resolution root → ${linkPath}`)
  await ensureProfileNodeModules()
  if (existsSync(linkPath)) {
    const stat = await lstat(linkPath)
    if (stat.isSymbolicLink()) {
      const current = resolve(dirname(linkPath), await readlink(linkPath))
      if (current === deployDir) {
        act(`already points at ${deployDir}`)
        return
      }
      act(`repoint ${current} → ${deployDir}`)
      if (!dryRun) await unlink(linkPath)
    } else {
      act(`WARNING: ${linkPath} exists and is not a symlink — leaving it alone`)
      return
    }
  } else {
    act(`symlink ${linkPath} → ${deployDir}`)
  }
  if (!dryRun) await symlink(deployDir, linkPath, 'dir')
}

async function patchProfile() {
  step(`register the plugin in ${patchPath}`)
  if (!existsSync(patchPath)) {
    throw new Error(
      `no cordis.patch.yml at ${patchPath}\n` +
        `  Is "${profile}" the right profile name? Pass --profile <name> (see ${join(home, 'profiles')}).`
    )
  }
  const text = await readFile(patchPath, 'utf8')
  if (text.includes(MARK_BEGIN) || text.includes(`name: '${PACKAGE_NAME}'`) || text.includes(`name: "${PACKAGE_NAME}"`)) {
    act('entry already present — nothing to do')
    return
  }
  const backup = join(home, 'backups', `cordis.patch.yml.before-${ENTRY_ID}-${stamp()}.bak`)
  act(`backup → ${backup}`)
  act('append the plugin entry')
  if (dryRun) return
  await mkdir(dirname(backup), { recursive: true })
  await writeFile(backup, text)
  const separator = text.endsWith('\n') ? '\n' : '\n\n'
  await writeFile(patchPath, `${text}${separator}${entryBlock()}`)
}

async function unpatchProfile() {
  step(`remove the plugin entry from ${patchPath}`)
  if (!existsSync(patchPath)) {
    act('no cordis.patch.yml — nothing to do')
    return
  }
  const text = await readFile(patchPath, 'utf8')
  const begin = text.indexOf(MARK_BEGIN)
  const end = text.indexOf(MARK_END)
  if (begin < 0 || end < 0) {
    act(`no installer block found — if you added the entry by hand, delete the "${ENTRY_ID}" insert yourself`)
    return
  }
  const backup = join(home, 'backups', `cordis.patch.yml.before-${ENTRY_ID}-uninstall-${stamp()}.bak`)
  act(`backup → ${backup}`)
  act('drop the installer block')
  if (dryRun) return
  await mkdir(dirname(backup), { recursive: true })
  await writeFile(backup, text)
  const next = text.slice(0, begin) + text.slice(end + MARK_END.length).replace(/^\n+/, '\n')
  await writeFile(patchPath, next)
}

async function unlinkFromProfile() {
  step(`remove the profile link ${linkPath}`)
  if (!existsSync(linkPath)) {
    act('absent — nothing to do')
    return
  }
  const stat = await lstat(linkPath)
  if (!stat.isSymbolicLink()) {
    act('not a symlink — leaving it alone')
    return
  }
  act('unlink')
  if (!dryRun) await unlink(linkPath)
}

function stamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

async function main() {
  say(`dsh-plugin-offpeak-badge — DSH home: ${home}, profile: ${profile}`)
  assertInsideHome(deployDir)
  assertInsideHome(patchPath)
  assertInsideHome(linkPath)

  if (uninstall) {
    await unpatchProfile()
    await unlinkFromProfile()
    if (purge) {
      step(`delete ${deployDir}`)
      if (existsSync(deployDir)) {
        act('remove')
        if (!dryRun) await rm(deployDir, { recursive: true, force: true })
      } else act('absent — nothing to do')
    } else if (existsSync(deployDir)) {
      en(`deploy directory kept: ${deployDir} (add --purge to delete it)`)
    }
    say('\nDone. Restart `dsh web` if the badge is still on screen.')
    return
  }

  if (!existsSync(join(HERE, 'lib', 'client.js'))) {
    throw new Error(`lib/client.js is missing next to this script (${HERE}) — run install.mjs from a full checkout`)
  }
  await deployPackage()
  await linkIntoProfile()
  await patchProfile()

  step('next')
  en('1. The running `dsh web` reloads cordis.patch.yml live; the badge appears in the')
  en('   GUI sidebar brand row. If it does not, reload the browser page once.')
  en('2. Verify the rule offline:  node selftest.mjs --now')
  say('')
  zh('完成：插件已作为该 profile 的全局插件注册，浏览器左上角品牌位会出现空闲/高峰角标。')
  zh('若角标未出现，刷新一次浏览器页面；仍未出现请重启 `dsh web`。')
}

main().catch((error) => {
  process.stderr.write(`\ninstall failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
