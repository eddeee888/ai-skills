import type { AgentCall, SkillRun, Threads } from '../types'
import { isSameSkill, SPINNER, SPINNER_MS } from './pr-panel.ts'

// The skills of pr-start's autopilot chain, in the order autopilot.md → "The chain" runs them.
export const AUTOPILOT_STAGES = ['cops:pr-review', 'cops:pr-address', 'cops:pr-wrap-up', 'cops:pr-note']

// The phrase that ends the args of every stage run, after a dash.
export const AUTOPILOT_SUFFIX = 'autopilot stage of this pr-start run'

const SUFFIX = new RegExp(`\\s*[-\\u2010-\\u2015]*\\s*${AUTOPILOT_SUFFIX}\\s*$`, 'i')

export type ChainStep = {
  name: string
  /** `✓` done, `■` stopped here, `·` not started, `?` unknown, a spinner frame in flight, '' for `fix` once a stage ran. */
  mark: string
  state: 'done' | 'active' | 'stopped' | 'pending' | 'unknown'
}

export type Chain = {
  /** The strip's text on one line. */
  line: string
  /** The card's heading: `Autopilot`, then `PR #n` when known. */
  title: string
  /** One row per step of the card: fix, the stages, then ready. */
  steps: ChainStep[]
  /** The step the chain stopped at, when it did. */
  stoppedAt?: string
  /** One `⚑ …` line per stage that ran out of order or was skipped. */
  warnings: string[]
  /** What the chain is doing: a stage in flight, a stop, a finished draft, the person taking over, or the PR marked ready. */
  status: 'running' | 'stopped' | 'finished' | 'resumed' | 'ready'
  /** The prompt text the Pick up button fills; unset when the stop can't be picked up. */
  pickUp?: string
  /** Whether the strip replaces the `Next:` row: while the chain runs, is stopped, or is a finished draft. */
  ownsNext: boolean
}

// The state of the latest autopilot chain in the session, for the pane's strip; undefined when none ran.
// A stage is a skill run whose args end in the suffix; the args' first URL is the PR. `fix` is the latest
// cops:pr-start run before the first stage (or an `--autopilot` one while no stage ran yet).
//   no autopilot run                               → undefined
//   review done, sync in flight                    → `Autopilot · PR #81 · fix → review ✓ → address ✓ → sync ⠹ → note · → ready ·`
//   turn ended after review began                  → `… → review ■ → address · … · stopped at review`, pickUp `/cops:pr-review <PR URL> `
//   sync began with address never run              → warnings `⚑ skipped address`
//   sync began, then address                       → warnings `⚑ ran sync before address`
//   all but address started, turn ended, open PR   → `… → note ✓ → ready · · finished, still a draft`, status finished, no pickUp
//   all four started, the view another PR          → `… → ready ? · stopped at finish`, no pickUp
//   all four started, PR closed, no notes posted   → `… → note ■ → ready · · stopped at note`, pickUp `/cops:pr-note <PR URL> `
//   a plain cops run on the PR after the stages    → status resumed, no stop
//   view is another PR, or not ready               → `ready ?`
export const describeChain = ({ runs, calls = [], view, turnEndedAt, now }: {
  runs: SkillRun[]
  calls?: AgentCall[]
  view: Threads
  turnEndedAt?: number | null
  now: number
}): Chain | undefined => {
  // A later `--autopilot` run starts a new chain, so stage runs from before it belong to an earlier one.
  const latestStart = runs.findLast(one => isSameSkill({ a: one.skill, b: 'cops:pr-start' }) && /^\s*--autopilot\b/.test(one.args || ''))
  const stageRuns = runs
    .filter(one => one.n > (latestStart?.n ?? 0) && SUFFIX.test(one.args || '') && AUTOPILOT_STAGES.some(stage => isSameSkill({ a: one.skill, b: stage })))
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
  // Whether note's comments are posted, or the view can't tell (another PR); a draft PR with none means note never finished.
  const isNoteDone = view.status !== 'ready' || view.url !== url || view.hasNotes
  // Address may be skipped when the review had no findings, so it is the one stage that need not have started.
  const addressAt = AUTOPILOT_STAGES.indexOf('cops:pr-address')
  const isRequiredStarted = started.every((one, at) => one || at === addressAt)
  // Every stage but address started and note ran last; on an open PR whose draft state the view knows, that is a finished draft.
  const isFinished = isEnded && isRequiredStarted && lastStage === AUTOPILOT_STAGES.length - 1 && view.status === 'ready' && view.state === 'OPEN' && isReadyKnown
  const status = isReady ? 'ready' : plain ? 'resumed' : isFinished ? 'finished' : isEnded ? 'stopped' : 'running'
  // The step the chain stopped at: a stage name, `fix`, or `finish` when every stage ran and note finished.
  const stoppedAt = status !== 'stopped' ? undefined : !lastRun ? 'fix' : isAllStarted && lastStage === AUTOPILOT_STAGES.length - 1 && isNoteDone ? 'finish' : AUTOPILOT_STAGES[lastStage].replace(/^cops:pr-/, '')

  const spinner = SPINNER[Math.floor(now / SPINNER_MS) % SPINNER.length]
  const mark = ({ step, stage }: { step: string, stage: number }): string => {
    if (stage === -1) {
      return lastRun ? '' : status === 'stopped' ? '■' : status === 'running' ? spinner : ''
    }
    if (!started[stage]) {
      return '·'
    }
    const isCurrent = stage === lastStage
    if (status === 'ready' || status === 'resumed' || status === 'finished' || !isCurrent) {
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
  const title = ['Autopilot', pr && `PR #${pr}`].filter(Boolean).join(' · ')
  const marks = ['fix', ...stages].map((step, at) => ({ step, mark: mark({ step, stage: at - 1 }) }))
  const stateOf = ({ mark: one }: { mark: string }): ChainStep['state'] => one === '✓' ? 'done' : one === '■' ? 'stopped' : one === '·' ? 'pending' : one === '?' ? 'unknown' : one === '' ? 'done' : 'active'
  const cards: ChainStep[] = [
    ...marks.map(({ step, mark: one }) => ({ name: step, mark: one || '✓', state: stateOf({ mark: one }) })),
    { name: 'ready', mark: readyMark, state: stateOf({ mark: readyMark }) },
  ]
  const line = [
    'Autopilot',
    pr && `PR #${pr}`,
    `${steps.join(' → ')} → ready ${readyMark}`,
    stoppedAt && `stopped at ${stoppedAt}`,
    status === 'finished' && 'finished, still a draft',
  ].filter(Boolean).join(' · ')

  const warnings = stages.flatMap((stage, at) => {
    const before = order.findIndex((position, other) => other > at && position !== -1 && (order[at] === -1 || position < order[at]))
    if (before === -1) {
      return []
    }
    return [order[at] === -1 ? `⚑ skipped ${stage}` : `⚑ ran ${stages[before]} before ${stage}`]
  })

  const pickUp = stoppedAt && stoppedAt !== 'fix' && stoppedAt !== 'finish' && url ? `/${AUTOPILOT_STAGES[lastStage]} ${url} ` : undefined
  return { line, title, steps: cards, stoppedAt, warnings, status, pickUp, ownsNext: (status === 'running' || status === 'stopped' || status === 'finished') && (url === undefined || (view.status === 'ready' && view.url === url)) }
}
