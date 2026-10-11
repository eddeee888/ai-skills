import type { AgentCall, SkillRun, Threads } from '../types'
import { isSameSkill, SPINNER, SPINNER_MS } from './pr-panel.ts'

// The skills of pr-start's autopilot chain, in the order autopilot.md → "The chain" runs them.
export const AUTOPILOT_STAGES = ['cops:pr-review', 'cops:pr-address', 'cops:pr-sync', 'cops:pr-note']

// The phrase that ends the args of every stage run, after a dash.
export const AUTOPILOT_SUFFIX = 'autopilot stage of this pr-start run'

const SUFFIX = new RegExp(`\\s*[-\\u2010-\\u2015]*\\s*${AUTOPILOT_SUFFIX}\\s*$`, 'i')

export type Chain = {
  /** The strip's text. */
  line: string
  /** One `⚑ …` line per stage that ran out of order or was skipped. */
  warnings: string[]
  /** What the chain is doing: a stage in flight, a stop, the person taking over, or the PR ready. */
  status: 'running' | 'stopped' | 'resumed' | 'ready'
  /** The prompt text the Pick up button fills; unset when the stop can't be picked up. */
  pickUp?: string
  /** Whether the strip replaces the `Next:` row: while the chain runs or is stopped. */
  ownsNext: boolean
}

// The state of the latest autopilot chain in the session, for the pane's strip; undefined when none ran.
// A stage is a skill run whose args end in the suffix; the args' first URL is the PR. `fix` is the latest
// cops:pr-start run before the first stage (or an `--autopilot` one while no stage ran yet).
//   no autopilot run                               → undefined
//   review done, sync in flight                    → `Autopilot · PR #81 · fix ✓ → review ✓ → address ✓ → sync ⠹ → note · → ready ·`
//   turn ended after review began                  → `… → review ■ → address · … · stopped at review`, pickUp `/cops:pr-review <PR URL> `
//   sync began with address never run              → warnings `⚑ skipped address`
//   sync began, then address                       → warnings `⚑ ran sync before address`
//   all four started, turn ended, PR still draft   → `… · stopped at finish`, no pickUp
//   a plain cops run on the PR after the stages    → status resumed, no stop
//   view is another PR, or not ready               → `ready ?`
export const describeChain = ({ runs, calls = [], view, turnEndedAt, now }: {
  runs: SkillRun[]
  calls?: AgentCall[]
  view: Threads
  turnEndedAt?: number | null
  now: number
}): Chain | undefined => {
  const stageRuns = runs
    .filter(one => SUFFIX.test(one.args || '') && AUTOPILOT_STAGES.some(stage => isSameSkill({ a: one.skill, b: stage })))
    .map(one => ({ run: one, url: ((one.args || '').replace(SUFFIX, '').match(/https?:\/\/\S+/) || [])[0] }))
  const url = stageRuns.at(-1)?.url
  const chainRuns = stageRuns.filter(one => one.url === url).map(one => one.run)
  const first = chainRuns[0]
  const fix = runs.findLast(one => isSameSkill({ a: one.skill, b: 'cops:pr-start' }) && (first ? one.n < first.n : /^\s*--autopilot\b/.test(one.args || '')))
  if (!fix && !first) {
    return undefined
  }
  const index = ({ run }: { run: SkillRun }): number => AUTOPILOT_STAGES.findIndex(stage => isSameSkill({ a: run.skill, b: stage }))
  // Per stage, where its first run sits among the chain's runs; -1 when it never ran.
  const order = AUTOPILOT_STAGES.map((stage, at) => chainRuns.findIndex(one => index({ run: one }) === at))
  const started = order.map(one => one !== -1)
  const lastRun = chainRuns.at(-1)
  const lastStage = lastRun ? index({ run: lastRun }) : -1
  const last = lastRun || fix
  // Only to satisfy type safety: `fix` or `first` is set past the check above, so `last` is never undefined.
  if (!last) {
    return undefined
  }

  const isReady = view.status === 'ready' && url !== undefined && view.url === url && view.isDraft === false
  const isReadyKnown = view.status === 'ready' && url !== undefined && view.url === url && view.isDraft !== undefined
  const plain = url === undefined ? undefined : runs.findLast(one => one.n > last.n && one.skill.startsWith('cops:') && (one.args || '').includes(url) && !SUFFIX.test(one.args || ''))
  const busy = calls.some(one => one.startedAt >= last.at && (one.state === 'running' || one.state === 'background'))
  const isEnded = turnEndedAt !== undefined && turnEndedAt !== null && turnEndedAt >= last.at && !busy
  const isAllStarted = started.every(Boolean)
  const status = isReady ? 'ready' : plain ? 'resumed' : isEnded ? 'stopped' : 'running'
  // The step the chain stopped at: a stage name, `fix`, or `finish` when every stage ran.
  const stoppedAt = status !== 'stopped' ? undefined : !lastRun ? 'fix' : isAllStarted && lastStage === AUTOPILOT_STAGES.length - 1 ? 'finish' : AUTOPILOT_STAGES[lastStage].replace(/^cops:pr-/, '')

  const spinner = SPINNER[Math.floor(now / SPINNER_MS) % SPINNER.length]
  const mark = ({ step, stage }: { step: string, stage: number }): string => {
    if (stage === -1) {
      return lastRun ? '' : status === 'stopped' ? '■' : status === 'running' ? spinner : ''
    }
    if (!started[stage]) {
      return '·'
    }
    const isCurrent = stage === lastStage
    if (status === 'ready' || status === 'resumed' || !isCurrent) {
      return '✓'
    }
    if (status === 'stopped') {
      return stoppedAt === step ? '■' : '✓'
    }
    return spinner
  }
  const stages = AUTOPILOT_STAGES.map(stage => stage.replace(/^cops:pr-/, ''))
  const steps = ['fix', ...stages].map((step, at) => `${step} ${mark({ step, stage: at - 1 })}`.trim())
  const readyMark = isReady ? '✓' : isReadyKnown ? '·' : '?'
  const pr = url === undefined ? undefined : url.match(/\/pull\/(\d+)/)?.[1]
  const line = [
    'Autopilot',
    pr && `PR #${pr}`,
    `${steps.join(' → ')} → ready ${readyMark}`,
    stoppedAt && `stopped at ${stoppedAt}`,
  ].filter(Boolean).join(' · ')

  const warnings = stages.flatMap((stage, at) => {
    const before = order.findIndex((position, other) => other > at && position !== -1 && (order[at] === -1 || position < order[at]))
    if (before === -1) {
      return []
    }
    return [order[at] === -1 ? `⚑ skipped ${stage}` : `⚑ ran ${stages[before]} before ${stage}`]
  })

  const pickUp = stoppedAt && stoppedAt !== 'fix' && stoppedAt !== 'finish' && url ? `/${AUTOPILOT_STAGES[lastStage]} ${url} ` : undefined
  return { line, warnings, status, pickUp, ownsNext: status === 'running' || status === 'stopped' }
}
