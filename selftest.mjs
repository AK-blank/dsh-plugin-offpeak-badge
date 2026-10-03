#!/usr/bin/env node
/**
 * Offline self-test for the DeepSeek peak/off-peak badge client plugin.
 *
 * `node selftest.mjs` evaluates `lib/client.js` exactly the way the browser module
 * table does (stub `window.__ModuleLoader__` and stub `require` for the platform
 * seed words), then asserts:
 *
 *   · the module contract (id = package name, dsh.client declaration, exports);
 *   · the billing rule at every window boundary, on weekends, on make-up work
 *     weekends and on statutory holidays, including calendar-uncovered years;
 *   · the next-switch computation (same day, across a weekend, across a holiday);
 *   · calendar integrity (day counts, no duplicates, make-up days fall on
 *     weekends, official source present);
 *   · the dictionaries: key parity, placeholder parity, no blank strings, and the
 *     rendered tooltip/announcement text in both zh and en;
 *   · the registration contract through a stub context (dictionaries registered for
 *     both locales, three seats, every seat declaring the locale namespace).
 *
 * No network, no browser. `--now` additionally prints the status for the current
 * instant in both languages.
 *
 * Exit code 0 = PASS.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SOURCE = fileURLToPath(new URL('./lib/client.js', import.meta.url))
const PACKAGE = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

let checks = 0
let failures = 0
const check = (label, ok, detail = '') => {
  checks += 1
  if (ok) process.stdout.write(`  ok   ${label}\n`)
  else {
    failures += 1
    process.stdout.write(`  FAIL ${label}${detail ? ` — ${detail}` : ''}\n`)
  }
}

// ── module-table harness ────────────────────────────────────────────────────

/**
 * Minimal React stand-in: enough of the hook contract to call the components
 * directly and inspect the element tree they build (createElement returns plain
 * objects, so no renderer and no dependencies are needed).
 */
const reactStub = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children: children.length > 1 ? children : children[0] } }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null })
}

/** Minimal platform seed words: the rule functions are pure and need no rendering. */
const SEED = {
  react: reactStub,
  '@deepseek-ai/dsh-client-ui-primitives': {
    BrandWordmark: 'BrandWordmark',
    Tag: 'Tag',
    Tooltip: 'Tooltip'
  }
}

const registrations = []
const window = { __ModuleLoader__: { load: (registration) => registrations.push(registration) } }
const requireStub = (spec) => {
  if (spec in SEED) return SEED[spec]
  throw new Error(`selftest: unexpected require("${spec}")`)
}
new Function('window', 'require', readFileSync(SOURCE, 'utf8'))(window, requireStub)

const registration = registrations[0]
const moduleExports = registration.factory(requireStub)
const internals = moduleExports.internals
const { statusAt, beijingClock, formatClock, formatCountdown, badgeLabel, tooltipText, announcementText, weekdayOf, CALENDAR, PEAK_WINDOWS, DICTIONARIES, NS } =
  internals

/** Minimal translate built from a shipped dictionary (same `{name}` interpolation). */
const translator = (locale) => (key, params) => {
  const template = DICTIONARIES[locale][key]
  if (template === undefined) throw new Error(`missing ${locale} key ${key}`)
  return params === undefined ? template : template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}
const tzh = translator('zh')
const ten = translator('en')

/** Beijing wall clock (fixed UTC+8) → absolute instant. */
const bj = (iso) => new Date(`${iso}+08:00`)
/** Status at a Beijing wall-clock string, e.g. `st('2026-10-13T10:00')`. */
const st = (iso) => statusAt(bj(iso))
/** Beijing `YYYY-MM-DD HH:mm` rendering of an instant, for readable assertions. */
const iso = (date) => (date === null ? null : new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' '))

// ── module contract ─────────────────────────────────────────────────────────

process.stdout.write('module contract\n')
check('one __ModuleLoader__ registration', registrations.length === 1)
check('module id equals package name', registration.id === PACKAGE.name, `${registration.id} vs ${PACKAGE.name}`)
check('package declares dsh.client web', PACKAGE.dsh?.client?.platform === 'web')
check('package exports ./client', PACKAGE.exports?.['./client'] === './lib/client.js')
check('exports apply/inject/namespace', typeof moduleExports.apply === 'function' && Array.isArray(moduleExports.inject) && moduleExports.namespace === NS)
check('injects slots and locale services', moduleExports.inject.includes('slots') && moduleExports.inject.includes('locale'))

// ── bundle manifest (what `dsh plugin add` installs) ───────────────────────

process.stdout.write('\nbundle manifest\n')
const patchPath = new URL(PACKAGE.dsh?.bundle?.patch ?? './cordis.patch.yml', import.meta.url)
const patchSource = readFileSync(patchPath, 'utf8')
check('dsh.bundle.patch declared', typeof PACKAGE.dsh?.bundle?.patch === 'string')
check('bundle patch file exists', patchSource.length > 0)
check('bundle patch is shipped by npm (files[])', Array.isArray(PACKAGE.files) && PACKAGE.files.includes('cordis.patch.yml'))
check('bundle patch inserts exactly one row', (patchSource.match(/^\s*- id:/gm) ?? []).length === 1)
check('bundle patch names this package', new RegExp(`name:\\s*'?"?${PACKAGE.name}'"?`).test(patchSource))
check('bundle patch row id is stable', /- id:\s*offpeak-badge\b/.test(patchSource))
check('dsh.compatibility records a tested release', Object.keys(PACKAGE.dsh?.compatibility?.dshReleases ?? {}).length > 0)
const dshPeers = Object.entries(PACKAGE.peerDependencies ?? {}).filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
check('official @deepseek-ai packages are peers, not dependencies', dshPeers.length > 0 && Object.keys(PACKAGE.dependencies ?? {}).length === 0)
check('peer ranges carry a prerelease branch (rc builds stay installable)', dshPeers.every(([, range]) => /-rc\.\d/.test(range) && range.includes('<')))
const installer = readFileSync(new URL('./install.mjs', import.meta.url), 'utf8')
check('installer entry id matches the bundle patch', installer.includes(`const ENTRY_ID = 'offpeak-badge'`))
check('installer package name matches package.json', installer.includes(`const PACKAGE_NAME = '${PACKAGE.name}'`))

// ── rule: peak windows on a plain working weekday ───────────────────────────

process.stdout.write('\nrule — 2026-10-13 (Tuesday, no holiday)\n')
const weekdayCases = [
  ['2026-10-13T00:00', true, '00:00 off-peak'],
  ['2026-10-13T08:59', true, '08:59 off-peak (before peak)'],
  ['2026-10-13T09:00', false, '09:00 peak starts'],
  ['2026-10-13T11:59', false, '11:59 still peak'],
  ['2026-10-13T12:00', true, '12:00 peak ends'],
  ['2026-10-13T13:59', true, '13:59 midday off-peak'],
  ['2026-10-13T14:00', false, '14:00 afternoon peak starts'],
  ['2026-10-13T17:59', false, '17:59 still peak'],
  ['2026-10-13T18:00', true, '18:00 peak ends'],
  ['2026-10-13T23:59', true, '23:59 off-peak']
]
for (const [when, offPeak, label] of weekdayCases) {
  const status = st(when)
  check(label, status.offPeak === offPeak, `offPeak=${status.offPeak}`)
}

// ── rule: weekends, including make-up work weekends ─────────────────────────

process.stdout.write('\nrule — weekends and make-up work weekends\n')
for (const when of ['2026-10-10T10:00', '2026-10-10T15:00', '2026-10-11T10:00']) {
  const status = st(when)
  check(`${when} weekend is off-peak all day`, status.offPeak === true && status.weekend === true)
}
check('2026-10-10 recognised as a make-up workday', st('2026-10-10T10:00').makeupWorkday === true)
check('make-up work weekend still off-peak at 10:00', st('2026-10-10T10:00').offPeak === true && st('2026-10-10T10:00').day === 'makeupWeekend')
check('2026-09-20 (Sunday make-up) off-peak all day', st('2026-09-20T10:30').offPeak === true && st('2026-09-20T10:30').makeupWorkday === true)
check('ordinary Saturday off-peak without make-up flag', st('2026-11-07T10:00').offPeak === true && st('2026-11-07T10:00').makeupWorkday === false)

// ── rule: statutory holidays on working weekdays ────────────────────────────

process.stdout.write('\nrule — statutory holidays that fall on weekdays\n')
const holidayCases = [
  ['2026-10-01T10:00', 'National Day (Thursday)'],
  ['2026-10-06T15:00', 'National Day (Tuesday)'],
  ['2026-02-17T10:00', 'Spring Festival (Tuesday)'],
  ['2026-06-19T10:00', 'Dragon Boat (Friday)'],
  ['2026-05-04T15:00', 'Labour Day (Monday)'],
  ['2026-04-06T10:00', 'Qingming (Monday)'],
  ['2026-01-02T10:00', 'New Year (Friday)'],
  ['2025-10-06T10:00', '2025 National Day (Monday)']
]
for (const [when, label] of holidayCases) {
  const status = st(when)
  check(`${label} ${when} off-peak all day`, status.offPeak === true && status.holiday === true && status.day === 'holiday', `offPeak=${status.offPeak} holiday=${status.holiday}`)
}
check('the working day after a holiday is peak again', st('2026-10-08T10:00').offPeak === false && st('2026-10-08T10:00').holiday === false)

// ── rule: calendar-uncovered years degrade explicitly ───────────────────────

process.stdout.write('\nrule — years without a published holiday notice (2027)\n')
const uncovered = st('2027-01-04T10:00')
check('2027 weekday peak hours still count as peak', uncovered.offPeak === false)
check('2027 day code flags the missing calendar', uncovered.calendarCovered === false && uncovered.day === 'workdayUncovered')
check('2027 weekends still off-peak', st('2027-01-09T10:00').offPeak === true)

// ── next-switch computation ─────────────────────────────────────────────────

process.stdout.write('\nnext switch\n')
check('inside peak → end of that window', iso(st('2026-10-13T10:00').switchAt) === '2026-10-13 12:00', iso(st('2026-10-13T10:00').switchAt))
check('midday off-peak → afternoon peak', iso(st('2026-10-13T12:30').switchAt) === '2026-10-13 14:00', iso(st('2026-10-13T12:30').switchAt))
check('early morning → same-day peak start', iso(st('2026-10-13T03:00').switchAt) === '2026-10-13 09:00', iso(st('2026-10-13T03:00').switchAt))
check('after 18:00 → next peak-eligible day 09:00', iso(st('2026-10-13T19:00').switchAt) === '2026-10-14 09:00', iso(st('2026-10-13T19:00').switchAt))
check('Friday after 18:00 skips the weekend → Monday 09:00', iso(st('2026-10-16T19:00').switchAt) === '2026-10-19 09:00', iso(st('2026-10-16T19:00').switchAt))
check('inside a holiday → first working day after it', iso(st('2026-10-03T14:00').switchAt) === '2026-10-08 09:00', iso(st('2026-10-03T14:00').switchAt))
check('next period is the opposite of the current one', st('2026-10-13T10:00').nextOffPeak === true && st('2026-10-13T18:30').nextOffPeak === false)
check('the computed switch really flips the verdict', (() => {
  const before = st('2026-10-13T11:59')
  const after = statusAt(new Date(before.switchAt.getTime() + 60_000))
  return before.offPeak === false && after.offPeak === true
})())

// ── calendar data integrity ────────────────────────────────────────────────

process.stdout.write('\ncalendar data\n')
const expectedCounts = { 2025: [28, 5], 2026: [33, 6] }
for (const [year, [holidays, workdays]] of Object.entries(expectedCounts)) {
  const calendar = CALENDAR[year]
  check(`${year}: ${holidays} holiday days`, calendar.holidays.length === holidays, `got ${calendar.holidays.length}`)
  check(`${year}: ${workdays} make-up workdays`, calendar.workdays.length === workdays, `got ${calendar.workdays.length}`)
  check(`${year}: no duplicate dates`, new Set(calendar.holidays).size === calendar.holidays.length && new Set(calendar.workdays).size === calendar.workdays.length)
  check(`${year}: holidays and make-up days disjoint`, calendar.workdays.every((day) => !calendar.holidays.includes(day)))
  check(`${year}: every make-up day falls on a weekend`, calendar.workdays.every((day) => weekdayOf(day) >= 6))
  check(`${year}: well-formed dates`, [...calendar.holidays, ...calendar.workdays].every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))
  check(`${year}: official source recorded`, typeof calendar.source === 'string' && calendar.source.startsWith('https://www.gov.cn/'))
}
check('2026 make-up days match the notice', JSON.stringify(CALENDAR[2026].workdays) === JSON.stringify(['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10']))

// ── timezone independence ──────────────────────────────────────────────────

process.stdout.write('\ntimezone independence\n')
check('Beijing read (UTC 01:30 → Beijing 09:30)', beijingClock(new Date('2026-10-13T01:30:00Z')).minutes === 9 * 60 + 30 && beijingClock(new Date('2026-10-13T01:30:00Z')).date === '2026-10-13')
check('Beijing day rollover (UTC 2026-10-12T16:00 → Beijing 10-13 00:00)', beijingClock(new Date('2026-10-12T16:00:00Z')).date === '2026-10-13')
check('process TZ does not change the verdict', (() => {
  const previous = process.env.TZ
  process.env.TZ = 'UTC'
  const utc = statusAt(bj('2026-10-13T10:00')).offPeak
  process.env.TZ = 'America/New_York'
  const newYork = statusAt(bj('2026-10-13T10:00')).offPeak
  process.env.TZ = previous
  return utc === false && newYork === false
})())
check('peak window constants are 09:00-12:00 / 14:00-18:00', JSON.stringify(PEAK_WINDOWS) === '[[540,720],[840,1080]]')

// ── dictionaries and rendered copy ─────────────────────────────────────────

process.stdout.write('\ndictionaries (zh / en)\n')
const zhKeys = Object.keys(DICTIONARIES.zh).sort()
const enKeys = Object.keys(DICTIONARIES.en).sort()
check('locale ids are zh and en', Object.keys(DICTIONARIES).sort().join(',') === 'en,zh')
check('identical key sets', JSON.stringify(zhKeys) === JSON.stringify(enKeys), `zh=${zhKeys.length} en=${enKeys.length}`)
check('no blank values', [...zhKeys, ...enKeys].every((key) => DICTIONARIES.zh[key]?.trim() && DICTIONARIES.en[key]?.trim()))
const placeholders = (template) => [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',')
const placeholderMismatch = zhKeys.filter((key) => placeholders(DICTIONARIES.zh[key]) !== placeholders(DICTIONARIES.en[key]))
check('placeholders match per key', placeholderMismatch.length === 0, placeholderMismatch.join(', '))
check('every weekday has copy', [1, 2, 3, 4, 5, 6, 7].every((day) => DICTIONARIES.zh[`weekday.${day}`] && DICTIONARIES.en[`weekday.${day}`]))
check('every day code has copy', ['holiday', 'weekend', 'makeupWeekend', 'workday', 'workdayUncovered'].every((code) => DICTIONARIES.zh[`day.${code}`] && DICTIONARIES.en[`day.${code}`]))

const peak = st('2026-10-13T10:00')
const idle = st('2026-10-03T14:00')
check('badge label zh', badgeLabel(tzh, peak) === '高峰' && badgeLabel(tzh, idle) === '空闲')
check('badge label en', badgeLabel(ten, peak) === 'Peak' && badgeLabel(ten, idle) === 'Idle')
check('pill label stays short for the brand row', ['zh', 'en'].every((locale) => DICTIONARIES[locale][peak.offPeak ? 'badge.offPeak' : 'badge.peak'].length <= 8))

const zhTip = tooltipText(tzh, peak, bj('2026-10-13T10:00'))
const enTip = tooltipText(ten, peak, bj('2026-10-13T10:00'))
check('zh tooltip mentions the rule, the half price and the switch', zhTip.includes('高峰的一半') && zhTip.includes('周一至周五') && zhTip.includes('下一次切换'))
check('en tooltip mentions the rule, the half price and the switch', enTip.includes('half of peak') && enTip.includes('Monday to Friday') && enTip.includes('Next switch'))
check('tooltip carries the calendar source year', zhTip.includes('2026') && enTip.includes('2026'))
check('zh tooltip explains a make-up work weekend', tooltipText(tzh, st('2026-10-10T10:00'), bj('2026-10-10T10:00')).includes('调休上班'))
check('en tooltip explains a make-up work weekend', tooltipText(ten, st('2026-10-10T10:00'), bj('2026-10-10T10:00')).includes('make-up work weekend'))
check('uncovered year is called out in both languages', tooltipText(tzh, uncovered, bj('2027-01-04T10:00')).includes('尚未发布') && tooltipText(ten, uncovered, bj('2027-01-04T10:00')).includes('not published'))
check('announcement text both languages', announcementText(tzh, idle).includes('空闲时段') && announcementText(ten, idle).includes('off-peak'))
check('countdown copy both languages', formatCountdown(tzh, 45 * 60_000) === '45 分钟' && formatCountdown(ten, 45 * 60_000) === '45 min')
check('long countdown copy both languages', formatCountdown(tzh, 2 * 3600_000 + 15 * 60_000) === '2 小时 15 分' && formatCountdown(ten, 2 * 3600_000 + 15 * 60_000) === '2 h 15 min')
check('multi-day countdown copy both languages', formatCountdown(tzh, 50 * 3600_000) === '2 天 2 小时' && formatCountdown(ten, 50 * 3600_000) === '2 d 2 h')
check('clock format is numeric and stable', formatClock(bj('2026-10-13T09:05')) === '10-13 09:05')

// ── registration contract (stub context) ───────────────────────────────────

process.stdout.write('\nregistration contract\n')
const seen = { dictionaries: [], slots: [] }
const stubCtx = {
  effect: (body) => {
    const dispose = body()
    return () => { if (typeof dispose === 'function') dispose() }
  },
  locale: {
    register: (namespace, dicts) => {
      seen.dictionaries.push({ namespace, dicts })
      return () => {}
    }
  },
  slots: {
    inject: (key, callback) => {
      callback()
      return () => {}
    },
    register: (options, component) => {
      seen.slots.push({ options, component })
      return () => {}
    }
  }
}
moduleExports.apply(stubCtx)
check('dictionaries registered once under the package namespace', seen.dictionaries.length === 1 && seen.dictionaries[0].namespace === NS)
check('both locales shipped in one registration call', Object.keys(seen.dictionaries[0].dicts).sort().join(',') === 'en,zh')
check('three seats registered', seen.slots.length === 3, `got ${seen.slots.length}`)
check('every seat declares the locale namespace', seen.slots.every((seat) => seat.options.locale === NS))
check('brand seat taken at priority -1', seen.slots.some((seat) => seat.options.name === 'sidebar.brand.name' && seat.options.priority === -1))
check('overlay seats carry distinct ids', (() => {
  const overlay = seen.slots.filter((seat) => seat.options.name === 'shell.overlay').map((seat) => seat.options.id)
  return overlay.length === 2 && new Set(overlay).size === 2 && overlay.every((id) => typeof id === 'string')
})())
check('every seat has a component', seen.slots.every((seat) => typeof seat.component === 'function'))

// ── component render (element tree, both languages) ────────────────────────

process.stdout.write('\ncomponent render (element tree, no renderer needed)\n')

/** Expand function components (and Fragments) into plain element nodes. */
const expand = (element) => {
  if (element === null || element === undefined || typeof element !== 'object') return element
  if (typeof element.type === 'function') return expand(element.type(element.props))
  if (typeof element.type === 'symbol') return element
  return element
}
/** Depth-first collection of every rendered element node (components expanded). */
const collect = (node, out = []) => {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out)
    return out
  }
  if (typeof node.type === 'function') {
    collect(node.type(node.props), out)
    return out
  }
  if (typeof node.type === 'symbol') {
    collect(node.props?.children, out)
    return out
  }
  out.push(node)
  collect(node.props?.children, out)
  return out
}

const liveStatus = statusAt(new Date())
const expectLabel = { zh: liveStatus.offPeak ? '空闲' : '高峰', en: liveStatus.offPeak ? 'Idle' : 'Peak' }
const expectPeriod = { zh: liveStatus.offPeak ? '空闲时段' : '高峰时段', en: liveStatus.offPeak ? 'off-peak window' : 'peak window' }

for (const locale of ['zh', 'en']) {
  const t = translator(locale)
  const nodes = collect(expand(internals.BrandNameWithOffPeak({ t })))
  const tag = nodes.find((node) => node.type === 'Tag')
  const tooltip = nodes.find((node) => node.type === 'Tooltip')
  const wordmark = nodes.find((node) => node.type === 'BrandWordmark')
  check(`${locale}: brand seat renders the official wordmark`, wordmark !== undefined && wordmark.props.includeMark === false && wordmark.props.size === 22)
  check(`${locale}: pill label follows the live status`, tag !== undefined && tag.props.children === expectLabel[locale], `got ${JSON.stringify(tag?.props.children)} want ${expectLabel[locale]}`)
  check(`${locale}: pill tone follows the live status`, tag !== undefined && tag.props.tone === (liveStatus.offPeak ? 'success' : 'warning'))
  check(`${locale}: tooltip is a portal bubble with a localised label`, tooltip !== undefined && tooltip.props.portal === true && typeof tooltip.props.label === 'function' && tooltip.props.label().includes(expectPeriod[locale]))
  check(`${locale}: badge swallows clicks so it cannot start a session`, (() => {
    const anchor = nodes.find((node) => typeof node.props?.onClick === 'function')
    if (anchor === undefined) return false
    let stopped = false
    anchor.props.onClick({ stopPropagation: () => { stopped = true } })
    return stopped
  })())
  const announcement = expand(internals.StatusAnnouncement({ t }))
  check(`${locale}: live region announces the status`, announcement?.props?.role === 'status' && announcement.props['aria-live'] === 'polite' && String(announcement.props.children).includes(locale === 'zh' ? (liveStatus.offPeak ? '空闲时段' : '高峰时段') : (liveStatus.offPeak ? 'off-peak' : 'peak')))
  check(`${locale}: rail dot stays hidden while the sidebar is wide`, expand(internals.RailStatusDot({ t })) === null)
}


if (process.argv.includes('--now')) {
  const now = new Date()
  const status = statusAt(now)
  process.stdout.write(`\nnow: ${status.offPeak ? 'off-peak' : 'peak'}（北京 ${iso(now)} ${tzh('weekday.' + status.weekday)} / ${ten('weekday.' + status.weekday)}）\n`)
  for (const line of tooltipText(tzh, status, now).split('\n')) process.stdout.write(`  zh │ ${line}\n`)
  for (const line of tooltipText(ten, status, now).split('\n')) process.stdout.write(`  en │ ${line}\n`)
}

process.stdout.write(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed\n`)
process.exit(failures === 0 ? 0 : 1)
