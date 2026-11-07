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
  if (n >= 1_000_000) return (Math.round(n / 100_000) / 10).toString().replace('.', DOT[lang]) + ' M'
  if (n >= 1_000) return Math.round(n / 1_000) + (lang === 'tr' ? ' bin' : 'K')
  return String(Math.round(n))
}

export function fmtUsd(usd: number, lang: Lang): string {
  if (usd > 0 && usd < 0.01) return '<$0' + DOT[lang] + '01'
  return '$' + usd.toFixed(2).replace('.', DOT[lang])
}

export function fmtPct(p: number | string, lang: Lang): string {
  return lang === 'tr' ? `%${p}` : `${p}%`
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
  paneTitle: 'Kullanım Paneli',
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
  environment: 'Ortam',
  remote: 'Uzaktan kontrol',
  phoneOn: 'Telefon bağlı',
  phoneOff: 'Telefon bağlı değil',
  remoteToggle: 'Uzaktan kontrolü aç / kapat',
  remoteDone: 'Uzaktan kontrol komutu çalıştırıldı.',
  remoteFail: 'Uzaktan kontrol değiştirilemedi: ',
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
  paneTitle: 'Usage Panel',
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
  environment: 'Environment',
  remote: 'Remote Control',
  phoneOn: 'Phone connected',
  phoneOff: 'No phone connected',
  remoteToggle: 'Toggle Remote Control',
  remoteDone: 'Remote Control command ran.',
  remoteFail: 'Could not toggle Remote Control: ',
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
