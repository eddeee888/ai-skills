import type { Usage, UsageTotals } from '../types'

// What each pr-oracle mode and pr-sidekick job costs in time and tokens, from the cops agent calls that finished.

// The modes or job a finished cops agent call is counted under:
//   'cops:pr-oracle', modes ['scout-repo', 'brief-task'], no job → 'scout-repo + brief-task'
//   'cops:pr-oracle', no modes, no job                         → 'pr-oracle'
//   'cops:pr-sidekick', no modes, job 'fix loop'               → 'fix loop'
//   'cops:pr-sidekick', no modes, no job                       → 'pr-sidekick'
export const keyCall = ({ agent, modes, job }: { agent: string; modes?: string[]; job?: string }): string => {
  if (agent === 'cops:pr-sidekick') {
    return job || 'pr-sidekick'
  }
  return modes && modes.length > 0 ? modes.join(' + ') : agent.replace(/^cops:/, '')
}

// What the store holds under `usage`; anything that isn't usage reads as none.
export const toUsage = ({ stored }: { stored: unknown }): Usage | undefined => {
  const isTotals = (value: unknown): value is UsageTotals =>
    typeof value === 'object' && value !== null
    && 'calls' in value && typeof value.calls === 'number'
    && 'durationMs' in value && typeof value.durationMs === 'number'
    && 'tokens' in value && typeof value.tokens === 'number'
  if (typeof stored !== 'object' || stored === null || !('since' in stored) || typeof stored.since !== 'number' || !('keys' in stored)) {
    return undefined
  }
  const keys = stored.keys
  if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) {
    return undefined
  }
  return {
    since: stored.since,
    keys: Object.fromEntries(Object.entries(keys).flatMap(([key, value]) => {
      if (!isTotals(value) || !('models' in value) || typeof value.models !== 'object' || value.models === null) {
        return []
      }
      return [[key, { calls: value.calls, durationMs: value.durationMs, tokens: value.tokens, models: Object.fromEntries(Object.entries(value.models).filter(([, one]) => isTotals(one))) }]]
    })),
  }
}

// The usage after one finished call under `key` on `model`, at `now`; usage starts accumulating at the first call:
//   undefined, 'fix loop', 'sonnet', 1000ms, 50 tokens, now 5
//     → { since: 5, keys: { 'fix loop': { calls: 1, durationMs: 1000, tokens: 50, models: { sonnet: { calls: 1, durationMs: 1000, tokens: 50 } } } } }
//   the same key again on 'opus', 500ms, 20 tokens → calls 2, durationMs 1500, tokens 70, models sonnet and opus
export const addUsage = ({ usage, key, model, durationMs, tokens, now }: {
  usage: Usage | undefined; key: string; model: string; durationMs: number; tokens: number; now: number
}): Usage => {
  const prior = usage?.keys[key]
  const priorModel = prior?.models[model]
  return {
    since: usage?.since ?? now,
    keys: {
      ...usage?.keys,
      [key]: {
        calls: (prior?.calls ?? 0) + 1,
        durationMs: (prior?.durationMs ?? 0) + durationMs,
        tokens: (prior?.tokens ?? 0) + tokens,
        models: {
          ...prior?.models,
          [model]: { calls: (priorModel?.calls ?? 0) + 1, durationMs: (priorModel?.durationMs ?? 0) + durationMs, tokens: (priorModel?.tokens ?? 0) + tokens },
        },
      },
    },
  }
}

// One row per mode or job, the one with the most tokens first:
//   'fix loop' 2 calls, 90s, 3000 tokens, models sonnet → 'fix loop · 2 calls · avg 45s · avg 1.5k tokens · sonnet'
//   'sweep-diff' 1 call, 65s, 800 tokens, models inherit → 'sweep-diff · 1 call · avg 1m 5s · avg 800 tokens · inherit'
//   two models                                          → '… · opus, sonnet' (most tokens first)
//   no usage                                            → []
export const describeUsage = ({ usage }: { usage: Usage | undefined }): { key: string; text: string }[] =>
  Object.entries(usage?.keys || {})
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .map(([key, totals]) => {
      const seconds = Math.round(totals.durationMs / totals.calls / 1000)
      const time = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`
      const average = Math.round(totals.tokens / totals.calls)
      const amount = average >= 1000 ? `${(average / 1000).toFixed(1)}k` : `${average}`
      const models = Object.entries(totals.models).sort((a, b) => b[1].tokens - a[1].tokens).map(([model]) => model).join(', ')
      return { key, text: `${key} · ${totals.calls} ${totals.calls === 1 ? 'call' : 'calls'} · avg ${time} · avg ${amount} tokens · ${models}` }
    })
