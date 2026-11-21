/** Token totals of every API request this session (since the mod loaded). */
export type StripTokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  requests: number
}

/** Which tab of the details panel is showing. */
export type StripTab = 'overview' | 'cost' | 'context' | 'background' | 'outputs' | 'env'

/** One in-flight background job as the last reply's end reported it. */
export type StripBgTask = {
  id: string
  type: string
  status: string
  description: string
  command?: string
}

/** One scheduled task (CronCreate, ScheduleWakeup, /loop). */
export type StripCron = {
  id: string
  schedule: string
  recurring: boolean
  prompt: string
}

/** Background snapshot, taken at the end of every main reply. */
export type StripBackground = {
  tasks: StripBgTask[]
  crons: StripCron[]
  at: number | null
}

/** A finished background job, from its notification. */
export type StripOutput = {
  id: string
  status: string
  summary: string
  result: string
  outputFile: string
  durationMs: number | null
  at: number
}

/** A file Claude wrote or edited this session (from the tool call; no file is read). */
export type StripFile = {
  path: string
  action: 'written' | 'edited'
  count: number
  at: number
}

export type StripCostEntry = { usd: number; at: number }

export type StripTurnStats = { count: number; totalMs: number; maxMs: number }

export type StripToolStats = { total: number; errors: number; counts: Record<string, number> }

declare module 'claude-code' {
  interface PluginState {
    'usage-strip': {
      isHidden: boolean
      folderOpen: boolean
      tokens: StripTokens
      turnStartUsd: number | null
      /** API-price cost of each of the last 20 replies, in dollars. */
      costHistory: number[]
      tab: StripTab
      background: StripBackground
      /** The last 15 finished background jobs, newest last. */
      outputs: StripOutput[]
      /** The last 30 files written or edited, newest last. */
      files: StripFile[]
      /** Context tokens after each of the last 20 replies. */
      ctxLog: number[]
      /** Each of the last 50 replies' API-price cost and when it ended. */
      costLog: StripCostEntry[]
      /** Replies since the mod loaded: count, total and longest time. */
      turnStats: StripTurnStats
      /** Tool calls since the mod loaded: per tool, and how many failed. */
      toolStats: StripToolStats
    }
  }
}
