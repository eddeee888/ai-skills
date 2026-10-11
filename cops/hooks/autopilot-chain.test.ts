import { describe, expect, test } from 'claude-code/testing'
import type { SkillRun, Threads } from '../types'
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
const view = ({ isDraft = true, url = URL }: { isDraft?: boolean; url?: string } = {}): Threads => ({
  status: 'ready', pr: 81, url, state: 'OPEN', threads: [], isReviewed: false, hasNotes: false, isDraft,
})
const describe_ = ({ runs, turnEndedAt, v = view(), now = 0 }: { runs: SkillRun[]; turnEndedAt?: number | null; v?: Threads; now?: number }): ReturnType<typeof describeChain> =>
  describeChain({ runs, calls: [], view: v, turnEndedAt, now })

describe('describeChain', () => {
  test('exports the stages in the order autopilot.md runs them', () => {
    expect(AUTOPILOT_STAGES).toEqual(['cops:pr-review', 'cops:pr-address', 'cops:pr-sync', 'cops:pr-note'])
  })

  test('no autopilot run gives no strip', () => {
    expect(describe_({ runs: [] })).toBeUndefined()
    expect(describe_({ runs: [skill({ name: 'cops:pr-start', args: 'plain task', at: 1 }), skill({ name: 'cops:pr-review', args: URL, at: 2 })] })).toBeUndefined()
  })

  test('each stage reads running while it is the latest, done after', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 }), stage({ name: 'address', at: 3 }), stage({ name: 'sync', at: 4 })]
    // Frame 2 of the spinner.
    const chain = describe_({ runs, now: 200 })
    expect(chain?.line).toBe('Autopilot · PR #81 · fix → review ✓ → address ✓ → sync ⠹ → note · → ready ·')
    expect(chain?.status).toBe('running')
    expect(describe_({ runs: [start({ at: 1 })] })?.line).toBe('Autopilot · fix ⠋ → review · → address · → sync · → note · → ready ?')
    expect(describe_({ runs: [...runs, stage({ name: 'note', at: 5 })] })?.line).toContain('sync ✓ → note ⠋')
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
    expect(describe_({ runs: [...runs, skill({ name: 'cops:pr-sync', args: URL, at: 6 })], turnEndedAt: 7 })?.status).toBe('resumed')
  })

  test('a plain run on another PR does not clear the stop', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 }), skill({ name: 'cops:pr-address', args: 'https://github.com/o/r/pull/9', at: 4 })]
    expect(describe_({ runs, turnEndedAt: 5 })?.status).toBe('stopped')
  })

  test('an out-of-order stage is flagged', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 }), stage({ name: 'sync', at: 3 }), stage({ name: 'address', at: 4 })]
    expect(describe_({ runs })?.warnings).toEqual(['⚑ ran sync before address'])
  })

  test('a skipped stage is flagged', () => {
    const runs = [start({ at: 1 }), stage({ name: 'review', at: 2 }), stage({ name: 'sync', at: 3 })]
    expect(describe_({ runs })?.warnings).toEqual(['⚑ skipped address'])
    expect(describe_({ runs: runs.slice(0, 2) })?.warnings).toEqual([])
  })

  test('all stages done but still a draft reads stopped at finish with no button', () => {
    const runs = [start({ at: 1 }), ...['review', 'address', 'sync', 'note'].map((name, at) => stage({ name, at: at + 2 }))]
    const chain = describe_({ runs, turnEndedAt: 7 })
    expect(chain?.line).toContain('note ✓ → ready ·')
    expect(chain?.line).toContain('stopped at finish')
    expect(chain?.pickUp).toBeUndefined()
    expect(chain?.ownsNext).toBe(true)
  })

  test('the PR going ready finishes the chain', () => {
    const runs = [start({ at: 1 }), ...['review', 'address', 'sync', 'note'].map((name, at) => stage({ name, at: at + 2 }))]
    const chain = describe_({ runs, turnEndedAt: 7, v: view({ isDraft: false }) })
    expect(chain?.line).toBe('Autopilot · PR #81 · fix → review ✓ → address ✓ → sync ✓ → note ✓ → ready ✓')
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
})
