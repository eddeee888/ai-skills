import { describe, expect, test } from 'claude-code/testing'
import type { AgentCall, SkillRun, Threads } from '../types'
import { AUTOPILOT_STAGES, describeChain } from './autopilot-chain.ts'

const URL = 'https://github.com/o/r/pull/81'
const SUFFIX = `${URL} — autopilot stage of this pr-start run`

let count = 0
const skill = ({ name, args = '', at }: { name: string; args?: string; at: number }): SkillRun => {
  count += 1
  return { n: count, skill: name, args, by: 'model', at }
}
const start = ({ at }: { at: number }): SkillRun => skill({ name: 'cops:pr-start', args: '--autopilot fix the thing', at })
const stage = ({ name, at }: { name: string; at: number }): SkillRun => skill({ name: `cops:pr-${name}`, args: SUFFIX, at })
const view = ({ isDraft = true, url = URL, hasNotes = false, state = 'OPEN' }: { isDraft?: boolean; url?: string; hasNotes?: boolean; state?: 'OPEN' | 'MERGED' | 'CLOSED' } = {}): Threads => ({
  status: 'ready', pr: 81, url, state, threads: [], isReviewed: false, hasNotes, isDraft,
})
const call = ({ startedAt, state }: { startedAt: number; state: AgentCall['state'] }): AgentCall =>
  ({ id: `call-${startedAt}`, agent: 'cops:pr-sidekick', isLeak: false, startedAt, state })
const describe_ = ({ runs, calls = [], turnEndedAt, v = view(), now = 0 }: { runs: SkillRun[]; calls?: AgentCall[]; turnEndedAt?: number | null; v?: Threads; now?: number }): ReturnType<typeof describeChain> =>
  describeChain({ runs, calls, view: v, turnEndedAt, now })

describe('describeChain', () => {
  test('exports the stages in the order autopilot.md runs them', () => {
    expect(AUTOPILOT_STAGES).toEqual(['cops:pr-review', 'cops:pr-address', 'cops:pr-wrap-up', 'cops:pr-note'])
  })

  test('no autopilot run gives no strip', () => {
    expect(describe_({ runs: [] })).toBeUndefined()
    expect(describe_({ runs: [skill({ name: 'cops:pr-start', args: 'plain task', at: 1 }), skill({ name: 'cops:pr-review', args: URL, at: 2 })] })).toBeUndefined()
  })

  test('each stage reads running while it is the latest, done after', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 }), stage({ name: 'address', at: 3 }), stage({ name: 'wrap-up', at: 4 })]
    // Frame 2 of the spinner.
    const chain = describe_({ runs, now: 200 })
    expect(chain?.line).toBe('Autopilot · PR #81 · fix → review ✓ → address ✓ → wrap-up ⠹ → note · → ready ·')
    expect(chain?.status).toBe('running')
    expect(describe_({ runs: [start({ at: 1 })] })?.line).toBe('Autopilot · fix ⠋ → review · → address · → wrap-up · → note · → ready ?')
    expect(describe_({ runs: [...runs, stage({ name: 'note', at: 5 })] })?.line).toContain('wrap-up ✓ → note ⠋')
  })

  test('the card has a row per step, with a state each', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 }), stage({ name: 'address', at: 3 }), stage({ name: 'wrap-up', at: 4 })]
    const chain = describe_({ runs, now: 200 })
    expect(chain?.title).toBe('Autopilot · PR #81')
    expect(chain?.steps.map(one => `${one.mark} ${one.name}:${one.state}`)).toEqual([
      '✓ fix:done', '✓ review:done', '✓ address:done', '⠹ wrap-up:active', '· note:pending', '· ready:pending',
    ])
    const stopped = describe_({ runs: runs.slice(0, 2), turnEndedAt: 3 })
    expect(stopped?.stoppedAt).toBe('review')
    expect(stopped?.steps.find(one => one.name === 'review')?.state).toBe('stopped')
  })

  test('a turn ending after review reads stopped at review and fills the stage', () => {
    const chain = describe_({ runs: [start({ at: 1 }), stage({ name: 'review', at: 2 })], turnEndedAt: 3 })
    expect(chain?.line).toContain('review ■')
    expect(chain?.line).toContain('stopped at review')
    expect(chain?.status).toBe('stopped')
    expect(chain?.pickUp).toBe(`/cops:pr-review ${URL} `)
  })

  test('a turn ended before the stage began does not stop it', () => {
    expect(describe_({ runs: [start({ at: 5 }), stage({ name: 'review', at: 6 })], turnEndedAt: 4 })?.status).toBe('running')
  })

  test('a turn ending while a subagent call runs does not stop the stage until the call is done', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 3 })]
    for (const state of ['running', 'background'] as const) {
      expect(describe_({ runs, calls: [call({ startedAt: 4, state })], turnEndedAt: 5 })?.status).toBe('running')
    }
    expect(describe_({ runs, calls: [call({ startedAt: 4, state: 'done' })], turnEndedAt: 5 })?.status).toBe('stopped')
    expect(describe_({ runs, calls: [call({ startedAt: 2, state: 'running' })], turnEndedAt: 5 })?.status).toBe('stopped')
  })

  test('a stop in the fix stage has no button', () => {
    const chain = describe_({ runs: [start({ at: 1 })], turnEndedAt: 2 })
    expect(chain?.line).toContain('stopped at fix')
    expect(chain?.pickUp).toBeUndefined()
  })

  test('a later plain cops run on that PR clears the stop', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 }), skill({ name: 'cops:pr-address', args: URL, at: 4 })]
    const chain = describe_({ runs, turnEndedAt: 3 })
    expect(chain?.status).toBe('resumed')
    expect(chain?.line).not.toContain('stopped')
    expect(chain?.pickUp).toBeUndefined()
    expect(chain?.ownsNext).toBe(false)
    expect(describe_({ runs: [...runs, skill({ name: 'cops:pr-wrap-up', args: URL, at: 6 })], turnEndedAt: 7 })?.status).toBe('resumed')
  })

  test('a plain run on another PR does not clear the stop', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 }), skill({ name: 'cops:pr-address', args: 'https://github.com/o/r/pull/9', at: 4 })]
    expect(describe_({ runs, turnEndedAt: 5 })?.status).toBe('stopped')
  })

  test('an out-of-order stage is flagged', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 }), stage({ name: 'wrap-up', at: 3 }), stage({ name: 'address', at: 4 })]
    expect(describe_({ runs })?.warnings).toEqual(['⚑ ran wrap-up before address'])
  })

  test('a skipped stage is flagged', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 }), stage({ name: 'wrap-up', at: 3 })]
    expect(describe_({ runs })?.warnings).toEqual(['⚑ skipped address'])
    expect(describe_({ runs: runs.slice(0, 2) })?.warnings).toEqual([])
  })

  test('all stages done but still a draft reads finished with no Pick up', () => {
    const runs = [start({ at: 1 }), ...['review', 'address', 'wrap-up', 'note'].map((name, at) => stage({ name, at: at + 2 }))]
    const chain = describe_({ runs, turnEndedAt: 7, v: view({ hasNotes: true }) })
    expect(chain?.status).toBe('finished')
    expect(chain?.line).toBe('Autopilot · PR #81 · fix → review ✓ → address ✓ → wrap-up ✓ → note ✓ → ready · · finished, still a draft')
    expect(chain?.line).not.toContain('stopped')
    expect(chain?.stoppedAt).toBeUndefined()
    expect(chain?.steps.map(one => `${one.mark} ${one.name}:${one.state}`)).toEqual([
      '✓ fix:done', '✓ review:done', '✓ address:done', '✓ wrap-up:done', '✓ note:done', '· ready:pending',
    ])
    expect(chain?.pickUp).toBeUndefined()
    expect(chain?.ownsNext).toBe(true)
  })

  test('all stages done with the view on another PR still reads stopped at finish', () => {
    const runs = [start({ at: 1 }), ...['review', 'address', 'wrap-up', 'note'].map((name, at) => stage({ name, at: at + 2 }))]
    const chain = describe_({ runs, turnEndedAt: 7, v: view({ hasNotes: true, url: 'https://github.com/o/r/pull/9' }) })
    expect(chain?.status).toBe('stopped')
    expect(chain?.line).toContain('stopped at finish')
    expect(chain?.pickUp).toBeUndefined()
  })

  test('all stages done with no notes posted reads finished', () => {
    const runs = [start({ at: 1 }), ...['review', 'address', 'wrap-up', 'note'].map((name, at) => stage({ name, at: at + 2 }))]
    const chain = describe_({ runs, turnEndedAt: 7, v: view({ hasNotes: false }) })
    expect(chain?.status).toBe('finished')
    expect(chain?.pickUp).toBeUndefined()
  })

  test('address skipped with the other stages done reads finished', () => {
    const runs = [start({ at: 1 }), ...['review', 'wrap-up', 'note'].map((name, at) => stage({ name, at: at + 2 }))]
    const chain = describe_({ runs, turnEndedAt: 6, v: view({ hasNotes: true }) })
    expect(chain?.status).toBe('finished')
    expect(chain?.warnings).toEqual(['⚑ skipped address'])
  })

  test('all stages done on a closed PR with no notes posted reads stopped at note and fills the stage', () => {
    const runs = [start({ at: 1 }), ...['review', 'address', 'wrap-up', 'note'].map((name, at) => stage({ name, at: at + 2 }))]
    const chain = describe_({ runs, turnEndedAt: 7, v: view({ state: 'CLOSED' }) })
    expect(chain?.status).not.toBe('finished')
    expect(chain?.line).toContain('note ■')
    expect(chain?.line).toContain('stopped at note')
    expect(chain?.pickUp).toBe(`/cops:pr-note ${URL} `)
  })

  test('a stop leaves the Next slot once the view is another PR', () => {
    const runs = [start({ at: 1 }), ...['review', 'address', 'wrap-up', 'note'].map((name, at) => stage({ name, at: at + 2 }))]
    const chain = describe_({ runs, turnEndedAt: 7, v: view({ url: 'https://github.com/o/r/pull/9' }) })
    expect(chain?.status).toBe('stopped')
    expect(chain?.ownsNext).toBe(false)
  })

  test('the PR going ready finishes the chain', () => {
    const runs = [start({ at: 1 }), ...['review', 'address', 'wrap-up', 'note'].map((name, at) => stage({ name, at: at + 2 }))]
    const chain = describe_({ runs, turnEndedAt: 7, v: view({ isDraft: false }) })
    expect(chain?.line).toBe('Autopilot · PR #81 · fix → review ✓ → address ✓ → wrap-up ✓ → note ✓ → ready ✓')
    expect(chain?.status).toBe('ready')
    expect(chain?.ownsNext).toBe(false)
  })

  test('a view of another PR reads unknown', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 })]
    const chain = describe_({ runs, v: view({ isDraft: false, url: 'https://github.com/o/r/pull/9' }) })
    expect(chain?.line).toContain('ready ?')
    expect(chain?.status).toBe('running')
    expect(describe_({ runs, v: { status: 'no-pr' } })?.line).toContain('ready ?')
  })

  test('the strip owns the Next slot while running or stopped', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 })]
    expect(describe_({ runs })?.ownsNext).toBe(true)
    expect(describe_({ runs, turnEndedAt: 3 })?.ownsNext).toBe(true)
  })

  test('with several chains it describes the latest PR', () => {
    const other = 'https://github.com/o/r/pull/5'
    const runs = [
      start({ at: 1 }), skill({ name: 'cops:pr-review', args: `${other} - autopilot stage of this pr-start run`, at: 2 }),
      start({ at: 3 }), stage({ name: 'review', at: 4 }),
    ]
    expect(describe_({ runs })?.line).toContain('PR #81 · fix → review ⠋ → address ·')
  })

  test('a second autopilot run shows from its fix stage', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 }), start({ at: 3 })]
    const chain = describe_({ runs })
    expect(chain?.line).toBe('Autopilot · fix ⠋ → review · → address · → wrap-up · → note · → ready ?')
    expect(describe_({ runs, turnEndedAt: 4 })?.line).toContain('stopped at fix')
  })
})
