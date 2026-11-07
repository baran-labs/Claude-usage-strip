// Usage Strip / Kullanım Şeridi
//
// Shows context fill, plan limits, tokens used and the API-price equivalent
// above the prompt as visual cards; "Details" opens a full usage panel beside
// the chat. Turkish and English.
// Bağlam doluluğunu, kullanım limitlerini, harcanan tokenları ve API fiyatıyla
// karşılığını mesaj kutusunun üstünde görsel kartlarla gösterir; "Ayrıntılar"
// sohbetin yanında ayrıntılı bir panel açar. Türkçe ve İngilizce.
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
} from 'claude-code'

import type { StripTokens } from '../types'
import {
  MESSAGES,
  pickLang,
  fmtTokens,
  fmtUsd,
  fmtPct,
  fmtShare,
  fmtDuration,
  type Lang,
  type Messages,
} from './i18n'

const isHidden = atom({ plugin: 'usage-strip', key: 'isHidden' } as const, false)
const folderOpen = atom({ plugin: 'usage-strip', key: 'folderOpen' } as const, false)
const EMPTY_TOKENS: StripTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 }
const tokenAtom = atom({ plugin: 'usage-strip', key: 'tokens' } as const, EMPTY_TOKENS)
const turnStartUsd = atom({ plugin: 'usage-strip', key: 'turnStartUsd' } as const, null as number | null)
const costHistory = atom({ plugin: 'usage-strip', key: 'costHistory' } as const, [] as number[])

const PANE_ID = 'usage-panel'

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

type Level = 'ok' | 'warn' | 'crit'
const TEXT_COLOR: Record<Level, Color> = { ok: 'success', warn: 'warning', crit: 'error' }

function level(percent: number): Level {
  if (percent >= 90) return 'crit'
  if (percent >= 80) return 'warn'
  return 'ok'
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
  return text.length > max ? text.slice(0, max - 3) + '...' : text
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
  let lang: Lang = pickLang(options.language, undefined)
  const m = () => MESSAGES[lang]

  on('session.start', async ($, e, next) => {
    const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
    lang = pickLang(options.language, locale)
    await $.command.register({
      name: lang === 'tr' ? 'kullanim' : 'usage-strip',
      description: m().cmdStrip,
      immediate: true,
    })
    await $.command.register({
      name: lang === 'tr' ? 'kullanim-panel' : 'usage-panel',
      description: m().cmdPanel,
      immediate: true,
    })
    // Countdowns tick once a minute. / Geri sayımlar dakikada bir güncellensin.
    $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
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
    // Subagent turns don't count: only replies to your messages.
    if (e.agentId !== undefined) return next(e)
    const start = await read($, turnStartUsd)
    const usd = (await $.session.usage()).cost?.usd
    if (start !== null && usd !== undefined) {
      const delta = Math.max(0, usd - start)
      await update($, costHistory, list => [...list, delta].slice(-20))
    }
    return next(e)
  })

  // Redraw after each turn, on limit changes, and when a phone attaches/leaves.
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
    const M = m()

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

    // Buttons side by side, Hide always at the far right.
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

  // ===== Details panel beside the chat =====
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const M = m()
    const E = $.ui.resolve(e)
    const { Box, Button } = E
    const Text = textFor(e.surface, E.Text)
    // The terminal draws no Svg (its table still names one): use text bars there.
    const Svg = e.surface !== 'terminal' && 'Svg' in E ? E.Svg : undefined
    const now = await $.clock.now()
    const usage = await $.session.usage({ breakdown: 'summary' })
    const t = await read($, tokenAtom)
    const history = await read($, costHistory)
    const isFolderOpen = await read($, folderOpen)
    const [cwd, model, version, repo, surfaces] = await Promise.all([
      $.session.cwd(),
      $.session.model(),
      $.session.version(),
      $.session.repo(),
      $.session.surfaces(),
    ])

    const heading = (text: string) => (
      <Text key={'h-' + text} weight="semibold" size="body">
        {text}
      </Text>
    )

    // --- 1. Status: context + plan limits (most looked at, on top) ---
    const ctx = usage.context
    const statuses = [
      {
        key: 'context',
        name: M.context,
        percent: ctx.tokens !== undefined ? ctx.percent : undefined,
        sub: ctx.tokens !== undefined ? `${fmtTokens(ctx.tokens, lang)} / ${fmtTokens(ctx.window, lang)}` : M.notMeasuredYet,
      },
      ...(usage.rateLimits as SessionRateLimit[]).map(r => ({
        key: r.kind,
        name: limitName(r.kind, M) + M.limitSuffix,
        percent: r.percentUsed as number | undefined,
        sub: resetText(r.resetsAt, now, lang).replace('↻', M.resetsIn) || M.resetUnknown,
      })),
    ]
    const statusSection = (
      <Box key="status" flexDirection="column" rowGap={1}>
        {heading(M.status)}
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
          {statuses.map(s => (
            <Box key={s.key} flexDirection="row" flexGrow={1} alignItems="center" columnGap={1} borderStyle="round" borderDimColor paddingX={1}>
              {Svg ? (
                <Svg
                  source={ringSvg(s.percent, lang, 64, 7)}
                  alt={`${s.name} ${s.percent === undefined ? '—' : fmtPct(Math.round(s.percent), lang)}`}
                  width={64}
                  height={64}
                />
              ) : (
                <Text bold color={s.percent === undefined ? undefined : TEXT_COLOR[level(s.percent)]}>
                  {s.percent === undefined ? '—' : fmtPct(Math.round(s.percent), lang)}
                </Text>
              )}
              <Box flexDirection="column">
                <Text weight="semibold">{s.name}</Text>
                <Text size="caption" tabular>
                  {s.sub}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    )

    // --- 2. Summary tiles ---
    const totalTokens = t.cacheRead + t.cacheWrite + t.input + t.output
    const tiles: { key: string; label: string; value: string; color?: Color }[] = [
      { key: 'usd', label: M.sumApi, value: usage.cost ? fmtUsd(usage.cost.usd, lang) : '—', color: COLOR.cost },
      { key: 'tok', label: M.sumTokens, value: fmtTokens(totalTokens, lang) },
      { key: 'msg', label: M.sumMessages, value: String(history.length) },
      { key: 'dur', label: M.sumDuration, value: fmtDuration(now - usage.startedAt, lang) },
    ]
    const summarySection = (
      <Box key="summary" flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
        {tiles.map(o => (
          <Box key={o.key} flexDirection="column" flexGrow={1} borderStyle="round" borderDimColor paddingX={1}>
            <Text size="caption" weight="medium">
              {o.label}
            </Text>
            <Text size="title" weight="bold" tabular color={o.color}>
              {o.value}
            </Text>
          </Box>
        ))}
      </Box>
    )

    // --- 3. Cost per message ---
    const costSection = (
      <Box key="cost" flexDirection="column" rowGap={1}>
        <Box flexDirection="row" justifyContent="space-between">
          {heading(M.costPerMessage)}
          <Text tabular>
            {history.length > 0 ? M.lastN(history.length, fmtUsd(history.reduce((a, v) => a + v, 0) / history.length, lang)) : ''}
          </Text>
        </Box>
        {history.length === 0 ? (
          <Text>{M.noMessages}</Text>
        ) : Svg ? (
          <Svg source={costChartSvg(history, lang)} alt={M.altCostChart} />
        ) : (
          <Text tabular>{history.map(v => fmtUsd(v, lang)).join('  ')}</Text>
        )}
      </Box>
    )

    // --- 4. What fills the context? ---
    const bd = usage.context.breakdown
    let contextSection: RenderChildren = null
    if (bd) {
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
      contextSection = (
        <Box key="context" flexDirection="column" rowGap={1}>
          <Box flexDirection="row" justifyContent="space-between">
            {heading(M.contextWhat)}
            <Text tabular weight="semibold" color={TEXT_COLOR[level(bd.percentage)]}>
              {`${fmtPct(Math.round(bd.percentage), lang)} · ${fmtTokens(bd.totalTokens, lang)} / ${fmtTokens(bd.rawMaxTokens, lang)}`}
            </Text>
          </Box>
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
        </Box>
      )
    }

    // --- 5. Token breakdown ---
    const breakdown = [
      { key: 'cr', name: M.cacheRead, value: t.cacheRead, color: COLOR.cacheRead, note: M.cheapest },
      { key: 'cw', name: M.cacheWrite, value: t.cacheWrite, color: COLOR.cacheWrite, note: '' },
      { key: 'in', name: M.freshInput, value: t.input, color: COLOR.input, note: '' },
      { key: 'out', name: M.outputLong, value: t.output, color: COLOR.output, note: M.priciest },
    ]
    const biggest = Math.max(...breakdown.map(d => d.value), 1)
    const tokenSection = (
      <Box key="tokens" flexDirection="column" rowGap={1}>
        <Box flexDirection="row" justifyContent="space-between">
          {heading(M.tokenBreakdown)}
          <Text tabular>{`${fmtTokens(totalTokens, lang)} · ${t.requests} ${M.requests}`}</Text>
        </Box>
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
      </Box>
    )

    // --- 6. Environment (least looked at, at the bottom) ---
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
    const envSection = (
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
      </Box>
    )

    // Order: most looked at on top, details below.
    return (
      <Box flexDirection="column" rowGap={2} paddingX={1} paddingY={1}>
        {statusSection}
        {summarySection}
        {costSection}
        {contextSection}
        {tokenSection}
        {envSection}
        <Text size="caption" color={MUTED}>
          {M.footnote}
        </Text>
      </Box>
    )
  })
}
