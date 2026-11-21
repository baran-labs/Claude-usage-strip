// Türkçe / English metinler ve sayı biçimleri.
// Turkish / English strings and number formats.

export type Lang = 'tr' | 'en'

/** "auto" önce ayara, sonra sistem diline bakar. / "auto" checks the option, then the system locale. */
export function pickLang(option: unknown, locale: string | undefined): Lang {
  if (option === 'tr' || option === 'en') return option
  return (locale ?? '').toLowerCase().startsWith('tr') ? 'tr' : 'en'
}

const DOT = { tr: ',', en: '.' }

export function fmtTokens(n: number, lang: Lang): string {
  // From 999.5K up, "1000K" would round: show it as millions.
  if (n >= 999_500) return (Math.round(n / 100_000) / 10).toString().replace('.', DOT[lang]) + ' M'
  if (n >= 1_000) return Math.round(n / 1_000) + (lang === 'tr' ? ' bin' : 'K')
  return String(Math.round(n))
}

export function fmtUsd(usd: number, lang: Lang): string {
  if (usd > 0 && usd < 0.01) return '<$0' + DOT[lang] + '01'
  return '$' + usd.toFixed(2).replace('.', DOT[lang])
}

export function fmtPct(p: number | string, lang: Lang): string {
  // "100+" reads "%100+" in Turkish and "100%+" in English
  const plus = typeof p === 'string' && p.endsWith('+')
  const n = plus ? String(p).slice(0, -1) : p
  return (lang === 'tr' ? `%${n}` : `${n}%`) + (plus ? '+' : '')
}

export function fmtShare(part: number, whole: number, lang: Lang): string {
  if (whole <= 0) return fmtPct(0, lang)
  const p = (part / whole) * 100
  return fmtPct(p > 0 && p < 1 ? '<1' : Math.round(p), lang)
}

export function fmtDuration(ms: number, lang: Lang): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const u = lang === 'tr' ? { d: ' gün', h: ' sa', m: ' dk' } : { d: 'd', h: 'h', m: 'm' }
  if (days > 0) return `${days}${u.d} ${hours}${u.h}`
  if (hours > 0) return `${hours}${u.h} ${mins}${u.m}`
  return `${mins}${u.m}`
}

/** Short run time: "45 sn" / "45s" under a minute, else like fmtDuration. */
export function fmtRunTime(ms: number, lang: Lang): string {
  if (ms < 60_000) return Math.max(1, Math.round(ms / 1000)) + (lang === 'tr' ? ' sn' : 's')
  return fmtDuration(ms, lang)
}

/** "az önce", "5 dk önce" / "just now", "5m ago" */
export function fmtAgo(ms: number, lang: Lang): string {
  if (ms < 60_000) return lang === 'tr' ? 'az önce' : 'just now'
  return lang === 'tr' ? `${fmtDuration(ms, lang)} önce` : `${fmtDuration(ms, lang)} ago`
}

const TR = {
  context: 'Bağlam',
  notMeasured: 'ölçülmedi',
  notMeasuredYet: 'henüz ölçülmedi',
  limitNames: {
    five_hour: '5 saatlik',
    seven_day: 'Haftalık',
    seven_day_opus: 'Haftalık Opus',
    seven_day_sonnet: 'Haftalık Sonnet',
    spend_limit: 'Harcama',
  } as Record<string, string>,
  limitSuffix: ' limit',
  tokens: 'Token',
  apiCost: 'API fiyatı',
  sessionTotal: 'oturum toplamı',
  lastMessage: 'son mesaj',
  cache: 'önbellek',
  input: 'giriş',
  output: 'çıkış',
  details: 'Ayrıntılar ↗',
  hide: 'Gizle ▾',
  show: 'Göster ▴',
  hiddenNote: 'Kullanım şeridi gizli',
  bgButton: (n: number) => `⚙ ${n} iş`,
  paneTitle: 'Kullanım Paneli',
  tabs: {
    overview: 'Genel',
    cost: 'Maliyet',
    context: 'Bağlam',
    background: 'Arka plan',
    outputs: 'Çıktılar',
    env: 'Ortam',
  } as Record<string, string>,
  status: 'Durum',
  resetsIn: 'Sıfırlanma:',
  resetUnknown: 'sıfırlanma bilinmiyor',
  resetNow: 'şimdi',
  sumApi: 'API fiyatıyla',
  sumTokens: 'Harcanan token',
  sumMessages: 'Mesaj',
  sumDuration: 'Oturum süresi',
  costPerMessage: 'Mesaj başı maliyet',
  lastN: (n: number, avg: string) => `son ${n} mesaj · ort. ${avg}`,
  noMessages: 'Henüz ölçülen mesaj yok. Bir sonraki mesajdan itibaren dolacak.',
  contextWhat: 'Bağlam neyle dolu?',
  freeSpace: 'Boş alan',
  categories: {
    'System prompt': 'Sistem talimatı',
    'System tools': 'Sistem araçları',
    'MCP tools': 'MCP araçları',
    'Custom agents': 'Özel ajanlar',
    'Memory files': 'Hafıza dosyaları',
    'MCP server instructions': 'MCP sunucu talimatları',
    Skills: 'Beceriler',
    'Slash commands': 'Komutlar',
    Messages: 'Mesajlar',
    'Free space': 'Boş alan',
    'Autocompact buffer': 'Sıkıştırma payı',
  } as Record<string, string>,
  tokenBreakdown: 'Token dökümü',
  requests: 'istek',
  cacheRead: 'Önbellekten okunan',
  cacheWrite: 'Önbelleğe yazılan',
  freshInput: 'Yeni giriş',
  outputLong: 'Yazılan (çıkış)',
  cheapest: 'en ucuz',
  priciest: 'en pahalı',
  // Background / Arka plan
  bgSummary: 'Arka plan',
  bgRunningCount: (n: number) => `${n} iş çalışıyor`,
  bgScheduledCount: (n: number) => `${n} zamanlanmış`,
  bgOutputsCount: (n: number) => `${n} çıktı`,
  bgNothing: 'Arka planda çalışan iş yok.',
  bgRunning: 'Şu an çalışanlar',
  bgRecentAgents: 'Son alt ajanlar',
  bgScheduled: 'Zamanlanmış görevler',
  bgNoScheduled: 'Zamanlanmış görev yok.',
  bgUpdated: (ago: string) => `Son güncelleme ${ago} · her yanıtın sonunda yenilenir`,
  bgNotYet: 'Liste ilk yanıt bitince dolar.',
  recurring: 'tekrarlı',
  once: 'tek sefer',
  open: 'Aç →',
  taskTypes: {
    shell: 'Komut',
    subagent: 'Alt ajan',
    monitor: 'İzleyici',
    workflow: 'İş akışı',
    'MCP task': 'MCP görevi',
    remote_agent: 'Uzak ajan',
  } as Record<string, string>,
  statuses: {
    running: 'çalışıyor',
    pending: 'sırada',
    waiting: 'bekliyor',
    idle: 'boşta',
    completed: 'bitti',
    failed: 'hata',
    killed: 'durduruldu',
  } as Record<string, string>,
  // Overview / Genel: forecasts and stats
  limitForecast: 'Limit tahmini',
  projected: (now: string, then: string) => `${now} → sıfırlanırken ~${then}`,
  verdictSafe: 'Bu hızla rahat yetişir',
  verdictTight: 'Bu hızla sınıra yaklaşır',
  verdictOver: (t: string) => `Bu hızla ~${t} sonra dolar`,
  verdictFull: 'Limit doldu, sıfırlanmayı bekle',
  tooEarly: 'Tahmin için henüz erken',
  noUse: 'Bu pencerede henüz kullanım yok',
  contextForecast: 'Bağlam tahmini',
  perMessage: (n: string) => `Mesaj başı +${n}`,
  compactIn: (n: number) => `~${n} mesaj sonra otomatik sıkıştırma`,
  compactOff: 'Otomatik sıkıştırma kapalı',
  needMore: 'Tahmin için birkaç mesaj daha gerekli',
  untilCompact: (used: string, at: string) => `${used} / sıkıştırma ${at}`,
  spending: 'Harcama',
  lastHour: 'Son 1 saat',
  priciestMsg: 'En pahalı mesaj',
  avgMsg: 'Ortalama mesaj',
  sessionStats: 'Oturum',
  replies: 'Yanıt',
  avgReply: 'Ort. yanıt süresi',
  longestReply: 'En uzun yanıt',
  toolCalls: 'Araç kullanımı',
  errorsN: (n: number) => `${n} hata`,
  noTools: 'Henüz araç kullanılmadı.',
  // Overview / Genel
  contextMix: 'Bağlam dağılımı',
  latestOutputs: 'Son çıktılar',
  recentFiles: 'Son dosyalar',
  lastAvg: (last: string, avg: string) => `son ${last} · ort. ${avg}`,
  more: (n: number) => `+${n} daha`,
  // Outputs / Çıktılar
  filesTitle: 'Bu oturumda değişen dosyalar',
  noFiles: 'Henüz dosya yazılmadı ya da düzenlenmedi.',
  fileActions: { written: 'yazıldı', edited: 'düzenlendi' } as Record<string, string>,
  times: (n: number) => `${n} kez`,
  outputsTitle: 'Biten işlerin çıktıları',
  noOutputs: 'Henüz biten arka plan işi yok. Bir iş bitince sonucu burada görünür.',
  jobsTitle: 'Biten arka plan işleri',
  outputFile: 'Çıktı dosyası:',
  ranFor: (t: string) => `${t} sürdü`,
  // Environment / Ortam
  environment: 'Ortam',
  remote: 'Uzaktan kontrol',
  phoneOn: 'Telefon bağlı',
  phoneOff: 'Telefon bağlı değil',
  remoteToggle: 'Uzaktan kontrolü aç / kapat',
  remoteDone: 'Uzaktan kontrol komutu çalıştırıldı.',
  remoteFail: 'Uzaktan kontrol değiştirilemedi: ',
  remoteInApp: 'Masaüstü uygulamasında uzaktan kontrolü uygulamanın kendi ayarlarından aç.',
  folder: 'Klasör',
  model: 'Model',
  git: 'Git',
  notGit: 'Git deposu değil',
  surfaces: 'Bağlı ekranlar',
  version: 'Claude Code sürümü',
  surfaceNames: { desktop: 'Masaüstü uygulaması', terminal: 'Terminal', vscode: 'VS Code', mobile: 'Telefon' } as Record<string, string>,
  ctx1m: ' (1M bağlam)',
  footnote:
    'Dolar tutarları API fiyatlarıyla hesaplanan karşılıktır; abonelikte ayrıca ödenmez. Token sayacı mod yüklendiğinden beri sayar.',
  cmdStrip: 'Kullanım şeridini gizle veya göster',
  cmdPanel: 'Ayrıntılı kullanım panelini aç',
  stripHidden: 'Kullanım şeridi gizlendi.',
  stripShown: 'Kullanım şeridi açıldı.',
  altUsed: 'dolu',
  altTokenMix: 'Token dağılımı',
  altCostChart: 'Mesaj başı maliyet grafiği',
  altContext: 'Bağlam dağılımı',
  altBar: 'çubuğu',
}

export type Messages = typeof TR

const EN: Messages = {
  context: 'Context',
  notMeasured: 'not measured',
  notMeasuredYet: 'not measured yet',
  limitNames: {
    five_hour: '5-hour',
    seven_day: 'Weekly',
    seven_day_opus: 'Weekly Opus',
    seven_day_sonnet: 'Weekly Sonnet',
    spend_limit: 'Spend',
  },
  limitSuffix: ' limit',
  tokens: 'Tokens',
  apiCost: 'API cost',
  sessionTotal: 'session total',
  lastMessage: 'last message',
  cache: 'cache',
  input: 'input',
  output: 'output',
  details: 'Details ↗',
  hide: 'Hide ▾',
  show: 'Show ▴',
  hiddenNote: 'Usage strip hidden',
  bgButton: (n: number) => `⚙ ${n} ${n === 1 ? 'job' : 'jobs'}`,
  paneTitle: 'Usage Panel',
  tabs: {
    overview: 'Overview',
    cost: 'Cost',
    context: 'Context',
    background: 'Background',
    outputs: 'Outputs',
    env: 'Environment',
  },
  status: 'Status',
  resetsIn: 'Resets in',
  resetUnknown: 'reset time unknown',
  resetNow: 'now',
  sumApi: 'At API prices',
  sumTokens: 'Tokens used',
  sumMessages: 'Messages',
  sumDuration: 'Session time',
  costPerMessage: 'Cost per message',
  lastN: (n: number, avg: string) => `last ${n} · avg ${avg}`,
  noMessages: 'No messages measured yet. The chart fills from your next message.',
  contextWhat: 'What fills the context?',
  freeSpace: 'Free space',
  categories: {},
  tokenBreakdown: 'Token breakdown',
  requests: 'requests',
  cacheRead: 'Cache read',
  cacheWrite: 'Cache write',
  freshInput: 'Fresh input',
  outputLong: 'Output',
  cheapest: 'cheapest',
  priciest: 'priciest',
  bgSummary: 'Background',
  bgRunningCount: (n: number) => `${n} running`,
  bgScheduledCount: (n: number) => `${n} scheduled`,
  bgOutputsCount: (n: number) => `${n} ${n === 1 ? 'output' : 'outputs'}`,
  bgNothing: 'Nothing is running in the background.',
  bgRunning: 'Running now',
  bgRecentAgents: 'Recent subagents',
  bgScheduled: 'Scheduled tasks',
  bgNoScheduled: 'No scheduled tasks.',
  bgUpdated: (ago: string) => `Updated ${ago} · refreshes after every reply`,
  bgNotYet: 'The list fills when the first reply ends.',
  recurring: 'recurring',
  once: 'one-off',
  open: 'Open →',
  taskTypes: {
    shell: 'Command',
    subagent: 'Subagent',
    monitor: 'Monitor',
    workflow: 'Workflow',
    'MCP task': 'MCP task',
    remote_agent: 'Remote agent',
  },
  statuses: {
    running: 'running',
    pending: 'queued',
    waiting: 'waiting',
    idle: 'idle',
    completed: 'done',
    failed: 'failed',
    killed: 'stopped',
  },
  limitForecast: 'Limit forecast',
  projected: (now: string, then: string) => `${now} → ~${then} at reset`,
  verdictSafe: 'At this pace you have plenty of room',
  verdictTight: 'At this pace you get close to the limit',
  verdictOver: (t: string) => `At this pace it runs out in ~${t}`,
  verdictFull: 'Limit reached; wait for the reset',
  tooEarly: 'Too early to forecast',
  noUse: 'No use in this window yet',
  contextForecast: 'Context forecast',
  perMessage: (n: string) => `+${n} per message`,
  compactIn: (n: number) => `auto-compact in ~${n} ${n === 1 ? 'message' : 'messages'}`,
  compactOff: 'Auto-compact is off',
  needMore: 'A few more messages needed to forecast',
  untilCompact: (used: string, at: string) => `${used} / compacts at ${at}`,
  spending: 'Spending',
  lastHour: 'Last hour',
  priciestMsg: 'Priciest message',
  avgMsg: 'Average message',
  sessionStats: 'Session',
  replies: 'Replies',
  avgReply: 'Avg reply time',
  longestReply: 'Longest reply',
  toolCalls: 'Tool calls',
  errorsN: (n: number) => `${n} ${n === 1 ? 'error' : 'errors'}`,
  noTools: 'No tools used yet.',
  contextMix: 'Context mix',
  latestOutputs: 'Latest outputs',
  recentFiles: 'Recent files',
  lastAvg: (last: string, avg: string) => `last ${last} · avg ${avg}`,
  more: (n: number) => `+${n} more`,
  filesTitle: 'Files changed this session',
  noFiles: 'No files written or edited yet.',
  fileActions: { written: 'written', edited: 'edited' },
  times: (n: number) => `${n}×`,
  outputsTitle: 'Results of finished jobs',
  noOutputs: 'No background job has finished yet. When one does, its result shows here.',
  jobsTitle: 'Finished background jobs',
  outputFile: 'Output file:',
  ranFor: (t: string) => `ran ${t}`,
  environment: 'Environment',
  remote: 'Remote Control',
  phoneOn: 'Phone connected',
  phoneOff: 'No phone connected',
  remoteToggle: 'Toggle Remote Control',
  remoteDone: 'Remote Control command ran.',
  remoteFail: 'Could not toggle Remote Control: ',
  remoteInApp: "In the desktop app, turn Remote Control on from the app's own settings.",
  folder: 'Folder',
  model: 'Model',
  git: 'Git',
  notGit: 'Not a git repository',
  surfaces: 'Connected screens',
  version: 'Claude Code version',
  surfaceNames: { desktop: 'Desktop app', terminal: 'Terminal', vscode: 'VS Code', mobile: 'Phone' },
  ctx1m: ' (1M context)',
  footnote:
    'Dollar amounts are what this usage would cost at API prices; a subscription is not charged extra. The token counter starts when the mod loads.',
  cmdStrip: 'Hide or show the usage strip',
  cmdPanel: 'Open the detailed usage panel',
  stripHidden: 'Usage strip hidden.',
  stripShown: 'Usage strip shown.',
  altUsed: 'used',
  altTokenMix: 'Token mix',
  altCostChart: 'Cost per message chart',
  altContext: 'Context breakdown',
  altBar: 'bar',
}

export const MESSAGES: Record<Lang, Messages> = { tr: TR, en: EN }
