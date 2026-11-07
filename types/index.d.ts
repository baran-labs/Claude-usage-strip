/** Token totals of every API request this session (since the mod loaded). */
export type StripTokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  requests: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-strip': {
      isHidden: boolean
      folderOpen: boolean
      tokens: StripTokens
      turnStartUsd: number | null
      /** API-price cost of each of the last 20 replies, in dollars. */
      costHistory: number[]
    }
  }
}
