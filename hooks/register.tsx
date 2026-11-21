// Usage Strip / Kullanım Şeridi
//
// Shows context fill, plan limits, tokens used, the API-price equivalent and
// background jobs above the prompt as visual cards; "Details" opens a tabbed
// usage panel beside the chat. Turkish and English.
// Bağlam doluluğunu, kullanım limitlerini, harcanan tokenları, API fiyatıyla
// karşılığını ve arka plan işlerini mesaj kutusunun üstünde görsel kartlarla
// gösterir; "Ayrıntılar" sohbetin yanında sekmeli bir panel açar.
//
// Adapted from Yash Thakker's "desktop-usage-strip" (MIT):
// https://github.com/whyashthakker/awesome-claude-code-mods
// No network, no file access, no shell commands. / İnternete bağlanmaz,
// dosyalara dokunmaz, komut çalıştırmaz.
//
// NOTE: JSX compiles against the global `h`; never name a variable `h` here.
import { atom, read, update } from 'claude-code'
import type {
  Register,
  SessionRateLimit,
  Color,
  RenderChildren,
  ContextCategory,
  ElementConstructor,
  TextProps,
  EngineInterface,
  AgentInfo,
} from 'claude-code'

import type {
  StripTokens,
  StripTab,
  StripBackground,
  StripOutput,
  StripBgTask,
  StripCron,
  StripFile,
  StripCostEntry,
  StripTurnStats,
  StripToolStats,
} from '../types'
import {
  MESSAGES,
  pickLang,
  fmtTokens,
  fmtUsd,
  fmtPct,
  fmtShare,
  fmtDuration,
  fmtRunTime,
  fmtAgo,
  type Lang,
  type Messages,
} from './i18n'

const isHidden = atom({ plugin: 'usage-strip', key: 'isHidden' } as const, false)
const folderOpen = atom({ plugin: 'usage-strip', key: 'folderOpen' } as const, false)
const EMPTY_TOKENS: StripTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 }
const tokenAtom = atom({ plugin: 'usage-strip', key: 'tokens' } as const, EMPTY_TOKENS)
const turnStartUsd = atom({ plugin: 'usage-strip', key: 'turnStartUsd' } as const, null as number | null)
const costHistory = atom({ plugin: 'usage-strip', key: 'costHistory' } as const, [] as number[])
const tabAtom = atom({ plugin: 'usage-strip', key: 'tab' } as const, 'overview' as StripTab)
const EMPTY_BG: StripBackground = { tasks: [], crons: [], at: null }
const bgAtom = atom({ plugin: 'usage-strip', key: 'background' } as const, EMPTY_BG)
const outputsAtom = atom({ plugin: 'usage-strip', key: 'outputs' } as const, [] as StripOutput[])
const filesAtom = atom({ plugin: 'usage-strip', key: 'files' } as const, [] as StripFile[])
const ctxLogAtom = atom({ plugin: 'usage-strip', key: 'ctxLog' } as const, [] as number[])
const costLogAtom = atom({ plugin: 'usage-strip', key: 'costLog' } as const, [] as StripCostEntry[])
const EMPTY_TURNS: StripTurnStats = { count: 0, totalMs: 0, maxMs: 0 }
const turnStatsAtom = atom({ plugin: 'usage-strip', key: 'turnStats' } as const, EMPTY_TURNS)
const EMPTY_TOOLS: StripToolStats = { total: 0, errors: 0, counts: {} }
const toolStatsAtom = atom({ plugin: 'usage-strip', key: 'toolStats' } as const, EMPTY_TOOLS)

const PANE_ID = 'usage-panel'
const TABS: StripTab[] = ['overview', 'cost', 'context', 'background', 'outputs', 'env']

// ---------- Sizes and colours ----------
// SVGs use saturated colours on a translucent track so they read on light and
// dark themes; all other text uses the app's own theme colours.
const RING = 54
const RING_STROKE = 6
const STACK_W = 170
const STACK_H = 8
const SPARK_W = 130
const SPARK_H = 26
const PANEL_W = 600
const FOLDER_MAX = 24
const TRACK = 'rgba(127,127,127,0.22)'
const MUTED = '#8b949e'
const FONT = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'

const COLOR = {
  ok: '#3fb950',
  warn: '#e3a008',
  crit: '#f85149',
  none: MUTED,
  cacheRead: '#58a6ff',
  cacheWrite: '#39c5cf',
  input: '#a371f7',
  output: '#db6d28',
  cost: '#d97757',
}
const CATEGORY_COLORS = ['#58a6ff', '#a371f7', '#3fb950', '#db6d28', '#e3a008', '#f778ba', '#39c5cf', '#8957e5']
const TASK_COLORS: Record<string, string> = {
  shell: '#58a6ff',
  subagent: '#a371f7',
  monitor: '#39c5cf',
  workflow: '#e3a008',
}

const FILE_COLORS: Record<string, string> = { written: '#3fb950', edited: '#e3a008' }

type Level = 'ok' | 'warn' | 'crit'
const TEXT_COLOR: Record<Level, Color> = { ok: 'success', warn: 'warning', crit: 'error' }

function level(percent: number): Level {
  if (percent >= 90) return 'crit'
  if (percent >= 80) return 'warn'
  return 'ok'
}

const ACTIVE = new Set(['pending', 'running', 'waiting'])

function statusColor(status: string): Color | undefined {
  if (status === 'running') return 'success'
  if (status === 'pending' || status === 'waiting') return 'warning'
  if (status === 'failed') return 'error'
  if (status === 'completed' || status === 'killed' || status === 'idle') return MUTED
  return undefined
}

function statusIcon(status: string): string {
  if (status === 'completed') return '✓'
  if (status === 'failed') return '✗'
  if (status === 'killed') return '■'
  return '•'
}

// ---------- Helpers ----------
function limitName(kind: string, m: Messages): string {
  return m.limitNames[kind] ?? kind.replace(/_/g, ' ')
}

function resetText(resetsAt: string | undefined, now: number, lang: Lang): string {
  if (!resetsAt) return ''
  const at = Date.parse(resetsAt)
  if (!Number.isFinite(at)) return ''
  if (at - now <= 0) return '↻ ' + MESSAGES[lang].resetNow
  return '↻ ' + fmtDuration(at - now + 59_999, lang)
}

// "/home/name/Desktop/project" -> "~/Desktop/project"
function shortPath(path: string): string {
  return path.replace(/^\/(home|Users)\/[^/]+/, '~')
}

function baseName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

// "a-very-long-folder-name" -> "a-very-long-fo..."
function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 3) + '...' : one
}

// "mcp__server__do_thing" -> "do_thing"; built-in names stay
export function toolLabel(name: string): string {
  const match = /^mcp__.+?__(.+)$/.exec(name)
  return match?.[1] ?? name
}

// "claude-opus-5-5[1m]" -> "Opus 5.5 (1M context)"
function modelName(id: string, m: Messages): string {
  const long = /\[1m\]/i.test(id)
  const match = /claude-([a-z]+)-(\d+)(?:-(\d+))?/i.exec(id)
  if (!match || !match[1] || !match[2]) return id
  const name = match[1].charAt(0).toUpperCase() + match[1].slice(1) + ' ' + match[2] + (match[3] ? '.' + match[3] : '')
  return name + (long ? m.ctx1m : '')
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch] ?? ch)
}

function svg(w: number, ht: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}">${body}</svg>`
}

// The terminal takes no text size or weight: drop them there, keep bold.
function textFor(surface: string, Raw: ElementConstructor<TextProps>): ElementConstructor<TextProps> {
  if (surface !== 'terminal') return Raw
  return ({ size: _size, weight, tabular: _tabular, ...rest }) =>
    Raw({ ...rest, bold: rest.bold || weight === 'bold' || weight === 'semibold' || undefined })
}

// ---------- Background jobs ----------
type StopFields = {
  background_tasks?: readonly { id: string; type: string; status: string; description: string; command?: string }[]
  session_crons?: readonly { id: string; schedule: string; recurring: boolean; prompt: string }[]
}

function snapshot(e: StopFields, now: number): StripBackground {
  const tasks: StripBgTask[] = (e.background_tasks ?? []).slice(0, 30).map(t => ({
    id: String(t.id),
    type: String(t.type),
    status: String(t.status),
    description: clip(String(t.description ?? ''), 200),
    ...(t.command ? { command: clip(String(t.command), 300) } : {}),
  }))
  const crons: StripCron[] = (e.session_crons ?? []).slice(0, 20).map(c => ({
    id: String(c.id),
    schedule: String(c.schedule),
    recurring: Boolean(c.recurring),
    prompt: clip(String(c.prompt ?? ''), 200),
  }))
  return { tasks, crons, at: now }
}

/** A background job's notification: `<task-id>`, `<status>`, `<summary>`, `<result>`, `<output-file>`. */
export function parseNotification(text: string, now: number): StripOutput | null {
  const tag = (name: string) => {
    const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)
    return match?.[1]?.trim() ?? ''
  }
  const id = tag('task-id')
  const status = tag('status')
  if (!id && !status) return null
  const durationMatch = /duration_ms["':=\s]+(\d+)/.exec(text)
  const summary = tag('summary') || clip(text.replace(/<[^>]+>/g, ' '), 300)
  return {
    id: id || `n${now}`,
    status: status || 'completed',
    summary: clip(summary, 300),
    result: tag('result').slice(0, 1500).trim(),
    outputFile: tag('output-file'),
    durationMs: durationMatch?.[1] ? Number(durationMatch[1]) : null,
    at: now,
  }
}

type Job = { key: string; type: string; status: string; description: string; command?: string }

/** Running jobs: shells, monitors, workflows from the snapshot; subagents live. */
function runningJobs(bg: StripBackground, agents: readonly AgentInfo[]): Job[] {
  const fromSnapshot = bg.tasks
    .filter(t => t.type !== 'subagent')
    .map(t => ({ key: 't-' + t.id, type: t.type, status: t.status, description: t.description, command: t.command }))
  const fromAgents = agents
    .filter(a => ACTIVE.has(a.status))
    .map(a => ({ key: 'a-' + a.id, type: 'subagent', status: a.status, description: a.description || a.type }))
  return [...fromAgents, ...fromSnapshot]
}

// ---------- Forecasts ----------
const HOUR = 3_600_000
const WINDOW_MS: Record<string, number> = {
  five_hour: 5 * HOUR,
  seven_day: 7 * 24 * HOUR,
  seven_day_opus: 7 * 24 * HOUR,
  seven_day_sonnet: 7 * 24 * HOUR,
}

export type LimitForecast = {
  /** Where the window ends up at its reset at this pace; null when too early to say. */
  projected: number | null
  /** How long until 100% at this pace; null when it will not get there before the reset. */
  fillInMs: number | null
  verdict: 'safe' | 'tight' | 'over' | 'early' | 'idle'
}

/** At the pace so far in this window (its use over the time since it opened), where it ends up. */
export function limitForecast(percent: number, resetsAt: string | undefined, kind: string, now: number): LimitForecast {
  const win = WINDOW_MS[kind]
  const reset = resetsAt ? Date.parse(resetsAt) : NaN
  if (win === undefined || !Number.isFinite(reset)) return { projected: null, fillInMs: null, verdict: 'early' }
  const elapsed = now - (reset - win)
  const left = Math.max(0, reset - now)
  if (percent <= 0) return { projected: 0, fillInMs: null, verdict: 'idle' }
  // Under 5% of the window gone, one busy minute would skew the pace.
  if (elapsed < win * 0.05) return { projected: null, fillInMs: null, verdict: 'early' }
  const rate = percent / elapsed
  const projected = percent + rate * left
  const toFull = Math.max(0, (100 - percent) / rate)
  if (projected >= 100) return { projected, fillInMs: toFull, verdict: 'over' }
  return { projected, fillInMs: null, verdict: projected >= 80 ? 'tight' : 'safe' }
}

export type ContextForecast = { perMessage: number | null; messagesLeft: number | null }

/** Average growth over the last few replies (a drop, as after a compaction, is skipped). */
export function contextForecast(log: readonly number[], current: number, threshold: number | undefined): ContextForecast {
  const steps: number[] = []
  for (let i = Math.max(1, log.length - 5); i < log.length; i++) {
    const d = (log[i] ?? 0) - (log[i - 1] ?? 0)
    if (d > 0) steps.push(d)
  }
  if (steps.length < 2) return { perMessage: null, messagesLeft: null }
  const perMessage = steps.reduce((a, d) => a + d, 0) / steps.length
  const messagesLeft = threshold === undefined ? null : Math.max(0, Math.floor((threshold - current) / perMessage))
  return { perMessage, messagesLeft }
}

// ---------- Drawings ----------
function ringSvg(percent: number | undefined, lang: Lang, size = RING, stroke = RING_STROKE): string {
  const r = (size - stroke) / 2
  const c = size / 2
  const len = 2 * Math.PI * r
  const p = percent === undefined ? 0 : Math.max(0, Math.min(100, percent))
  const color = percent === undefined ? COLOR.none : COLOR[level(p)]
  const dash = (p / 100) * len
  const label = percent === undefined ? '—' : fmtPct(Math.round(p), lang)
  return svg(
    size,
    size,
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${TRACK}" stroke-width="${stroke}"/>` +
      (dash > 0
        ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`
        : '') +
      `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="${Math.round(size / 3.9)}" font-weight="700" fill="${color}">${esc(label)}</text>`,
  )
}

function stackSvg(parts: { value: number; color: string; opacity?: number }[], w = STACK_W, ht = STACK_H, whole?: number): string {
  const total = whole ?? parts.reduce((a, p) => a + p.value, 0)
  let x = 0
  let body = `<rect width="${w}" height="${ht}" rx="${ht / 2}" fill="${TRACK}"/>`
  if (total > 0) {
    body += `<clipPath id="k"><rect width="${w}" height="${ht}" rx="${ht / 2}"/></clipPath><g clip-path="url(#k)">`
    for (const p of parts) {
      if (p.value <= 0) continue
      const pw = Math.max(2, (p.value / total) * w)
      body += `<rect x="${x.toFixed(2)}" width="${pw.toFixed(2)}" height="${ht}" fill="${p.color}" fill-opacity="${p.opacity ?? 1}"/>`
      x += pw
    }
    body += `</g>`
  }
  return svg(w, ht, body)
}

function sparkSvg(values: number[]): string {
  const n = Math.max(values.length, 1)
  const slot = SPARK_W / Math.max(n, 12)
  const barW = Math.max(2, slot - 2)
  const max = Math.max(...values, 0.0001)
  const start = SPARK_W - n * slot
  let body = `<line x1="0" y1="${SPARK_H - 0.5}" x2="${SPARK_W}" y2="${SPARK_H - 0.5}" stroke="${TRACK}" stroke-width="1"/>`
  values.forEach((v, i) => {
    const bh = Math.max(2, (v / max) * (SPARK_H - 2))
    const isLast = i === values.length - 1
    body += `<rect x="${(start + i * slot + 1).toFixed(2)}" y="${(SPARK_H - 1 - bh).toFixed(2)}" width="${barW.toFixed(2)}" height="${bh.toFixed(2)}" rx="1.5" fill="${COLOR.cost}" fill-opacity="${isLast ? 1 : 0.45}"/>`
  })
  return svg(SPARK_W, SPARK_H, body)
}

// Context: each category in its colour, free space as track, a mark where auto-compact starts.
function contextBarSvg(rows: { tokens: number; color: string }[], window: number, threshold: number | undefined): string {
  const W = PANEL_W
  const H = 12
  let x = 0
  let body = `<rect width="${W}" height="${H}" rx="${H / 2}" fill="${TRACK}"/>`
  body += `<clipPath id="c"><rect width="${W}" height="${H}" rx="${H / 2}"/></clipPath><g clip-path="url(#c)">`
  for (const r of rows) {
    const w = Math.max(2, (r.tokens / window) * W)
    body += `<rect x="${x.toFixed(1)}" width="${w.toFixed(1)}" height="${H}" fill="${r.color}"/>`
    x += w
  }
  body += `</g>`
  if (threshold !== undefined && threshold > 0 && threshold < window) {
    const tx = (threshold / window) * W
    body += `<rect x="${(tx - 1.5).toFixed(1)}" y="-1" width="3" height="${H + 2}" rx="1" fill="${COLOR.crit}"/>`
  }
  return svg(W, H, body)
}

// Cost per message: bars, the last one full colour, a dashed line at the average.
function costMiniSvg(values: number[]): string {
  const W = PANEL_W
  const H = 56
  const n = Math.max(values.length, 20)
  const slot = W / n
  const barW = Math.max(4, slot * 0.7)
  const max = Math.max(...values, 0.0001)
  const avg = values.reduce((a, v) => a + v, 0) / values.length
  const plot = H - 4
  let body = `<line x1="0" y1="${H - 0.5}" x2="${W}" y2="${H - 0.5}" stroke="${TRACK}" stroke-width="1"/>`
  values.forEach((v, i) => {
    const bh = Math.max(2, (v / max) * plot)
    const isLast = i === values.length - 1
    const x = i * slot + (slot - barW) / 2
    body += `<rect x="${x.toFixed(1)}" y="${(H - 1 - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${COLOR.cost}" fill-opacity="${isLast ? 1 : 0.5}"/>`
  })
  const ay = H - 1 - (avg / max) * plot
  body += `<line x1="0" y1="${ay.toFixed(1)}" x2="${W}" y2="${ay.toFixed(1)}" stroke="${COLOR.cost}" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.8"/>`
  return svg(W, H, body)
}

// Now (solid) and where it ends up at reset (faint), with a mark at 100%.
function forecastBarSvg(percent: number, projected: number | null, verdict: LimitForecast['verdict']): string {
  const W = PANEL_W
  const H = 10
  const scale = Math.max(100, Math.min(projected ?? 0, 150))
  const color = verdict === 'over' ? COLOR.crit : verdict === 'tight' ? COLOR.warn : COLOR.ok
  const x = (p: number) => (Math.max(0, Math.min(p, scale)) / scale) * W
  let body = `<rect width="${W}" height="${H}" rx="${H / 2}" fill="${TRACK}"/>`
  if (projected !== null && projected > percent) {
    body += `<rect width="${x(projected).toFixed(1)}" height="${H}" rx="${H / 2}" fill="${color}" fill-opacity="0.3"/>`
  }
  if (percent > 0) body += `<rect width="${Math.max(H, x(percent)).toFixed(1)}" height="${H}" rx="${H / 2}" fill="${color}"/>`
  if (scale > 100) body += `<rect x="${(x(100) - 1).toFixed(1)}" width="2" height="${H}" fill="${COLOR.crit}"/>`
  return svg(W, H, body)
}

function costChartSvg(values: number[], lang: Lang): string {
  const W = PANEL_W
  const H = 150
  const left = 44
  const top = 18
  const bottom = 22
  const plotW = W - left - 8
  const plotH = H - top - bottom
  const max = Math.max(...values, 0.01)
  const n = Math.max(values.length, 10)
  const slot = plotW / n
  const barW = Math.max(3, Math.min(26, slot * 0.68))
  let body = ''
  for (const f of [0, 0.5, 1]) {
    const y = top + plotH - f * plotH
    body += `<line x1="${left}" y1="${y.toFixed(1)}" x2="${W - 8}" y2="${y.toFixed(1)}" stroke="${TRACK}" stroke-width="1"/>`
    body += `<text x="${left - 6}" y="${y.toFixed(1)}" text-anchor="end" dominant-baseline="central" font-family="${FONT}" font-size="11" fill="${MUTED}">${esc(fmtUsd(max * f, lang))}</text>`
  }
  const maxIdx = values.indexOf(Math.max(...values))
  values.forEach((v, i) => {
    const bh = Math.max(2, (v / max) * plotH)
    const x = left + i * slot + (slot - barW) / 2
    const y = top + plotH - bh
    const isLast = i === values.length - 1
    body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${COLOR.cost}" fill-opacity="${isLast ? 1 : 0.5}"/>`
    if (isLast || i === maxIdx) {
      body += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="${COLOR.cost}">${esc(fmtUsd(v, lang))}</text>`
    }
    body += `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${MUTED}">${i + 1}</text>`
  })
  return svg(W, H, body)
}

// Text bar for surfaces without Svg (terminal): ███████░░░░░
function barText(percent: number, width = 10): string {
  const n = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)
  return '█'.repeat(n) + '░'.repeat(width - n)
}

// ---------- Files ----------
async function recordFile($: EngineInterface, path: string, action: StripFile['action']) {
  if (!path) return
  const now = await $.clock.now()
  await update($, filesAtom, list => {
    const old = list.find(f => f.path === path)
    const entry: StripFile = {
      path,
      action: old?.action === 'written' ? 'written' : action,
      count: (old?.count ?? 0) + 1,
      at: now,
    }
    return [...list.filter(f => f.path !== path), entry].slice(-30)
  })
}

// ---------- Commands ----------
async function toggleStrip($: EngineInterface, M: Messages) {
  const hidden = !(await read($, isHidden))
  await update($, isHidden, () => hidden)
  return { text: hidden ? M.stripHidden : M.stripShown }
}

async function openPanel($: EngineInterface, M: Messages) {
  await $.ui.open({ id: PANE_ID, title: M.paneTitle, focus: true, closeOnEscape: true })
  return {}
}

// ---------- Mod ----------
export const register: Register = (on, options) => {
  // Settled at session.start from the option and the system locale. A drawing
  // reads it once at its start, so one drawing never mixes two languages.
  let currentLang: Lang = pickLang(options.language, undefined)
  const m = () => MESSAGES[currentLang]

  on('session.start', async ($, e, next) => {
    const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
    currentLang = pickLang(options.language, locale)
    await $.command.register({
      name: currentLang === 'tr' ? 'kullanim' : 'usage-strip',
      description: m().cmdStrip,
      immediate: true,
    })
    await $.command.register({
      name: currentLang === 'tr' ? 'kullanim-panel' : 'usage-panel',
      description: m().cmdPanel,
      immediate: true,
    })
    // Countdowns tick once a minute. / Geri sayımlar dakikada bir güncellensin.
    $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
    // Anything drawn before the language was known is drawn again in it.
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // Add up every API request's tokens, subagents included.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const u = r.usage
    if (u) {
      await update($, tokenAtom, t => ({
        input: t.input + u.input_tokens,
        output: t.output + u.output_tokens,
        cacheRead: t.cacheRead + u.cache_read_input_tokens,
        cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
        requests: t.requests + 1,
      }))
    }
    return r
  })

  // Cost per message: session total at turn end minus at turn start.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const usd = (await $.session.usage()).cost?.usd ?? null
      await update($, turnStartUsd, () => usd)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent's turn ending changes the background list: redraw.
    $.ui.invalidate('ui.render')
    // Only replies to your messages count as a message's cost.
    if (e.agentId !== undefined) return next(e)
    const now = await $.clock.now()
    const usage = await $.session.usage()
    const start = await read($, turnStartUsd)
    const usd = usage.cost?.usd
    if (start !== null && usd !== undefined) {
      const delta = Math.max(0, usd - start)
      await update($, costHistory, list => [...list, delta].slice(-20))
      await update($, costLogAtom, list => [...list, { usd: delta, at: now }].slice(-50))
    }
    if (usage.context.tokens !== undefined) {
      const tokens = usage.context.tokens
      await update($, ctxLogAtom, list => [...list, tokens].slice(-20))
    }
    const ms = Math.max(0, e.durationMs ?? 0)
    await update($, turnStatsAtom, s => ({ count: s.count + 1, totalMs: s.totalMs + ms, maxMs: Math.max(s.maxMs, ms) }))
    return next(e)
  })

  // Background snapshot: what is in flight and scheduled, at each reply's end.
  on('classic.Stop', async ($, e, next) => {
    const now = await $.clock.now()
    const snap = snapshot(e as unknown as StopFields, now)
    await update($, bgAtom, () => snap)
    return next(e)
  })

  // A new subagent: redraw the job count.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    $.ui.invalidate('ui.render')
    return r
  })

  // A background job finished: keep its result for the Outputs tab.
  on('session.receive', async ($, e, next) => {
    if (e.origin.kind === 'task-notification') {
      const out = parseNotification(e.text, await $.clock.now())
      if (out) await update($, outputsAtom, list => [...list.filter(o => o.id !== out.id), out].slice(-15))
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // Every tool call, subagents' too: how many per tool, how many failed.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    const failed = Boolean(r.deny) || Boolean(r.isError)
    const name = String(e.tool)
    await update($, toolStatsAtom, s => ({
      total: s.total + 1,
      errors: s.errors + (failed ? 1 : 0),
      counts: { ...s.counts, [name]: (s.counts[name] ?? 0) + 1 },
    }))
    return r
  })

  // Files Claude writes or edits (paths from the tool call; nothing is read).
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const r = await next(e)
    if (!r.deny && !r.isError) await recordFile($, e.file_path, 'written')
    return r
  })
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const r = await next(e)
    if (!r.deny && !r.isError) await recordFile($, e.file_path, 'edited')
    return r
  })
  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const r = await next(e)
    if (!r.deny && !r.isError) await recordFile($, e.notebook_path, 'edited')
    return r
  })

  // Redraw on limit changes, and when a phone attaches/leaves.
  on('session.measure', ($, e, next) => {
    $.ui.invalidate('ui.render')
    return next(e)
  })
  on('session.attach', ($, e, next) => {
    $.ui.invalidate('ui.render')
    return next(e)
  })
  on('session.detach', ($, e, next) => {
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // Turkish and English command names do the same thing.
  on('command.run', { command: 'kullanim' }, $ => toggleStrip($, m()))
  on('command.run', { command: 'usage-strip' }, $ => toggleStrip($, m()))
  on('command.run', { command: 'kullanim-panel' }, $ => openPanel($, m()))
  on('command.run', { command: 'usage-panel' }, $ => openPanel($, m()))

  // ===== Strip above the prompt =====
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const lang = currentLang
    const M = MESSAGES[lang]

    const E = $.ui.resolve(e)
    const { Box, Button } = E
    const Text = textFor(e.surface, E.Text)

    // Hidden: collapse to a single "Show" line rather than vanish.
    if (await read($, isHidden)) {
      const below = await next(e)
      const collapsed = (
        <Box flexDirection="row" justifyContent="flex-end" alignItems="center" columnGap={1}>
          <Text size="caption" color={MUTED}>
            {M.hiddenNote}
          </Text>
          <Button key="show" label={M.show} plain onPress={() => void update($, isHidden, () => false)} />
        </Box>
      )
      if (!below) return collapsed
      return (
        <Box flexDirection="column">
          {collapsed}
          {below}
        </Box>
      )
    }

    // The terminal draws no Svg (its table still names one): use text bars there.
    const Svg = e.surface !== 'terminal' && 'Svg' in E ? E.Svg : undefined
    const usage = await $.session.usage()
    const now = await $.clock.now()
    const t = await read($, tokenAtom)
    const history = await read($, costHistory)
    const bg = await read($, bgAtom)
    const agents = await $.agent.list()
    const running = runningJobs(bg, agents).length
    const below = await next(e)

    // Rings: context + plan limits
    const ctx = usage.context
    const ctxMeasured = ctx.tokens !== undefined && ctx.percent !== undefined
    const rings = [
      {
        key: 'context',
        label: M.context,
        percent: ctxMeasured ? ctx.percent : undefined,
        detail: ctxMeasured ? `${fmtTokens(ctx.tokens ?? 0, lang)} / ${fmtTokens(ctx.window, lang)}` : M.notMeasured,
      },
      ...(usage.rateLimits.slice(0, 3) as SessionRateLimit[]).map(r => ({
        key: r.kind,
        label: limitName(r.kind, M),
        percent: r.percentUsed as number | undefined,
        detail: resetText(r.resetsAt, now, lang),
      })),
    ]

    const card = (key: string, children: RenderChildren[], center = false) => (
      <Box
        key={key}
        flexDirection="column"
        flexGrow={1}
        alignItems={center ? 'center' : 'stretch'}
        justifyContent="center"
        borderStyle="round"
        borderDimColor
        paddingX={1}
      >
        {children}
      </Box>
    )

    const ringCards = rings.map(g =>
      card(
        g.key,
        [
          Svg ? (
            <Svg
              key="g"
              source={ringSvg(g.percent, lang)}
              alt={`${g.label} ${g.percent === undefined ? M.notMeasured : fmtPct(Math.round(g.percent), lang)}`}
              width={RING}
              height={RING}
            />
          ) : (
            <Text key="g" bold color={g.percent === undefined ? undefined : TEXT_COLOR[level(g.percent)]}>
              {g.percent === undefined ? '—' : `${barText(g.percent)} ${fmtPct(Math.round(g.percent), lang)}`}
            </Text>
          ),
          <Text key="l" size="caption" weight="semibold">
            {g.label}
          </Text>,
          g.detail ? (
            <Text key="d" size="caption" tabular>
              {g.detail}
            </Text>
          ) : null,
        ],
        true,
      ),
    )

    // Tokens card: total + mix bar + legend
    const fresh = t.input + t.cacheWrite
    const total = t.cacheRead + fresh + t.output
    const parts = [
      { name: M.cache, value: t.cacheRead, color: COLOR.cacheRead },
      { name: M.input, value: fresh, color: COLOR.input },
      { name: M.output, value: t.output, color: COLOR.output },
    ]
    const tokenCard =
      t.requests > 0
        ? card('tokens', [
            <Box key="t" flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={2}>
              <Text size="caption" weight="semibold">
                {M.tokens}
              </Text>
              <Text size="heading" weight="bold" tabular>
                {fmtTokens(total, lang)}
              </Text>
            </Box>,
            Svg ? <Svg key="s" source={stackSvg(parts)} alt={M.altTokenMix} width={STACK_W} height={STACK_H} /> : null,
            <Box key="lg" flexDirection="row" columnGap={1}>
              {parts.map(p => (
                <Box key={p.name} flexDirection="row">
                  <Text size="caption" color={p.color}>
                    ●
                  </Text>
                  <Text size="caption" tabular>
                    {` ${p.name} ${fmtShare(p.value, total, lang)}`}
                  </Text>
                </Box>
              ))}
            </Box>,
          ])
        : null

    // Cost card: total + per-message sparkline
    const last = history.length > 0 ? history[history.length - 1] : undefined
    const costCard = usage.cost
      ? card('cost', [
          <Box key="t" flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={2}>
            <Text size="caption" weight="semibold">
              {M.apiCost}
            </Text>
            <Text size="heading" weight="bold" tabular color={COLOR.cost}>
              {fmtUsd(usage.cost.usd, lang)}
            </Text>
          </Box>,
          Svg && history.length > 0 ? (
            <Svg key="s" source={sparkSvg(history)} alt={M.costPerMessage} width={SPARK_W} height={SPARK_H} />
          ) : null,
          <Text key="d" size="caption" tabular>
            {last === undefined ? M.sessionTotal : `${M.lastMessage} ${fmtUsd(last, lang)}`}
          </Text>,
        ])
      : null

    // Buttons side by side, Hide always at the far right. The jobs button
    // shows only while something runs in the background.
    const openTab = (tab: StripTab) => {
      void update($, tabAtom, () => tab)
      void $.ui.open({ id: PANE_ID, title: M.paneTitle, focus: true, closeOnEscape: true })
    }
    const jobsButton =
      running > 0 ? (
        <Box key="jobs-box" flexDirection="column" justifyContent="center">
          <Button key="jobs" label={M.bgButton(running)} plain onPress={() => openTab('background')} />
        </Box>
      ) : null
    const detailsButton = (
      <Box key="details" flexDirection="column" justifyContent="center">
        <Button
          key="details-btn"
          label={M.details}
          plain
          onPress={() => void $.ui.open({ id: PANE_ID, title: M.paneTitle, focus: true, closeOnEscape: true })}
        />
      </Box>
    )
    const hideButton = (
      <Box key="hide-box" flexDirection="column" justifyContent="center">
        <Button key="hide" label={M.hide} plain onPress={() => void update($, isHidden, () => true)} />
      </Box>
    )

    const strip = (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1} alignItems="stretch">
        {ringCards}
        {tokenCard}
        {costCard}
        {jobsButton}
        {detailsButton}
        {hideButton}
      </Box>
    )

    if (!below) return strip
    return (
      <Box flexDirection="column">
        {strip}
        {below}
      </Box>
    )
  })

  // ===== Details panel beside the chat, in tabs =====
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const lang = currentLang
    const M = MESSAGES[lang]
    const E = $.ui.resolve(e)
    const { Box, Button } = E
    const Text = textFor(e.surface, E.Text)
    // The terminal draws no Svg (its table still names one): use text bars there.
    const Svg = e.surface !== 'terminal' && 'Svg' in E ? E.Svg : undefined
    const now = await $.clock.now()
    const tab = await read($, tabAtom)
    const usage = await $.session.usage(tab === 'context' || tab === 'overview' ? { breakdown: 'summary' } : undefined)
    const t = await read($, tokenAtom)
    const history = await read($, costHistory)
    const bg = await read($, bgAtom)
    const outputs = await read($, outputsAtom)
    const files = await read($, filesAtom)
    const ctxLog = await read($, ctxLogAtom)
    const costLog = await read($, costLogAtom)
    const turnStats = await read($, turnStatsAtom)
    const toolStats = await read($, toolStatsAtom)
    const agents = await $.agent.list()
    const jobs = runningJobs(bg, agents)

    const heading = (text: string, right?: RenderChildren) => (
      <Box key={'h-' + text} flexDirection="row" justifyContent="space-between" columnGap={2}>
        <Text weight="semibold" size="body">
          {text}
        </Text>
        {right ?? null}
      </Box>
    )
    const goTo = (target: StripTab) => () => void update($, tabAtom, () => target)

    // --- Tab bar ---
    const counts: Partial<Record<StripTab, number>> = { background: jobs.length, outputs: outputs.length + files.length }
    const tabBar = (
      <Box key="tabs" flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
        {TABS.map(id => {
          const n = counts[id]
          const label = (M.tabs[id] ?? id) + (n ? ` (${n})` : '')
          return id === tab ? (
            <Button key={'tab-' + id} label={label} variant="primary" onPress={goTo(id)} />
          ) : (
            <Button key={'tab-' + id} label={label} plain onPress={goTo(id)} />
          )
        })}
      </Box>
    )

    const sections: RenderChildren[] = []

    if (tab === 'overview') {
      // A one-screen dashboard of what the strip does not show. Every block is
      // the same card: a small heading, a figure on its right, a "→" to its tab.
      const card = (key: string, title: string, target: StripTab | null, right: string, body: RenderChildren[], grow = false) => (
        <Box key={key} flexDirection="column" flexGrow={grow ? 1 : 0} width={grow ? '48%' : undefined} borderStyle="round" borderDimColor paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
            <Text size="caption" weight="semibold" color={MUTED}>
              {title.toLocaleUpperCase(lang === 'tr' ? 'tr' : 'en')}
            </Text>
            <Box flexDirection="row" alignItems="center" columnGap={1}>
              {right ? (
                <Text size="caption" tabular>
                  {right}
                </Text>
              ) : null}
              {target ? <Button key={'go-' + target} label="→" plain onPress={goTo(target)} /> : null}
            </Box>
          </Box>
          {body}
        </Box>
      )
      const line = (key: string, left: RenderChildren, right: RenderChildren) => (
        <Box key={key} flexDirection="row" justifyContent="space-between" columnGap={2}>
          {left}
          {right}
        </Box>
      )

      // 1. Limits: where each window ends up by its reset at this pace
      const limits = (usage.rateLimits as SessionRateLimit[]).filter(r => WINDOW_MS[r.kind] !== undefined)
      if (limits.length > 0) {
        sections.push(
          card(
            'limit-fc',
            M.limitForecast,
            null,
            '',
            limits.map(r => {
              const fc = limitForecast(r.percentUsed, r.resetsAt, r.kind, now)
              const name = limitName(r.kind, M) + M.limitSuffix
              const nowPct = fmtPct(Math.round(r.percentUsed), lang)
              const verdictText =
                fc.verdict === 'over' && fc.fillInMs !== null
                  ? M.verdictOver(fmtDuration(fc.fillInMs + 59_999, lang))
                  : fc.verdict === 'tight'
                    ? M.verdictTight
                    : fc.verdict === 'safe'
                      ? M.verdictSafe
                      : fc.verdict === 'idle'
                        ? M.noUse
                        : M.tooEarly
              const verdictColor: Color | undefined =
                fc.verdict === 'over' ? 'error' : fc.verdict === 'tight' ? 'warning' : fc.verdict === 'safe' ? 'success' : undefined
              return (
                <Box key={'fc-' + r.kind} flexDirection="column">
                  {line(
                    'l1',
                    <Text weight="semibold">{name}</Text>,
                    <Text tabular>
                      {fc.projected === null ? nowPct : M.projected(nowPct, fmtPct(fc.projected >= 100 ? '100+' : Math.round(fc.projected), lang))}
                    </Text>,
                  )}
                  {Svg ? (
                    <Svg source={forecastBarSvg(r.percentUsed, fc.projected, fc.verdict)} alt={`${name} ${nowPct}`} />
                  ) : (
                    <Text color={verdictColor}>{barText(r.percentUsed, 20)}</Text>
                  )}
                  {line(
                    'l2',
                    <Text size="caption" color={verdictColor}>
                      {verdictText}
                    </Text>,
                    <Text size="caption" tabular color={MUTED}>
                      {resetText(r.resetsAt, now, lang)}
                    </Text>,
                  )}
                </Box>
              )
            }),
          ),
        )
      }

      // 2. Context: what fills it, where auto-compact starts, and how soon
      const bd = usage.context.breakdown
      const ctxNow = usage.context.tokens
      if (bd && ctxNow !== undefined) {
        const threshold = bd.isAutoCompactEnabled ? bd.autoCompactThreshold : undefined
        const fc = contextForecast(ctxLog, ctxNow, threshold)
        const used = bd.categories
          .filter((c: ContextCategory) => c.kind === 'used' && c.tokens > 0)
          .sort((a, b) => b.tokens - a.tokens)
          .map((c, i) => ({ name: M.categories[c.name] ?? c.name, tokens: c.tokens, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? MUTED }))
        const forecast = [
          fc.perMessage === null ? M.needMore : M.perMessage(fmtTokens(fc.perMessage, lang)),
          threshold === undefined ? M.compactOff : fc.messagesLeft === null ? '' : M.compactIn(fc.messagesLeft),
        ].filter(Boolean)
        sections.push(
          card(
            'ctx',
            M.tabs.context ?? M.context,
            'context',
            threshold ? M.untilCompact(fmtTokens(ctxNow, lang), fmtTokens(threshold, lang)) : `${fmtTokens(ctxNow, lang)} / ${fmtTokens(bd.rawMaxTokens, lang)}`,
            [
              Svg ? (
                <Svg key="bar" source={contextBarSvg(used, bd.rawMaxTokens, threshold)} alt={M.altContext} />
              ) : (
                <Text key="bar">{barText((ctxNow / bd.rawMaxTokens) * 100, 20)}</Text>
              ),
              <Box key="legend" flexDirection="row" flexWrap="wrap" columnGap={2}>
                {used.slice(0, 4).map(s => (
                  <Box key={'cl-' + s.name} flexDirection="row">
                    <Text size="caption" color={s.color}>
                      ●
                    </Text>
                    <Text size="caption" tabular>{` ${s.name} ${fmtShare(s.tokens, bd.rawMaxTokens, lang)}`}</Text>
                  </Box>
                ))}
              </Box>,
              <Text key="fc" size="caption" color={fc.messagesLeft !== null && fc.messagesLeft <= 3 ? 'warning' : MUTED}>
                {forecast.join(' · ')}
              </Text>,
            ],
          ),
        )
      }

      // 3. Cost: per-message bars with the average line, and the key figures
      const hourAgo = now - 3_600_000
      const lastHour = costLog.filter(c => c.at >= hourAgo).reduce((a, c) => a + c.usd, 0)
      const priciest = history.length > 0 ? Math.max(...history) : 0
      const avg = history.length > 0 ? history.reduce((a, v) => a + v, 0) / history.length : 0
      if (usage.cost) {
        sections.push(
          card('cost', M.tabs.cost ?? M.apiCost, 'cost', fmtUsd(usage.cost.usd, lang), [
            history.length === 0 ? (
              <Text key="none" size="caption">
                {M.noMessages}
              </Text>
            ) : Svg ? (
              <Svg key="chart" source={costMiniSvg(history)} alt={M.altCostChart} />
            ) : (
              <Text key="chart" size="caption" tabular>
                {history.slice(-8).map(v => fmtUsd(v, lang)).join('  ')}
              </Text>
            ),
            <Box key="figures" flexDirection="row" justifyContent="space-between" columnGap={2}>
              <Text size="caption" tabular>
                {`${M.lastHour} `}
                <Text size="caption" weight="semibold" color={COLOR.cost}>
                  {fmtUsd(lastHour, lang)}
                </Text>
              </Text>
              <Text size="caption" tabular>
                {`${M.avgMsg} `}
                <Text size="caption" weight="semibold">
                  {fmtUsd(avg, lang)}
                </Text>
              </Text>
              <Text size="caption" tabular>
                {`${M.priciestMsg} `}
                <Text size="caption" weight="semibold">
                  {fmtUsd(priciest, lang)}
                </Text>
              </Text>
            </Box>,
          ]),
        )
      }

      // 4. Session: four figures in one row, then the most used tools
      const topTools = Object.entries(toolStats.counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
      const stat = (key: string, label: string, value: string, color?: Color) => (
        <Box key={key} flexDirection="column" flexGrow={1}>
          <Text size="caption" color={MUTED}>
            {label}
          </Text>
          <Text weight="bold" tabular color={color}>
            {value}
          </Text>
        </Box>
      )
      sections.push(
        card('session', M.sessionStats, null, toolStats.errors > 0 ? M.errorsN(toolStats.errors) : '', [
          <Box key="stats" flexDirection="row" columnGap={2}>
            {stat('replies', M.replies, String(turnStats.count))}
            {stat('avg-reply', M.avgReply, turnStats.count > 0 ? fmtRunTime(turnStats.totalMs / turnStats.count, lang) : '—')}
            {stat('max-reply', M.longestReply, turnStats.count > 0 ? fmtRunTime(turnStats.maxMs, lang) : '—')}
            {stat('tools', M.toolCalls, String(toolStats.total))}
          </Box>,
          topTools.length === 0 ? (
            <Text key="tools-none" size="caption" color={MUTED}>
              {M.noTools}
            </Text>
          ) : (
            <Box key="tools-top" flexDirection="row" flexWrap="wrap" columnGap={2}>
              {topTools.map(([name, n], i) => (
                <Box key={'tool-' + name} flexDirection="row">
                  <Text size="caption" color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}>
                    ●
                  </Text>
                  <Text size="caption" tabular>{` ${toolLabel(name)} ${n}`}</Text>
                </Box>
              ))}
            </Box>
          ),
        ]),
      )

      // 5. Background and latest outputs, side by side
      const glance = [jobs.length > 0 ? M.bgRunningCount(jobs.length) : '', bg.crons.length > 0 ? M.bgScheduledCount(bg.crons.length) : '']
        .filter(Boolean)
        .join(' · ')
      const latest = [
        ...[...outputs].reverse().map(o => ({ key: 'o-' + o.id, at: o.at, icon: statusIcon(o.status), color: statusColor(o.status) as string | undefined, text: o.summary, mono: false })),
        ...[...files].reverse().map(f => ({ key: 'f-' + f.path, at: f.at, icon: f.action === 'written' ? '+' : '✎', color: FILE_COLORS[f.action], text: baseName(f.path), mono: true })),
      ]
        .sort((a, b) => b.at - a.at)
        .slice(0, 3)
      sections.push(
        <Box key="bottom" flexDirection="row" columnGap={1} alignItems="stretch">
          {card(
            'bg-mini',
            M.bgSummary,
            'background',
            '',
            [
              <Text key="glance" size="caption" color={jobs.length > 0 ? 'success' : MUTED}>
                {glance ? '⚙ ' + glance : M.bgNothing}
              </Text>,
              ...jobs.slice(0, 2).map(j => (
                <Text key={'jm-' + j.key} size="caption">
                  <Text size="caption" color={TASK_COLORS[j.type] ?? MUTED}>
                    ●
                  </Text>
                  {` ${clip(j.description || j.command || '', 34)}`}
                </Text>
              )),
            ],
            true,
          )}
          {card(
            'out-mini',
            M.latestOutputs,
            'outputs',
            '',
            latest.length === 0
              ? [
                  <Text key="none" size="caption" color={MUTED}>
                    {M.noFiles}
                  </Text>,
                ]
              : latest.map(x => (
                  <Text key={x.key} size="caption">
                    <Text size="caption" color={x.color}>
                      {x.icon}
                    </Text>
                    {x.mono ? (
                      <Text size="caption" mono>{` ${clip(x.text, 30)}`}</Text>
                    ) : (
                      ` ${clip(x.text, 34)}`
                    )}
                  </Text>
                )),
            true,
          )}
        </Box>,
      )
    }

    if (tab === 'cost') {
      const totalTokens = t.cacheRead + t.cacheWrite + t.input + t.output
      sections.push(
        <Box key="cost" flexDirection="column" rowGap={1}>
          {heading(
            M.costPerMessage,
            <Text tabular>
              {history.length > 0 ? M.lastN(history.length, fmtUsd(history.reduce((a, v) => a + v, 0) / history.length, lang)) : ''}
            </Text>,
          )}
          {history.length === 0 ? (
            <Text>{M.noMessages}</Text>
          ) : Svg ? (
            <Svg source={costChartSvg(history, lang)} alt={M.altCostChart} />
          ) : (
            <Text tabular>{history.map(v => fmtUsd(v, lang)).join('  ')}</Text>
          )}
        </Box>,
      )
      const breakdown = [
        { key: 'cr', name: M.cacheRead, value: t.cacheRead, color: COLOR.cacheRead, note: M.cheapest },
        { key: 'cw', name: M.cacheWrite, value: t.cacheWrite, color: COLOR.cacheWrite, note: '' },
        { key: 'in', name: M.freshInput, value: t.input, color: COLOR.input, note: '' },
        { key: 'out', name: M.outputLong, value: t.output, color: COLOR.output, note: M.priciest },
      ]
      const biggest = Math.max(...breakdown.map(d => d.value), 1)
      sections.push(
        <Box key="tokens" flexDirection="column" rowGap={1}>
          {heading(M.tokenBreakdown, <Text tabular>{`${fmtTokens(totalTokens, lang)} · ${t.requests} ${M.requests}`}</Text>)}
          {breakdown.map(d => (
            <Box key={d.key} flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
                <Box flexDirection="row">
                  <Text color={d.color}>●</Text>
                  <Text>{` ${d.name}`}</Text>
                  {d.note ? <Text size="caption" color={MUTED}>{`  ${d.note}`}</Text> : null}
                </Box>
                <Text tabular weight="semibold">{`${fmtTokens(d.value, lang)}  ${fmtShare(d.value, totalTokens, lang)}`}</Text>
              </Box>
              {Svg ? <Svg source={stackSvg([{ value: d.value, color: d.color }], PANEL_W, 6, biggest)} alt={`${d.name} ${M.altBar}`} /> : null}
            </Box>
          ))}
        </Box>,
      )
      sections.push(
        <Text key="foot" size="caption" color={MUTED}>
          {M.footnote}
        </Text>,
      )
    }

    if (tab === 'context') {
      const bd = usage.context.breakdown
      if (!bd) {
        sections.push(<Text key="ctx-none">{M.notMeasuredYet}</Text>)
      } else {
        const used = bd.categories
          .filter((c: ContextCategory) => c.kind === 'used' && c.tokens > 0)
          .sort((a, b) => b.tokens - a.tokens)
        const buffer = bd.categories.find((c: ContextCategory) => c.kind === 'buffer')
        const rows = used.map((c, i) => ({
          key: c.name,
          name: M.categories[c.name] ?? c.name,
          tokens: c.tokens,
          color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? MUTED,
          opacity: 1,
        }))
        if (buffer && buffer.tokens > 0) {
          rows.push({ key: buffer.name, name: M.categories[buffer.name] ?? buffer.name, tokens: buffer.tokens, color: MUTED, opacity: 0.55 })
        }
        const free = Math.max(0, bd.rawMaxTokens - rows.reduce((a, s) => a + s.tokens, 0))
        sections.push(
          <Box key="context" flexDirection="column" rowGap={1}>
            {heading(
              M.contextWhat,
              <Text tabular weight="semibold" color={TEXT_COLOR[level(bd.percentage)]}>
                {`${fmtPct(Math.round(bd.percentage), lang)} · ${fmtTokens(bd.totalTokens, lang)} / ${fmtTokens(bd.rawMaxTokens, lang)}`}
              </Text>,
            )}
            {Svg ? (
              <Svg
                source={stackSvg(
                  rows.map(s => ({ value: s.tokens, color: s.color, opacity: s.opacity })),
                  PANEL_W,
                  14,
                  bd.rawMaxTokens,
                )}
                alt={M.altContext}
              />
            ) : null}
            <Box flexDirection="column">
              {rows.map(s => (
                <Box key={s.key} flexDirection="row" justifyContent="space-between" columnGap={2}>
                  <Box flexDirection="row">
                    <Text color={s.color}>●</Text>
                    <Text>{` ${s.name}`}</Text>
                  </Box>
                  <Text tabular>{`${fmtTokens(s.tokens, lang)}  ${fmtShare(s.tokens, bd.rawMaxTokens, lang)}`}</Text>
                </Box>
              ))}
              <Box key="free" flexDirection="row" justifyContent="space-between" columnGap={2}>
                <Box flexDirection="row">
                  <Text color={MUTED}>○</Text>
                  <Text>{` ${M.freeSpace}`}</Text>
                </Box>
                <Text tabular>{`${fmtTokens(free, lang)}  ${fmtShare(free, bd.rawMaxTokens, lang)}`}</Text>
              </Box>
            </Box>
          </Box>,
        )
      }
    }

    if (tab === 'background') {
      const jobRow = (j: Job) => (
        <Box key={j.key} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
            <Box flexDirection="row">
              <Text color={TASK_COLORS[j.type] ?? MUTED}>●</Text>
              <Text weight="semibold">{` ${M.taskTypes[j.type] ?? j.type}`}</Text>
            </Box>
            <Text color={statusColor(j.status)}>{M.statuses[j.status] ?? j.status}</Text>
          </Box>
          <Text>{clip(j.description, 120)}</Text>
          {j.command ? (
            <Text size="caption" mono color={MUTED}>
              {clip(j.command, 140)}
            </Text>
          ) : null}
        </Box>
      )
      sections.push(
        <Box key="running" flexDirection="column" rowGap={1}>
          {heading(M.bgRunning, <Text tabular>{String(jobs.length)}</Text>)}
          {jobs.length === 0 ? <Text>{M.bgNothing}</Text> : jobs.map(jobRow)}
        </Box>,
      )
      const doneAgents = agents.filter(a => !ACTIVE.has(a.status)).slice(-5).reverse()
      if (doneAgents.length > 0) {
        sections.push(
          <Box key="recent-agents" flexDirection="column" rowGap={1}>
            {heading(M.bgRecentAgents)}
            {doneAgents.map(a => (
              <Box key={'d-' + a.id} flexDirection="row" justifyContent="space-between" columnGap={2}>
                <Box flexDirection="row">
                  <Text color={statusColor(a.status)}>{statusIcon(a.status)}</Text>
                  <Text>{` ${clip(a.description || a.type, 80)}`}</Text>
                </Box>
                <Text color={statusColor(a.status)}>{M.statuses[a.status] ?? a.status}</Text>
              </Box>
            ))}
          </Box>,
        )
      }
      sections.push(
        <Box key="crons" flexDirection="column" rowGap={1}>
          {heading(M.bgScheduled, <Text tabular>{String(bg.crons.length)}</Text>)}
          {bg.crons.length === 0 ? (
            <Text>{M.bgNoScheduled}</Text>
          ) : (
            bg.crons.map(c => (
              <Box key={'c-' + c.id} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
                <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
                  <Text mono weight="semibold">
                    {c.schedule}
                  </Text>
                  <Text color={MUTED}>{c.recurring ? M.recurring : M.once}</Text>
                </Box>
                <Text>{clip(c.prompt, 140)}</Text>
              </Box>
            ))
          )}
        </Box>,
      )
      sections.push(
        <Text key="bg-foot" size="caption" color={MUTED}>
          {bg.at === null ? M.bgNotYet : M.bgUpdated(fmtAgo(now - bg.at, lang))}
        </Text>,
      )
    }

    if (tab === 'outputs') {
      // Files Claude wrote or edited, then finished background jobs
      const fileList = [...files].reverse()
      sections.push(
        <Box key="files" flexDirection="column" rowGap={1}>
          {heading(M.filesTitle, <Text tabular>{String(files.length)}</Text>)}
          {fileList.length === 0 ? (
            <Text>{M.noFiles}</Text>
          ) : (
            <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
              {fileList.slice(0, 12).map(f => (
                <Box key={'f-' + f.path} flexDirection="row" justifyContent="space-between" columnGap={2}>
                  <Box flexDirection="row">
                    <Text color={FILE_COLORS[f.action]}>{f.action === 'written' ? '+' : '✎'}</Text>
                    <Text mono>{` ${baseName(f.path)}`}</Text>
                    <Text size="caption" color={MUTED}>{`  ${clip(shortPath(f.path.slice(0, -baseName(f.path).length)), 40)}`}</Text>
                  </Box>
                  <Text size="caption" color={MUTED}>
                    {[M.fileActions[f.action] ?? f.action, f.count > 1 ? M.times(f.count) : '', fmtAgo(now - f.at, lang)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Box>
              ))}
              {fileList.length > 12 ? (
                <Text size="caption" color={MUTED}>
                  {M.more(fileList.length - 12)}
                </Text>
              ) : null}
            </Box>
          )}
        </Box>,
      )
      const list = [...outputs].reverse()
      sections.push(
        <Box key="outputs" flexDirection="column" rowGap={1}>
          {heading(M.jobsTitle, <Text tabular>{String(outputs.length)}</Text>)}
          {list.length === 0 ? (
            <Text>{M.noOutputs}</Text>
          ) : (
            list.map(o => (
              <Box key={'o-' + o.id} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
                <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
                  <Box flexDirection="row">
                    <Text color={statusColor(o.status)}>{statusIcon(o.status)}</Text>
                    <Text weight="semibold" color={statusColor(o.status)}>{` ${M.statuses[o.status] ?? o.status}`}</Text>
                  </Box>
                  <Text size="caption" color={MUTED}>
                    {[o.durationMs !== null ? M.ranFor(fmtRunTime(o.durationMs, lang)) : '', fmtAgo(now - o.at, lang)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Box>
                <Text>{o.summary}</Text>
                {o.result ? <Text size="caption">{clip(o.result, 600)}</Text> : null}
                {o.outputFile ? (
                  <Text size="caption" mono color={MUTED}>
                    {`${M.outputFile} ${shortPath(o.outputFile)}`}
                  </Text>
                ) : null}
              </Box>
            ))
          )}
        </Box>,
      )
    }

    if (tab === 'env') {
      const [cwd, model, version, repo, surfaces, isFolderOpen] = await Promise.all([
        $.session.cwd(),
        $.session.model(),
        $.session.version(),
        $.session.repo(),
        $.session.surfaces(),
        read($, folderOpen),
      ])
      const phoneOn = surfaces.includes('mobile')
      const row = (key: string, label: string, value: RenderChildren, sub?: string, color?: Color) => (
        <Box key={key} flexDirection="row" justifyContent="space-between" columnGap={2}>
          <Text>{label}</Text>
          <Box flexDirection="column" alignItems="flex-end">
            {typeof value === 'string' ? (
              <Text weight="semibold" color={color}>
                {value}
              </Text>
            ) : (
              value
            )}
            {sub ? <Text size="caption">{sub}</Text> : null}
          </Box>
        </Box>
      )
      const toggleRemote = async () => {
        try {
          const r = await $.command.run({ command: 'remote-control' })
          const msg = (r.text ?? '').replace(/\s+/g, ' ').trim()
          $.ui.toast(msg ? msg.slice(0, 200) : M.remoteDone)
        } catch (err) {
          $.ui.toast(M.remoteFail + (err instanceof Error ? err.message : String(err)).slice(0, 160))
        }
        $.ui.invalidate('ui.render')
      }
      // Long folder names end in "..."; a click shows the full name and path.
      const folder = baseName(cwd)
      const folderValue = (
        <Button
          key="folder"
          label={isFolderOpen ? folder : clip(folder, FOLDER_MAX)}
          plain
          onPress={() => void update($, folderOpen, v => !v)}
        />
      )
      sections.push(
        <Box key="env" flexDirection="column" rowGap={1}>
          {heading(M.environment)}
          <Box flexDirection="column" rowGap={1} borderStyle="round" borderDimColor paddingX={1}>
            {row('rc', M.remote, phoneOn ? M.phoneOn : M.phoneOff, undefined, phoneOn ? 'success' : undefined)}
            <Box key="rc-btn" flexDirection="row" justifyContent="flex-end">
              <Button key="rc" label={M.remoteToggle} variant="primary" onPress={() => void toggleRemote()} />
            </Box>
            {row('folder', M.folder, folderValue, isFolderOpen ? shortPath(cwd) : undefined)}
            {row('model', M.model, modelName(model, M))}
            {row(
              'git',
              M.git,
              repo ? (repo.name ?? baseName(repo.root)) : M.notGit,
              repo?.remote ? repo.remote.replace(/^https?:\/\/|^git@/, '').replace(/\.git$/, '') : undefined,
            )}
            {row('surfaces', M.surfaces, surfaces.map(s => M.surfaceNames[s] ?? s).join(', ') || '—')}
            {row('version', M.version, version.version)}
          </Box>
        </Box>,
      )
    }

    return (
      <Box flexDirection="column" rowGap={2} paddingX={1} paddingY={1}>
        {tabBar}
        {sections}
      </Box>
    )
  })
}
