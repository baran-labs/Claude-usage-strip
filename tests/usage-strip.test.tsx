import { expect, test } from 'claude-code/testing'

import { fmtDuration, fmtPct, fmtShare, fmtTokens, fmtUsd, pickLang } from '../hooks/i18n'

// ---------- Shared fixtures ----------
const BAND = {
  plugin: 'usage-strip',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 } },
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

type World = {
  usd: number | undefined
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  contextTokens: number | undefined
  surfaces: string[]
  env: Record<string, string>
  cwd: string
  remote: 'ok' | 'fail'
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
    ran: [],
    toasts: [],
  }
}

// Stands in for the engine beneath the mod.
function engine(on: Parameters<Parameters<typeof test>[1] extends infer F ? (F extends (...a: infer A) => unknown ? (...a: A) => unknown : never) : never>[1], w: World) {
  void on
  return w
}

// The `on` a test body receives, typed loosely enough for these stand-ins.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOn = (event: any, ...rest: any[]) => void

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
  on('session.version', () => ({ value: { version: '2.1.317' } }))
  on('session.repo', () => ({ value: null }))
  on('session.surfaces', () => ({ value: w.surfaces }))
  on('command.run', (_: unknown, e: { command: string }) => {
    w.ran.push(e.command)
    if (w.remote === 'fail') throw new Error('not available here')
    return { text: 'Remote Control connected' }
  })
  on('ui.toast', (_: unknown, e: { text?: unknown }) => {
    w.toasts.push(String(e.text ?? ''))
    return { value: undefined }
  })
  on('turn.complete', () => ({ text: '' }))
  // The engine's own band: empty
  on('ui.render', ($: { ui: { resolve: (e: unknown) => { Box: (p: object) => unknown } } }, e: unknown) => {
    const { Box } = $.ui.resolve(e)
    return Box({})
  })
}
void engine

// ---------- 1. Formatting ----------
test('number, money, percent and duration formats in both languages', async () => {
  expect(fmtTokens(950, 'tr')).toBe('950')
  expect(fmtTokens(213_000, 'tr')).toBe('213 bin')
  expect(fmtTokens(213_000, 'en')).toBe('213K')
  expect(fmtTokens(1_250_000, 'tr')).toBe('1,3 M')
  expect(fmtTokens(1_250_000, 'en')).toBe('1.3 M')
  expect(fmtUsd(4.5537, 'tr')).toBe('$4,55')
  expect(fmtUsd(4.5537, 'en')).toBe('$4.55')
  expect(fmtUsd(0.004, 'tr')).toBe('<$0,01')
  expect(fmtUsd(0, 'en')).toBe('$0.00')
  expect(fmtPct(21, 'tr')).toBe('%21')
  expect(fmtPct(21, 'en')).toBe('21%')
  expect(fmtShare(1, 1000, 'en')).toBe('<1%')
  expect(fmtShare(0, 0, 'tr')).toBe('%0')
  expect(fmtDuration(54 * 60_000, 'tr')).toBe('54 dk')
  expect(fmtDuration(134 * 60_000, 'en')).toBe('2h 14m')
  expect(fmtDuration((6 * 1440 + 11 * 60) * 60_000, 'tr')).toBe('6 gün 11 sa')
  expect(pickLang('en', 'tr_TR.UTF-8')).toBe('en')
  expect(pickLang('auto', 'tr_TR.UTF-8')).toBe('tr')
  expect(pickLang('auto', 'en_US.UTF-8')).toBe('en')
  expect(pickLang('auto', undefined)).toBe('en')
})

// ---------- 2. Strip, Turkish, every surface ----------
test('strip draws in Turkish on every surface', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: 'Bağlam' }))?.text).toBe('Bağlam')
    expect((await band.find({ type: 'Text', text: /213 bin/ }))?.text).toBe('213 bin / 1 M')
    expect((await band.find({ type: 'Text', text: '5 saatlik' }))?.text).toBe('5 saatlik')
    expect((await band.find({ type: 'Text', text: /↻ 54 dk/ }))?.text).toBe('↻ 54 dk')
    expect((await band.find({ type: 'Text', text: /4,55/ }))?.text).toBe('$4,55')
    expect((await band.find({ type: 'Button', key: 'hide' }))?.props.label).toBe('Gizle ▾')
    expect((await band.find({ type: 'Button', key: 'details-btn' }))?.props.label).toBe('Ayrıntılar ↗')
    await band.unmount()
  }
})

// ---------- 3. Strip, English ----------
test('strip draws in English', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: 'Context' }))?.text).toBe('Context')
    expect((await band.find({ type: 'Text', text: /213K/ }))?.text).toBe('213K / 1 M')
    expect((await band.find({ type: 'Text', text: '5-hour' }))?.text).toBe('5-hour')
    expect((await band.find({ type: 'Text', text: 'Weekly' }))?.text).toBe('Weekly')
    expect((await band.find({ type: 'Text', text: /4\.55/ }))?.text).toBe('$4.55')
    expect((await band.find({ type: 'Button', key: 'hide' }))?.props.label).toBe('Hide ▾')
    expect(await band.find({ type: 'Text', text: /Bağlam|saatlik|Gizle/ })).toBeUndefined()
    await band.unmount()
  }
})

// ---------- 4. "auto" follows the system language ----------
test('auto language picks Turkish from LANG', { options: { language: 'auto' } }, async ($, on) => {
  const w = world()
  w.env = { LANG: 'tr_TR.UTF-8' }
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text', text: 'Bağlam' }))?.text).toBe('Bağlam')
  await band.unmount()
})

test('auto language picks English from LANG', { options: { language: 'auto' } }, async ($, on) => {
  const w = world()
  w.env = { LANG: 'de_DE.UTF-8' }
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text', text: 'Context' }))?.text).toBe('Context')
  await band.unmount()
})

// ---------- 5. Edge cases ----------
test('no limits, no cost, context not measured: still draws, no crash', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  w.rateLimits = []
  w.usd = undefined
  w.contextTokens = undefined
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: 'not measured' }))?.text).toBe('not measured')
    expect(await band.find({ type: 'Text', text: '5-hour' })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: 'API cost' })).toBeUndefined()
    await band.unmount()
    const pane = await $.ui.mount({ ...PANE, surface })
    expect((await pane.find({ type: 'Text', text: 'not measured yet' }))?.text).toBe('not measured yet')
    await pane.unmount()
  }
})

test('a survey above the prompt gets the space: the strip steps aside', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'desktop' })
  expect(await band.find({ type: 'Text', text: 'Context' })).toBeUndefined()
  await band.unmount()
})

test('a limit at 92% is coloured as critical', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const weekly = await band.find({ type: 'Text', text: /92%/ })
  expect(weekly?.props.color).toBe('error')
  const fiveHour = await band.find({ type: 'Text', text: /41%/ })
  expect(fiveHour?.props.color).toBe('success')
  await band.unmount()
})

// ---------- 6. Hide / show ----------
test('Hide collapses the strip to one line, Show brings it back, commands do the same', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const state = async () => {
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const open = (await band.find({ type: 'Text', text: 'Bağlam' })) !== undefined
    const collapsed = (await band.find({ type: 'Text', text: 'Kullanım şeridi gizli' })) !== undefined
    await band.unmount()
    return { open, collapsed }
  }
  expect(await state()).toEqual({ open: true, collapsed: false })

  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'hide' })
  await band.unmount()
  expect(await state()).toEqual({ open: false, collapsed: true })

  // A finished reply does not reopen it
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
  expect(await state()).toEqual({ open: false, collapsed: true })

  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Button', key: 'show' }))?.props.label).toBe('Göster ▴')
  await band.press({ key: 'show' })
  await band.unmount()
  expect(await state()).toEqual({ open: true, collapsed: false })

  // Turkish and English command names both toggle
  expect((await $.command.run({ command: 'kullanim' })).text).toBe('Kullanım şeridi gizlendi.')
  expect(await state()).toEqual({ open: false, collapsed: true })
  expect((await $.command.run({ command: 'usage-strip' })).text).toBe('Kullanım şeridi açıldı.')
  expect(await state()).toEqual({ open: true, collapsed: false })
})

// ---------- 7. Panel ----------
test('panel draws every section in Turkish and English', async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface })
    for (const heading of ['Status', 'Cost per message', 'What fills the context?', 'Token breakdown', 'Environment']) {
      expect((await pane.find({ type: 'Text', text: heading }))?.text).toBe(heading)
    }
    expect((await pane.find({ type: 'Text', text: /Opus/ }))?.text).toBe('Opus 5.5 (1M context)')
    expect((await pane.find({ type: 'Text', text: 'Phone connected' }))?.props.color).toBe('success')
    expect((await pane.find({ type: 'Text', text: /Desktop app/ }))?.text).toBe('Desktop app, Phone')
    // Deferred tools sit outside the window: not listed
    expect(await pane.find({ type: 'Text', text: /deferred/ })).toBeUndefined()
    await pane.unmount()
  }
})

test('panel in Turkish', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  w.surfaces = ['desktop']
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  for (const heading of ['Durum', 'Mesaj başı maliyet', 'Bağlam neyle dolu?', 'Token dökümü', 'Ortam']) {
    expect((await pane.find({ type: 'Text', text: heading }))?.text).toBe(heading)
  }
  expect((await pane.find({ type: 'Text', text: ' Mesajlar' }))?.text).toBe(' Mesajlar')
  expect((await pane.find({ type: 'Text', text: /Sıfırlanma: 54 dk/ }))?.text).toBe('Sıfırlanma: 54 dk')
  expect((await pane.find({ type: 'Text', text: 'Telefon bağlı değil' }))?.text).toBe('Telefon bağlı değil')
  expect((await pane.find({ type: 'Text', text: /Henüz ölçülen mesaj yok/ })) !== undefined).toBe(true)
  await pane.unmount()
})

// ---------- 8. Folder name ----------
test('a long folder name ends in "..." and a click shows the full name and path', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  w.cwd = LONG_CWD
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  let pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const label = (await pane.find({ type: 'Button', key: 'folder' }))?.props.label as string
  expect(label.length).toBe(24)
  expect(label.endsWith('...')).toBe(true)
  expect(label.startsWith('website-redesign-2026')).toBe(true)
  expect(await pane.find({ type: 'Text', text: /client-work/ })).toBeUndefined()
  await pane.press({ key: 'folder' })
  await pane.unmount()

  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Button', key: 'folder' }))?.props.label).toBe('website-redesign-2026-landing-pages-final')
  expect((await pane.find({ type: 'Text', text: /client-work/ }))?.text).toBe(
    '~/projects/client-work/website-redesign-2026-landing-pages-final',
  )
  await pane.press({ key: 'folder' })
  await pane.unmount()

  pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(((await pane.find({ type: 'Button', key: 'folder' }))?.props.label as string).endsWith('...')).toBe(true)
  await pane.unmount()
})

test('a short folder name is shown whole, without "..."', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  w.cwd = '/home/user/projects/my-game'
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Button', key: 'folder' }))?.props.label).toBe('my-game')
  await pane.unmount()
})

// ---------- 9. Remote Control button ----------
test('Remote Control button runs /remote-control and shows the answer', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'rc' })
  expect(w.ran.at(-1)).toBe('remote-control')
  expect(w.toasts.at(-1)).toBe('Remote Control connected')
  await pane.unmount()
})

test('Remote Control button reports a failure instead of breaking', { options: { language: 'tr' } }, async ($, on) => {
  const w = world()
  w.remote = 'fail'
  stubEngine(on as AnyOn, w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'rc' })
  expect(w.toasts.at(-1)?.startsWith('Uzaktan kontrol değiştirilemedi: ')).toBe(true)
  // The panel still draws after the failure
  expect((await pane.find({ type: 'Text', text: 'Ortam' }))?.text).toBe('Ortam')
  await pane.unmount()
})

// ---------- 10. Cost per message ----------
test('cost per message: main replies only, newest 20 kept', { options: { language: 'en' } }, async ($, on) => {
  const w = world()
  w.usd = 1
  stubEngine(on as AnyOn, w)
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const reply = async (cost: number, agentId?: string) => {
    await $.turn.start({ turnId: 't', ...(agentId ? { agentId } : {}) } as never)
    w.usd = (w.usd ?? 0) + cost
    await $.turn.complete({
      answer: '',
      durationMs: 1,
      isAborted: false,
      turnId: 't',
      reason: 'answer',
      ...(agentId ? { agentId } : {}),
    } as never)
  }

  await reply(0.25)
  await reply(0.5, 'sub-agent') // a subagent's end adds no bar
  let pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await pane.find({ type: 'Text', text: /^last / }))?.text).toBe('last 1 · avg $0.25')
  await pane.unmount()

  for (let i = 0; i < 24; i++) await reply(0.1)
  pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await pane.find({ type: 'Text', text: /^last / }))?.text).toBe('last 20 · avg $0.10')
  expect((await pane.find({ type: 'Text', text: 'Messages' })) !== undefined).toBe(true)
  await pane.unmount()

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text', text: /last message/ }))?.text).toBe('last message $0.10')
  await band.unmount()
})

// ---------- 11. Token counter ----------
test('token counter adds up every request, cards appear after the first', { options: { language: 'en' } }, async ($, on) => {
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
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ type: 'Text', text: 'Tokens' })).toBeUndefined()
  await band.unmount()

  for (let i = 0; i < 2; i++) {
    const stream = $.turn.step({ turnId: 't', index: i, model: 'm', messageCount: 1 } as never)
    for await (const _chunk of stream) {
      // drain
    }
  }

  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ type: 'Text', text: 'Tokens' }))?.text).toBe('Tokens')
  expect((await band.find({ type: 'Text', text: '200K' }))?.text).toBe('200K')
  expect((await band.find({ type: 'Text', text: / cache / }))?.text).toBe(' cache 98%')
  await band.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Text', text: /requests/ }))?.text).toBe('200K · 2 requests')
  await pane.unmount()
})
