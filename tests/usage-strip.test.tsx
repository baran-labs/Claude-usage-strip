import { expect, test } from 'claude-code/testing'

import { MESSAGES, fmtAgo, fmtDuration, fmtPct, fmtRunTime, fmtShare, fmtTokens, fmtUsd, pickLang } from '../hooks/i18n'
import { contextForecast, limitForecast, modelName, parseNotification, toolLabel } from '../hooks/register'

// ---------- Shared fixtures ----------
const BAND = {
  plugin: 'usage-strip',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const PANE = {
  plugin: 'usage-strip',
  component: 'Pane',
  requestId: 'usage-panel',
  props: {
    title: 'Usage Panel',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const LONG_CWD = '/home/user/projects/client-work/website-redesign-2026-landing-pages-final'

type Agent = { id: string; description: string; type: string; status: string; kind: 'local_agent' }

type World = {
  usd: number | undefined
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  contextTokens: number | undefined
  surfaces: string[]
  env: Record<string, string>
  cwd: string
  remote: 'ok' | 'fail' | 'unavailable'
  agents: Agent[]
  ran: string[]
  toasts: string[]
}

function world(): World {
  return {
    usd: 4.55,
    rateLimits: [
      { kind: 'five_hour', percentUsed: 41, resetsAt: new Date(3_240_000).toISOString() },
      { kind: 'seven_day', percentUsed: 92, resetsAt: new Date(560_000_000).toISOString() },
    ],
    contextTokens: 213_000,
    surfaces: ['desktop', 'mobile'],
    env: {},
    cwd: '/home/user/projects/my-app',
    remote: 'ok',
    agents: [],
    ran: [],
    toasts: [],
  }
}

// The `on` a test body receives, typed loosely enough for these stand-ins.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOn = (event: any, ...rest: any[]) => void

// Stands in for the engine beneath the mod.
function stubEngine(on: AnyOn, w: World) {
  on('command.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context:
        w.contextTokens === undefined
          ? { window: 1_000_000 }
          : {
              tokens: w.contextTokens,
              window: 1_000_000,
              percent: Math.round((w.contextTokens / 1_000_000) * 100),
              breakdown: {
                categories: [
                  { name: 'System tools', tokens: 18_100, color: 'x', isDeferred: false, kind: 'used' },
                  { name: 'Messages', tokens: 150_000, color: 'x', isDeferred: false, kind: 'used' },
                  { name: 'MCP tools (deferred)', tokens: 81_000, color: 'x', isDeferred: true, kind: 'deferred' },
                  { name: 'Autocompact buffer', tokens: 33_000, color: 'x', isDeferred: false, kind: 'buffer' },
                  { name: 'Free space', tokens: 750_000, color: 'x', isDeferred: false, kind: 'free' },
                ],
                totalTokens: w.contextTokens,
                maxTokens: 1_000_000,
                rawMaxTokens: 1_000_000,
                percentage: Math.round((w.contextTokens / 1_000_000) * 100),
                isAutoCompactEnabled: true,
                autoCompactThreshold: 967_000,
              },
            },
      rateLimits: w.rateLimits,
      ...(w.usd === undefined ? {} : { cost: { usd: w.usd } }),
    },
  }))
  on('clock.now', () => ({ value: 0 }))
  on('clock.every', () => ({ value: {} }))
  on('env.get', (_: unknown, e: { name: string }) => ({ value: w.env[e.name] }))
  on('session.cwd', () => ({ value: w.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('session.version', () => ({ value: { version: '2.1.328' } }))
  on('session.repo', () => ({ value: null }))
  on('session.surfaces', () => ({ value: w.surfaces }))
  on('agent.list', () => ({ value: w.agents }))
  on('command.run', (_: unknown, e: { command: string }) => {
    w.ran.push(e.command)
    if (w.remote === 'fail') throw new Error('not available here')
    if (w.remote === 'unavailable') return { text: "/remote-control isn't available in this environment." }
    return { text: 'Remote Control connected' }
  })
  on('ui.toast', (_: unknown, e: { text?: unknown }) => {
    w.toasts.push(String(e.text ?? ''))
    return { value: undefined }
  })
  on('turn.complete', () => ({ text: '' }))
  on('classic.Stop', () => ({}))
  on('session.receive', () => ({ consumed: 'no' }))
  // The engine's own band: empty
  on('ui.render', ($: { ui: { resolve: (e: unknown) => { Box: (p: object) => unknown } } }, e: unknown) => {
    const { Box } = $.ui.resolve(e)
    return Box({})
  })
}

const start = { cwd: '/', surface: 'desktop', isInteractive: true } as const
// The kit's $.command.run wants the engine's full input; these fill the rest.
const run = (command: string, args = '') => ({ command, args }) as never

// ---------- 1. Formatting ----------
test('number, money, percent and time formats in both languages', async () => {
  expect(fmtTokens(950, 'tr')).toBe('950')
  expect(fmtTokens(213_000, 'tr')).toBe('213 bin')
  expect(fmtTokens(213_000, 'en')).toBe('213K')
  expect(fmtTokens(1_250_000, 'tr')).toBe('1,3 M')
  expect(fmtTokens(1_250_000, 'en')).toBe('1.3 M')
  expect(fmtUsd(4.5537, 'tr')).toBe('$4,55')
  expect(fmtUsd(4.5537, 'en')).toBe('$4.55')
  expect(fmtUsd(0.004, 'tr')).toBe('<$0,01')
  expect(fmtPct(21, 'tr')).toBe('%21')
  expect(fmtPct(21, 'en')).toBe('21%')
  expect(fmtPct('100+', 'en')).toBe('100%+')
  expect(fmtPct('100+', 'tr')).toBe('%100+')
  expect(fmtShare(1, 1000, 'en')).toBe('<1%')
  expect(fmtShare(0, 0, 'tr')).toBe('%0')
  expect(fmtDuration(54 * 60_000, 'tr')).toBe('54 dk')
  expect(fmtDuration(134 * 60_000, 'en')).toBe('2h 14m')
  expect(fmtDuration((6 * 1440 + 11 * 60) * 60_000, 'tr')).toBe('6 gün 11 sa')
  expect(fmtRunTime(45_000, 'tr')).toBe('45 sn')
  expect(fmtRunTime(125_000, 'en')).toBe('2m')
  expect(fmtAgo(10_000, 'tr')).toBe('az önce')
  expect(fmtAgo(5 * 60_000, 'en')).toBe('5m ago')
  expect(pickLang('en', 'tr_TR.UTF-8')).toBe('en')
  expect(pickLang('auto', 'tr_TR.UTF-8')).toBe('tr')
  expect(pickLang('auto', 'en_US.UTF-8')).toBe('en')
  expect(pickLang('auto', undefined)).toBe('en')
})

test('a background job notification is read into an output', async () => {
  const shell = parseNotification(
    '<task-notification>\n<task-id>b1</task-id>\n<output-file>/home/user/.tmp/b1.output</output-file>\n<status>completed</status>\n<summary>Background command "npm run build" completed (exit code 0)</summary>\n</task-notification>',
    1000,
  )
  expect(shell).toEqual({
    id: 'b1',
    status: 'completed',
    summary: 'Background command "npm run build" completed (exit code 0)',
    result: '',
    outputFile: '/home/user/.tmp/b1.output',
    durationMs: null,
    at: 1000,
  })
  const agent = parseNotification(
    '<task-notification><task-id>a7</task-id><status>failed</status><summary>Agent "Find tests" failed</summary><result>Could not find a test runner.</result><usage>duration_ms: 125000</usage></task-notification>',
    5,
  )
  expect(agent?.status).toBe('failed')
  expect(agent?.result).toBe('Could not find a test runner.')
  expect(agent?.durationMs).toBe(125_000)
  // A notification that is not about a job is left out
  expect(parseNotification('The person enabled mod hot-reloading for this session.', 1)).toBeNull()
})

// ---------- 2. Strip ----------
test('strip draws in Turkish on every surface', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: 'BAĞLAM' }))?.text).toBe('BAĞLAM')
    expect((await band.find({ type: 'Text', text: /213 bin/ }))?.text).toBe('213 bin / 1 M')
    expect((await band.find({ type: 'Text', text: '5 SAATLİK' }))?.text).toBe('5 SAATLİK')
    expect((await band.find({ type: 'Text', text: /↻ 54 dk/ }))?.text).toBe('↻ 54 dk')
    expect((await band.find({ type: 'Text', text: /4,55/ }))?.text).toBe('$4,55')
    expect((await band.find({ type: 'Button', key: 'hide' }))?.props.label).toBe('Gizle ▾')
    expect((await band.find({ type: 'Button', key: 'details-btn' }))?.props.label).toBe('Ayrıntılar ↗')
    // Nothing runs in the background: no jobs button
    expect(await band.find({ type: 'Button', key: 'jobs' })).toBeUndefined()
    await band.unmount()
  }
})

test('strip draws in English', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: 'CONTEXT' }))?.text).toBe('CONTEXT')
    expect((await band.find({ type: 'Text', text: /213K/ }))?.text).toBe('213K / 1 M')
    expect((await band.find({ type: 'Text', text: '5-HOUR' }))?.text).toBe('5-HOUR')
    expect((await band.find({ type: 'Text', text: /4\.55/ }))?.text).toBe('$4.55')
    expect((await band.find({ type: 'Button', key: 'hide' }))?.props.label).toBe('Hide ▾')
    expect(await band.find({ type: 'Text', text: /BAĞLAM|SAATLİK|Gizle/ })).toBeUndefined()
    await band.unmount()
  }
})

test('auto language follows LANG', { options: { language: 'auto' } }, async ($, on) => {
  const w = world()
  w.env = { LANG: 'tr_TR.UTF-8' }
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text', text: 'BAĞLAM' }))?.text).toBe('BAĞLAM')
  await band.unmount()
})

test('no limits, no cost, context not measured: still draws', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  w.rateLimits = []
  w.usd = undefined
  w.contextTokens = undefined
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: 'not measured' }))?.text).toBe('not measured')
    expect(await band.find({ type: 'Text', text: '5-HOUR' })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: 'API COST' })).toBeUndefined()
    await band.unmount()
    for (const tab of ['overview', 'cost', 'context', 'background', 'outputs', 'env']) {
      const pane = await $.ui.mount({ ...PANE, surface })
      await pane.press({ key: 'tab-' + tab })
      await pane.unmount()
      const again = await $.ui.mount({ ...PANE, surface })
      expect((await again.find({ type: 'Button', key: 'tab-' + tab }))?.props.variant).toBe('primary')
      await again.unmount()
    }
  }
})

test('a survey above the prompt gets the space', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'desktop' })
  expect(await band.find({ type: 'Text', text: 'CONTEXT' })).toBeUndefined()
  await band.unmount()
})

test('a limit at 92% is critical, 41% is fine', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text', text: /92%/ }))?.props.color).toBe('error')
  expect((await band.find({ type: 'Text', text: /41%/ }))?.props.color).toBe('success')
  await band.unmount()
})

test('Hide collapses to one line, Show brings it back, commands do the same', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  const state = async () => {
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const open = (await band.find({ type: 'Text', text: 'BAĞLAM' })) !== undefined
    const collapsed = (await band.find({ type: 'Text', text: 'Kullanım şeridi gizli' })) !== undefined
    await band.unmount()
    return { open, collapsed }
  }
  expect(await state()).toEqual({ open: true, collapsed: false })
  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'hide' })
  await band.unmount()
  expect(await state()).toEqual({ open: false, collapsed: true })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
  expect(await state()).toEqual({ open: false, collapsed: true })
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'show' })
  await band.unmount()
  expect(await state()).toEqual({ open: true, collapsed: false })
  expect((await $.command.run(run('kullanim'))).text).toBe('Kullanım şeridi gizlendi.')
  expect((await $.command.run(run('usage-strip'))).text).toBe('Kullanım şeridi açıldı.')
})

// ---------- 3. Panel tabs ----------
test('the panel opens on Overview and each tab shows its own sections', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  const show = async (tab: string) => {
    let pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await pane.press({ key: 'tab-' + tab })
    await pane.unmount()
    pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
    return pane
  }

  let pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Button', key: 'tab-overview' }))?.props.variant).toBe('primary')
  // Overview shows what the strip does not: forecasts and stats
  for (const text of ['LIMIT FORECAST', '5-hour limit', 'Weekly limit', 'CONTEXT', 'COST', 'SESSION', 'JOBS', 'LATEST OUTPUTS']) {
    expect((await pane.find({ type: 'Text', text }))?.text).toBe(text)
  }
  // 41% after 4.1 h of a 5 h window, 54 min left: about 50% at reset, fine
  expect((await pane.find({ type: 'Text', text: /^41%/ }))?.text).toBe('41% → ~50% at reset')
  expect((await pane.find({ type: 'Text', text: 'At this pace you have plenty of room' }))?.props.color).toBe('success')
  // 92% after 12 h of a week: over 100% well before the reset
  expect((await pane.find({ type: 'Text', text: /^92%/ }))?.text).toBe('92% → ~100%+ at reset')
  expect((await pane.find({ type: 'Text', text: /runs out/ }))?.text).toBe('At this pace it runs out in ~1h 5m')
  expect((await pane.find({ type: 'Text', text: /runs out/ }))?.props.color).toBe('error')
  expect((await pane.find({ type: 'Text', text: 'A few more messages needed to forecast' })) !== undefined).toBe(true)
  expect((await pane.find({ type: 'Text', text: /compacts at/ }))?.text).toBe('213K / compacts at 967K')
  expect((await pane.find({ type: 'Text', text: 'No tools used yet.' })) !== undefined).toBe(true)
  expect((await pane.find({ type: 'Text', text: 'Nothing is running in the background.' })) !== undefined).toBe(true)
  // What the strip already shows stays out of Overview
  expect(await pane.find({ type: 'Text', text: 'At API prices' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: 'Tokens used' })).toBeUndefined()
  // Full sections stay in their own tabs
  expect(await pane.find({ type: 'Text', text: 'Token breakdown' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: 'Environment' })).toBeUndefined()
  await pane.unmount()

  pane = await show('cost')
  expect((await pane.find({ type: 'Text', text: 'Cost per message' }))?.text).toBe('Cost per message')
  expect((await pane.find({ type: 'Text', text: 'Token breakdown' }))?.text).toBe('Token breakdown')
  expect(await pane.find({ type: 'Text', text: 'LIMIT FORECAST' })).toBeUndefined()
  await pane.unmount()

  pane = await show('context')
  expect((await pane.find({ type: 'Text', text: 'What fills the context?' }))?.text).toBe('What fills the context?')
  expect(await pane.find({ type: 'Text', text: /deferred/ })).toBeUndefined()
  await pane.unmount()

  pane = await show('env')
  expect((await pane.find({ type: 'Text', text: /Opus/ }))?.text).toBe('Opus 5.5 (1M context)')
  expect((await pane.find({ type: 'Text', text: 'Phone connected' }))?.props.color).toBe('success')
  await pane.unmount()
})

test('panel tabs in Turkish', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const labels = []
  for (const id of ['overview', 'cost', 'context', 'background', 'outputs', 'env']) {
    labels.push((await pane.find({ type: 'Button', key: 'tab-' + id }))?.props.label)
  }
  expect(labels).toEqual(['Genel', 'Maliyet', 'Bağlam', 'İşler', 'Çıktılar', 'Ortam'])
  expect((await pane.find({ type: 'Text', text: 'LİMİT TAHMİNİ' }))?.text).toBe('LİMİT TAHMİNİ')
  expect((await pane.find({ type: 'Text', text: 'MALİYET' }))?.text).toBe('MALİYET')
  expect((await pane.find({ type: 'Text', text: 'BAĞLAM' }))?.text).toBe('BAĞLAM')
  expect((await pane.find({ type: 'Text', text: /^%41/ }))?.text).toBe('%41 → sıfırlanırken ~%50')
  expect((await pane.find({ type: 'Text', text: 'Bu hızla rahat yetişir' }))?.text).toBe('Bu hızla rahat yetişir')
  expect((await pane.find({ type: 'Text', text: /dolar$/ }))?.text).toBe('Bu hızla ~1 sa 5 dk sonra dolar')
  await pane.unmount()
})

// ---------- 4. Background jobs ----------
test('background jobs: snapshot at reply end, live subagents, jobs button, tab counts', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  w.agents = [
    { id: 'a1', description: 'Testleri tara', type: 'Explore', status: 'running', kind: 'local_agent' },
    { id: 'a0', description: 'Eski görev', type: 'general-purpose', status: 'completed', kind: 'local_agent' },
  ]
  stubEngine(on as AnyOn, w)
  await $.session.start(start)

  // Before any reply ends there is no snapshot yet
  let pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'tab-background' })
  await pane.unmount()
  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Text', text: 'Liste ilk yanıt bitince dolar.' })) !== undefined).toBe(true)
  await pane.unmount()

  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [
      { id: 'b1', type: 'shell', status: 'running', description: 'Derleme', command: 'npm run build' },
      { id: 'a1', type: 'subagent', status: 'running', description: 'Testleri tara' },
    ],
    session_crons: [{ id: 'c1', schedule: '*/30 * * * *', recurring: true, prompt: 'Siteyi kontrol et' }],
  } as never)

  // Strip: one shell + one live subagent = 2 jobs (the snapshot's subagent is not counted twice)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Button', key: 'jobs' }))?.props.label).toBe('⚙ 2 iş')
  await band.press({ key: 'jobs' })
  await band.unmount()

  // The jobs button opened the Background tab
  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Button', key: 'tab-background' }))?.props.label).toBe('İşler · 2')
  expect((await pane.find({ type: 'Button', key: 'tab-background' }))?.props.variant).toBe('primary')
  expect((await pane.find({ type: 'Text', text: 'npm run build' }))?.text).toBe('npm run build')
  expect((await pane.find({ type: 'Text', text: ' Komut' }))?.text).toBe(' Komut')
  expect((await pane.find({ type: 'Text', text: ' Alt ajan' }))?.text).toBe(' Alt ajan')
  expect((await pane.find({ type: 'Text', text: '*/30 * * * *' }))?.text).toBe('*/30 * * * *')
  expect((await pane.find({ type: 'Text', text: 'tekrarlı' }))?.text).toBe('tekrarlı')
  expect((await pane.find({ type: 'Text', text: ' Eski görev' }))?.text).toBe(' Eski görev')
  expect((await pane.find({ type: 'Text', text: /Son güncelleme az önce/ })) !== undefined).toBe(true)
  await pane.unmount()

  // Overview's glance line
  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'tab-overview' })
  await pane.unmount()
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /iş çalışıyor/ }))?.text).toBe('⚙ 2 iş çalışıyor · 1 zamanlanmış')
  await term.unmount()

  // Everything finished: the button goes away
  w.agents = w.agents.map(a => ({ ...a, status: 'completed' }))
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [], session_crons: [] } as never)
  const after = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await after.find({ type: 'Button', key: 'jobs' })).toBeUndefined()
  await after.unmount()
})

// ---------- 5. Outputs ----------
test('outputs: finished jobs are listed newest first, a repeat replaces, other deliveries are ignored', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  const deliver = (text: string, kind = 'task-notification') => $.session.receive({ origin: { kind }, text } as never)

  await deliver('<task-notification><task-id>b1</task-id><output-file>/home/user/.tmp/b1.output</output-file><status>completed</status><summary>Background command "npm run build" completed (exit code 0)</summary></task-notification>')
  await deliver('<task-notification><task-id>a7</task-id><status>failed</status><summary>Agent "Find tests" failed</summary><result>Could not find a test runner.</result></task-notification>')
  await deliver('Hello from the phone', 'bridge')
  await deliver('The person enabled mod hot-reloading.')

  let pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Button', key: 'tab-outputs' }))?.props.label).toBe('Outputs')
  // Overview previews the newest results
  expect((await pane.find({ type: 'Text', text: 'LATEST OUTPUTS' }))?.text).toBe('LATEST OUTPUTS')
  expect((await pane.find({ type: 'Text', text: /^✗ Agent "Find tests" failed/ }))?.text).toBe('✗ Agent "Find tests" failed')
  await pane.press({ key: 'tab-outputs' })
  await pane.unmount()
  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const summaries = (await pane.findAll({ type: 'Text', text: /^(Agent|Background) / })).map(x => x.text)
  expect(summaries).toEqual(['Agent "Find tests" failed', 'Background command "npm run build" completed (exit code 0)'])
  expect((await pane.find({ type: 'Text', text: 'Could not find a test runner.' }))?.text).toBe('Could not find a test runner.')
  expect((await pane.find({ type: 'Text', text: /Output file:/ }))?.text).toBe('Output file: ~/.tmp/b1.output')
  expect((await pane.find({ type: 'Text', text: ' failed' }))?.props.color).toBe('error')
  await pane.unmount()

  // The same job reported again replaces its row
  await deliver('<task-notification><task-id>a7</task-id><status>completed</status><summary>Agent "Find tests" completed</summary></task-notification>')
  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.findAll({ type: 'Text', text: /^(Agent|Background) / })).map(x => x.text)).toEqual([
    'Agent "Find tests" completed',
    'Background command "npm run build" completed (exit code 0)',
  ])
  await pane.unmount()

  // Keeps the newest 15
  for (let i = 0; i < 20; i++) await deliver(`<task-notification><task-id>x${i}</task-id><status>completed</status><summary>job ${i}</summary></task-notification>`)
  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const kept = (await pane.findAll({ type: 'Text', text: /^job \d+$/ })).map(x => x.text)
  expect(kept).toEqual(Array.from({ length: 15 }, (_, i) => `job ${19 - i}`))
  await pane.unmount()
})

// ---------- 6. Folder name, Remote Control ----------
test('a long folder name ends in "..." and a click shows it whole', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  w.cwd = LONG_CWD
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  let pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'tab-env' })
  await pane.unmount()
  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const label = (await pane.find({ type: 'Button', key: 'folder' }))?.props.label as string
  expect(label.length).toBe(24)
  expect(label.endsWith('...')).toBe(true)
  await pane.press({ key: 'folder' })
  await pane.unmount()
  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Button', key: 'folder' }))?.props.label).toBe('website-redesign-2026-landing-pages-final')
  expect((await pane.find({ type: 'Text', text: /client-work/ }))?.text).toBe('~/projects/client-work/website-redesign-2026-landing-pages-final')
  await pane.unmount()
})

test('Remote Control button: answer shown, failure reported', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  let pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'tab-env' })
  await pane.unmount()
  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'rc' })
  expect(w.ran.at(-1)).toBe('remote-control')
  expect(w.toasts.at(-1)).toBe('Remote Control connected')
  w.remote = 'fail'
  await pane.press({ key: 'rc' })
  expect(w.toasts.at(-1)?.startsWith('Uzaktan kontrol değiştirilemedi: ')).toBe(true)
  await pane.unmount()
})

// ---------- 7. Counters ----------
test('cost per message: main replies only, newest 20 kept', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  w.usd = 1
  stubEngine(on as AnyOn, w)
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  await $.session.start(start)
  const reply = async (cost: number, agentId?: string) => {
    await $.turn.start({ turnId: 't', ...(agentId ? { agentId } : {}) } as never)
    w.usd = (w.usd ?? 0) + cost
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', ...(agentId ? { agentId } : {}) } as never)
  }
  await reply(0.25)
  await reply(0.5, 'sub-agent')
  let pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'tab-cost' })
  await pane.unmount()
  pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await pane.find({ type: 'Text', text: /^last / }))?.text).toBe('last 1 · avg $0.25')
  await pane.unmount()
  for (let i = 0; i < 24; i++) await reply(0.1)
  pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await pane.find({ type: 'Text', text: /^last / }))?.text).toBe('last 20 · avg $0.10')
  await pane.unmount()
})

test('token counter adds up every request', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  on('turn.step', async function* (_: unknown, e: { turnId: string; index: number }) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { model: 'm', input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: 98_000, cache_creation_input_tokens: 500 },
    }
  })
  await $.session.start(start)
  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ type: 'Text', text: 'TOKENS' })).toBeUndefined()
  await band.unmount()
  for (let i = 0; i < 2; i++) {
    for await (const _chunk of $.turn.step({ turnId: 't', index: i, model: 'm', messageCount: 1 } as never)) {
      // drain
    }
  }
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text', text: '200K' }))?.text).toBe('200K')
  expect((await band.find({ type: 'Text', text: / cache$/ }))?.text).toBe('98% cache')
  await band.unmount()
})

// ---------- 8. Files ----------
test('files Claude writes or edits are listed; failed or denied calls are not', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  ;(on as AnyOn)('tool.call', (_: unknown, e: { file_path?: string; notebook_path?: string }) =>
    (e.file_path ?? e.notebook_path ?? '').includes('fail') ? { result: {}, isError: true, text: 'no' } : { result: {} },
  )
  await $.session.start(start)
  const call = (input: object) => $.tool.call(input as never)

  await call({ tool: 'Write', file_path: '/home/user/site/index.html', content: 'x' })
  await call({ tool: 'Edit', file_path: '/home/user/site/index.html', old_string: 'x', new_string: 'y' })
  await call({ tool: 'Edit', file_path: '/home/user/site/style.css', old_string: 'a', new_string: 'b' })
  await call({ tool: 'NotebookEdit', notebook_path: '/home/user/site/report.ipynb', new_source: 'z' })
  await call({ tool: 'Write', file_path: '/home/user/site/fail.txt', content: 'x' })

  let pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Button', key: 'tab-outputs' }))?.props.label).toBe('Çıktılar')
  // Overview's recent files: newest first
  const names = (await pane.findAll({ type: 'Text', text: /^ (index\.html|style\.css|report\.ipynb)$/ })).map(x => x.text)
  // (each name is its own mono Text inside the row)
  expect(names).toEqual([' report.ipynb', ' style.css', ' index.html'])
  await pane.press({ key: 'tab-outputs' })
  await pane.unmount()

  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Text', text: 'Bu oturumda değişen dosyalar' }))?.text).toBe('Bu oturumda değişen dosyalar')
  // Written then edited stays "written", counted twice
  expect((await pane.find({ type: 'Text', text: /^yazıldı · 2 kez/ }))?.text).toBe('yazıldı · 2 kez · az önce')
  expect((await pane.find({ type: 'Text', text: /^düzenlendi/ }))?.text).toBe('düzenlendi · az önce')
  expect((await pane.find({ type: 'Text', text: /~\/site\// }))?.text).toBe('  ~/site/')
  expect(await pane.find({ type: 'Text', text: / fail\.txt/ })).toBeUndefined()
  expect((await pane.find({ type: 'Text', text: 'Biten arka plan işleri' }))?.text).toBe('Biten arka plan işleri')
  await pane.unmount()

  // Terminal draws the same tab
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: ' index.html' }))?.text).toBe(' index.html')
  await term.unmount()
})

// ---------- 9. Forecasts and session stats ----------
test('limit forecast: safe, tight, over, too early, unused', async () => {
  const H = 3_600_000
  const reset = (msFromNow: number) => new Date(msFromNow).toISOString()
  // 5 h window, 3 h gone, 2 h left (now = 0)
  expect(limitForecast(30, reset(2 * H), 'five_hour', 0)).toEqual({ projected: 50, fillInMs: null, verdict: 'safe' })
  expect(limitForecast(51, reset(2 * H), 'five_hour', 0).verdict).toBe('tight')
  const over = limitForecast(75, reset(2 * H), 'five_hour', 0)
  expect(over.verdict).toBe('over')
  expect(over.fillInMs).toBe(H) // 25% more at 25%/h
  // 10 minutes into a 5 h window: too early
  expect(limitForecast(20, reset(5 * H - 10 * 60_000), 'five_hour', 0).verdict).toBe('early')
  expect(limitForecast(0, reset(2 * H), 'five_hour', 0).verdict).toBe('idle')
  // A window with no known length is not forecast
  expect(limitForecast(50, reset(H), 'spend_limit', 0).verdict).toBe('early')
})

test('MCP tool names are shortened, built-in names stay', async () => {
  expect(toolLabel('mcp__ccd_turn__update_plan')).toBe('update_plan')
  expect(toolLabel('mcp__claude-in-chrome__read_page')).toBe('read_page')
  expect(toolLabel('Bash')).toBe('Bash')
})

test('context forecast: average growth, a compaction drop is skipped', async () => {
  expect(contextForecast([100_000], 100_000, 900_000)).toEqual({ perMessage: null, messagesLeft: null })
  expect(contextForecast([100_000, 120_000, 140_000], 140_000, 900_000)).toEqual({ perMessage: 20_000, messagesLeft: 38 })
  // 600K -> 80K is a compaction: not growth
  expect(contextForecast([500_000, 600_000, 80_000, 100_000, 130_000], 130_000, 900_000)).toEqual({
    perMessage: 50_000,
    messagesLeft: 15,
  })
  expect(contextForecast([1, 2, 3], 3, undefined).messagesLeft).toBeNull()
})

test('Overview counts replies, reply times, tools, spending and context growth', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  w.usd = 1
  w.contextTokens = 100_000
  w.rateLimits = []
  stubEngine(on as AnyOn, w)
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  ;(on as AnyOn)('tool.call', (_: unknown, e: { tool: string; command?: string }) =>
    e.command === 'false' ? { result: {}, isError: true, text: 'exit 1' } : { result: {} },
  )
  await $.session.start(start)
  const reply = async (ms: number, cost: number, ctxAfter: number) => {
    await $.turn.start({ turnId: 't' } as never)
    w.usd = (w.usd ?? 0) + cost
    w.contextTokens = ctxAfter
    await $.turn.complete({ answer: '', durationMs: ms, isAborted: false, turnId: 't', reason: 'answer' } as never)
  }
  await reply(20_000, 0.5, 120_000)
  await reply(95_000, 1.5, 145_000)
  await reply(45_000, 1.0, 170_000)
  for (const input of [
    { tool: 'Bash', command: 'ls' },
    { tool: 'Bash', command: 'false' },
    { tool: 'Read', file_path: '/a' },
    { tool: 'Bash', command: 'pwd' },
  ]) {
    await $.tool.call(input as never)
  }

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const tile = async (label: string) => {
    const all = await pane.findAll({ type: 'Text' })
    const i = all.findIndex(x => x.text === label)
    return all[i + 1]?.text
  }
  expect(await tile('Yanıt')).toBe('3')
  expect(await tile('Ort. yanıt süresi')).toBe('53 sn')
  expect(await tile('En uzun yanıt')).toBe('1 dk')
  expect(await tile('Araç kullanımı')).toBe('4')
  expect((await pane.find({ type: 'Text', text: '1 hata' }))?.text).toBe('1 hata')
  const tools = (await pane.findAll({ type: 'Text', text: /^ (Bash|Read) \d+$/ })).map(x => x.text)
  expect(tools).toEqual([' Bash 3', ' Read 1'])
  expect((await pane.find({ type: 'Text', text: /^Son 1 saat/ }))?.text).toBe('Son 1 saat $3,00')
  expect((await pane.find({ type: 'Text', text: /^En pahalı mesaj/ }))?.text).toBe('En pahalı mesaj $1,50')
  expect((await pane.find({ type: 'Text', text: /^Ortalama mesaj/ }))?.text).toBe('Ortalama mesaj $1,00')
  // 120K -> 145K -> 170K: +25K a message; (967K - 170K) / 25K = 31
  expect((await pane.find({ type: 'Text', text: /^Mesaj başı/ }))?.text).toBe('Mesaj başı +25 bin · ~31 mesaj sonra otomatik sıkıştırma')
  await pane.unmount()

  // Terminal draws the same Overview
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: 'OTURUM' }))?.text).toBe('OTURUM')
  await term.unmount()
})

// ---------- 10. Language never mixes ----------
test('a drawing before the language is known stays in one language, then switches whole', { options: { language: 'auto' } }, async ($, on) => {
  const w = world()
  w.env = { LANG: 'tr_TR.UTF-8' }
  stubEngine(on as AnyOn, w)
  // Before session.start: English throughout, numbers included
  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text', text: 'CONTEXT' }))?.text).toBe('CONTEXT')
  expect((await band.find({ type: 'Text', text: /213K/ }))?.text).toBe('213K / 1 M')
  expect(await band.find({ type: 'Text', text: /bin|BAĞLAM/ })).toBeUndefined()
  await band.unmount()
  // After it: Turkish throughout
  await $.session.start(start)
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text', text: 'BAĞLAM' }))?.text).toBe('BAĞLAM')
  expect((await band.find({ type: 'Text', text: /213 bin/ }))?.text).toBe('213 bin / 1 M')
  expect(await band.find({ type: 'Text', text: /213K|CONTEXT/ })).toBeUndefined()
  await band.unmount()
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Button', key: 'tab-overview' }))?.props.label).toBe('Genel')
  expect((await pane.find({ type: 'Text', text: /^%41/ }))?.text).toBe('%41 → sıfırlanırken ~%50')
  await pane.unmount()
})

// ---------- 11. Fixes in 1.1.1 ----------
test('just under a million tokens reads as millions, not "1000K"', async () => {
  expect(fmtTokens(999_600, 'en')).toBe('1 M')
  expect(fmtTokens(999_600, 'tr')).toBe('1 M')
  expect(fmtTokens(999_400, 'en')).toBe('999K')
})

test('model names: a dated id drops its date', async () => {
  const M = MESSAGES.en
  expect(modelName('claude-opus-5-5[1m]', M)).toBe('Opus 5.5 (1M context)')
  expect(modelName('claude-sonnet-4-20250514', M)).toBe('Sonnet 4')
  expect(modelName('claude-opus-4-5-20251101', M)).toBe('Opus 4.5')
  expect(modelName('claude-haiku-5-5', M)).toBe('Haiku 5.5')
  expect(modelName('opus', M)).toBe('opus')
})

test('a full limit says so, even early in its window', { options: { language: 'en' } }, async ($, on) => {
  const H = 3_600_000
  // 10 minutes into a 5 h window and already at 100%
  expect(limitForecast(100, new Date(5 * H - 10 * 60_000).toISOString(), 'five_hour', 0)).toEqual({
    projected: 100,
    fillInMs: 0,
    verdict: 'over',
  })
  const w = world()
  w.rateLimits = [{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(2 * H).toISOString() }]
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Text', text: 'Limit reached; wait for the reset' }))?.props.color).toBe('error')
  expect(await pane.find({ type: 'Text', text: /runs out in/ })).toBeUndefined()
  await pane.unmount()
})

test('a finished job leaves the running list when its notification arrives', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [
      { id: 'b1', type: 'shell', status: 'running', description: 'Build', command: 'npm run build' },
      { id: 'm1', type: 'monitor', status: 'running', description: 'Watch logs' },
    ],
    session_crons: [],
  } as never)
  const jobs = async () => {
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const label = (await band.find({ type: 'Button', key: 'jobs' }))?.props.label
    await band.unmount()
    return label
  }
  expect(await jobs()).toBe('⚙ 2 jobs')
  const deliver = (text: string) => $.session.receive({ origin: { kind: 'task-notification' }, text } as never)
  // The build ended: gone at once, not at the next reply's end
  await deliver('<task-notification><task-id>b1</task-id><status>completed</status><summary>Background command "npm run build" completed (exit code 0)</summary></task-notification>')
  expect(await jobs()).toBe('⚙ 1 job')
  // A notification that names no end leaves its job running
  await deliver('<task-notification><task-id>m1</task-id><summary>New log line</summary></task-notification>')
  expect(await jobs()).toBe('⚙ 1 job')
  await deliver('<task-notification><task-id>m1</task-id><status>killed</status><summary>Monitor stopped</summary></task-notification>')
  expect(await jobs()).toBeUndefined()
})

test('Remote Control in the desktop app: no dead button, a pointer to the app instead', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  // The desktop app runs its sessions without a REPL
  await $.session.start({ cwd: '/', surface: null, isInteractive: false } as never)
  let pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'tab-env' })
  await pane.unmount()
  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Button', key: 'rc' })).toBeUndefined()
  expect((await pane.find({ type: 'Text', text: /uzaktan kontrolü/ }))?.text).toBe(
    'Masaüstü uygulamasında uzaktan kontrolü uygulamanın kendi ayarlarından aç.',
  )
  await pane.unmount()
})

test('Remote Control answering "not available" is explained, not echoed', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  w.remote = 'unavailable'
  stubEngine(on as AnyOn, w)
  await $.session.start(start)
  let pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'tab-env' })
  await pane.unmount()
  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'rc' })
  expect(w.toasts.at(-1)).toBe("In the desktop app, turn Remote Control on from the app's own settings.")
  await pane.unmount()
})
