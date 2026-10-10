import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { RuleUsage } from '../types'
import { MEMORY_LIMIT } from './status-line.ts'
import { countUses, describeRules, describeUse, hashRule, matchEntries, normalize, parseEntries, parseReply, toRuleUsage } from './rule-usage.ts'

const DAY = 86_400_000
const NOW = 100 * DAY
const MEMORY_ON = 'COPS memory root: /memory\nCOPS memory login: octocat\n'
const MEMORY_OFF = 'COPS memory not configured: PR_MEMORY_PATH is unset, so pr-oracle runs without memory.\n'
const MEMORY = { options: { memory_path: '~/mem', memory_login: 'octocat' } }
const PERSONAL = '/memory/memory/users/octocat/MEMORY.md'
const TEAM = '/memory/memory/team/MEMORY.md'
const FILES = {
  [PERSONAL]: '# Memory\n\n## Code\n- Prefer early returns  (stated by user 2x)\n- Use `run()` (not `exec()`) for commands  (seen 2x)\n',
  [TEAM]: '## Team\n- Keep tests beside the code  (stated by user)\n',
}

type Ui = Awaited<ReturnType<Engine['ui']['mount']>>

// Answers what the plugin asks of the engine from `files` and `stored`, gives each pr-oracle call the reply
// `replies` names for its prompt, and records the prompt fills.
const world = ({ on, memory = MEMORY_ON, files = FILES, replies = {}, stored = {} }: {
  on: On; memory?: string; files?: Record<string, string>; replies?: Record<string, string>; stored?: Record<string, unknown>
}): { fills: string[]; clock: ReturnType<typeof mock.clock> } => {
  const ok = ({ stdout }: { stdout: string }): ProcessRunResult => ({
    exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false,
  })
  const fills: string[] = []
  const clock = mock.clock(on, { now: NOW })
  on('store.get', ($, e) => ({ value: stored[e.key] }))
  on('store.set', ($, e) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  on('fs.read', ($, e) => {
    const text = files[e.path]
    if (text === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }
    return { value: text }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', ($, e) => ({
    value: e.argv[0] === 'bash' ? ok({ stdout: memory }) : { ...ok({ stdout: '' }), exitCode: 128, stderr: 'fatal: not a git repository' },
  }))
  on('prompt.fill', ($, e) => {
    fills.push(e.text)
    return { isFilled: true }
  })
  on('tool.call', { tool: 'Agent' }, ($, e) => ({
    result: {
      status: 'completed', agentId: 'a1', content: [], totalToolUseCount: 1, totalDurationMs: 1000, totalTokens: 100, prompt: e.prompt,
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
    },
    text: replies[e.prompt] ?? '',
  }))
  return { fills, clock }
}

const oracle = async ({ $, mode }: { $: Engine; mode: string }): Promise<void> => {
  await $.tool.call({ tool: 'Agent', description: mode, subagent_type: 'cops:pr-oracle', prompt: `mode: ${mode}` })
}

const mount = async ({ $ }: { $: Engine }): Promise<Ui> => {
  await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
  return $.ui.mount({
    plugin: 'cops', surface: 'terminal', component: 'Pane', requestId: 'cops-hq',
    props: { title: 'COPS HQ', isFocused: true, bodyColumns: 200, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
}

const text = async ({ ui }: { ui: Ui }): Promise<string> => (await ui.find({ type: 'Box' }))?.text ?? ''

// Background redraws settle over a few turns of the event loop.
const until = async ({ check }: { check: () => Promise<boolean> }): Promise<void> => {
  for (let tries = 0; tries < 3000; tries++) {
    if (await check()) {
      return
    }
  }
  throw new Error('never happened')
}

const used = ({ stored, rule }: { stored: Record<string, unknown>; rule: string }): RuleUsage | undefined =>
  toRuleUsage({ stored: stored.ruleUsage })[hashRule({ text: rule })]

describe('rule usage counting', () => {
  test('a brief-task reply counts each matching rule once, and ignores the rest', MEMORY, async ($, on) => {
    const stored: Record<string, unknown> = {}
    world({
      on,
      stored,
      replies: {
        'mode: brief-task': [
          '- prefer early returns.  (stated by user 2x, from you)',
          '- Prefer early returns  (stated by user 2x, from you)',
          '- name tests after behavior  (seen 2x, from you)',
          'caller only:',
          '- Use `run()` (not `exec()`) for commands  (seen 2x, from you)',
        ].join('\n'),
      },
    })
    await oracle({ $, mode: 'brief-task' })
    expect(used({ stored, rule: 'Prefer early returns' })).toEqual({ count: 1, firstSeen: NOW, lastSeen: NOW, recent: [NOW] })
    expect(used({ stored, rule: 'Use `run()` (not `exec()`) for commands' })?.count).toBe(1)
    expect(Object.keys(toRuleUsage({ stored: stored.ruleUsage }))).toHaveLength(2)
  })

  test('a for: pr-sidekick brief-task reply counts nothing', MEMORY, async ($, on) => {
    const stored: Record<string, unknown> = {}
    const prompt = 'mode: brief-task\nfor: pr-sidekick'
    world({ on, stored, replies: { [prompt]: '- prefer early returns  (stated by user 2x, from you)\ncaller only:\n- Use `run()` (not `exec()`) for commands  (seen 2x, from you)' } })
    await $.tool.call({ tool: 'Agent', description: 'brief', subagent_type: 'cops:pr-oracle', prompt })
    expect(stored.ruleUsage).toBeUndefined()
  })

  test('a sweep-diff flag counts its rule, team rules included', MEMORY, async ($, on) => {
    const stored: Record<string, unknown> = { ruleUsage: { [hashRule({ text: 'Keep tests beside the code' })]: { count: 2, firstSeen: DAY, lastSeen: 2 * DAY, recent: [DAY, 2 * DAY] } } }
    world({ on, stored, replies: { 'mode: sweep-diff': '- a.test.ts:1  test in a separate folder  — rule: keep tests beside the code (stated by user, from team)' } })
    await oracle({ $, mode: 'sweep-diff' })
    expect(used({ stored, rule: 'Keep tests beside the code' })).toEqual({ count: 3, firstSeen: DAY, lastSeen: NOW, recent: [DAY, 2 * DAY, NOW] })
  })

  test('counts nothing for unmatched text, no relevant memory, clean, or other modes', MEMORY, async ($, on) => {
    const stored: Record<string, unknown> = {}
    world({
      on,
      stored,
      replies: {
        'mode: brief-task': 'no relevant memory',
        'mode: sweep-diff': 'clean',
        'mode: review-pr': '- prefer early returns  (stated by user 2x, from you)',
        'mode: scout-repo': '- squash before merging  (seen 2x, from you)',
      },
    })
    for (const mode of ['brief-task', 'sweep-diff', 'review-pr', 'scout-repo']) await oracle({ $, mode })
    expect(stored.ruleUsage).toBeUndefined()
  })

  test('counts nothing while memory is off', MEMORY, async ($, on) => {
    const stored: Record<string, unknown> = {}
    world({ on, stored, memory: MEMORY_OFF, replies: { 'mode: brief-task': '- prefer early returns  (stated by user 2x, from you)' } })
    await oracle({ $, mode: 'brief-task' })
    expect(stored.ruleUsage).toBeUndefined()
  })
})

describe('Rules tab', () => {
  test('lists a rule last seen 30+ days ago as stale, with a Prune button that fills the prompt', MEMORY, async ($, on) => {
    const stored = {
      ruleUsage: {
        [hashRule({ text: 'Prefer early returns' })]: { count: 4, firstSeen: DAY, lastSeen: NOW - 31 * DAY, recent: [NOW - 31 * DAY] },
        [hashRule({ text: 'Keep tests beside the code' })]: { count: 1, firstSeen: NOW, lastSeen: NOW, recent: [NOW] },
        [hashRule({ text: 'Use `run()` (not `exec()`) for commands' })]: { count: 5, firstSeen: NOW, lastSeen: NOW, recent: [NOW, NOW, NOW, NOW, NOW] },
      },
    }
    const { fills } = world({ on, stored })
    const ui = await mount({ $ })
    await until({ check: async () => (await ui.find({ key: 'tab-rules' })) !== undefined })
    await ui.press({ key: 'tab-rules' })
    await until({ check: async () => (await text({ ui })).includes('Stale rules (1)') })
    const drawn = await text({ ui })
    expect(drawn).toContain('Prefer early returns · 4× · last seen 31d ago')
    expect(drawn).toContain('Often fired (1)')
    expect(drawn).toContain('Use `run()` (not `exec()`) for commands · 5 in 30d · 5× · last seen today')
    expect(drawn).not.toContain('Keep tests beside the code')
    expect(drawn).not.toContain('Threads:')
    await ui.press({ key: 'prune-0' })
    expect(fills).toEqual(['Use learn-feedback to prune this remembered rule: Prefer early returns'])
    await ui.press({ key: 'tab-hq' })
    await until({ check: async () => (await text({ ui })).includes('Threads:') })
    await ui.unmount()
  })

  test('a stale team rule is pruned with a record-team: prompt', MEMORY, async ($, on) => {
    const { fills } = world({ on })
    const ui = await mount({ $ })
    await until({ check: async () => (await ui.find({ key: 'tab-rules' })) !== undefined })
    await ui.press({ key: 'tab-rules' })
    await until({ check: async () => (await text({ ui })).includes('Stale rules (3)') })
    await ui.press({ key: 'prune-2' })
    expect(fills).toEqual(['record-team: Use learn-feedback to prune this remembered rule: Keep tests beside the code'])
    await ui.unmount()
  })

  test('a rule goes stale once the clock passes 30 days since it was last seen', MEMORY, async ($, on) => {
    // Seen 2 minutes short of 30 days ago, so one refresh tips it over.
    const seen = NOW - 30 * DAY + 120_000
    const stored = { ruleUsage: { [hashRule({ text: 'Prefer early returns' })]: { count: 1, firstSeen: seen, lastSeen: seen, recent: [seen] } } }
    const { clock } = world({ on, stored, files: { [PERSONAL]: '## Code\n- Prefer early returns  (stated by user 2x)\n' } })
    const ui = await mount({ $ })
    await until({ check: async () => (await ui.find({ key: 'tab-rules' })) !== undefined })
    await ui.press({ key: 'tab-rules' })
    await until({ check: async () => (await text({ ui })).includes('Stale rules (0)') })
    await clock.advance(120_000)
    await until({ check: async () => (await text({ ui })).includes('Stale rules (1)') })
    expect(await text({ ui })).toContain('Prefer early returns · 1× · last seen 30d ago')
    await ui.unmount()
  })

  test('shows no tabs while memory is off', MEMORY, async ($, on) => {
    world({ on, memory: MEMORY_OFF })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('Threads:') })
    expect(await ui.find({ key: 'tab-rules' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('parseEntries', () => {
  test('reads top-level bullets under ## headings, without their evidence', () => {
    expect(parseEntries({ text: '# Memory\n- loose\n## Code\n- prefer early returns  (stated by user 2x)\n  - detail\n- cite (a) and (b) (seen 2x)\n' }))
      .toEqual(['prefer early returns', 'cite (a) and (b)'])
  })

  test('reads only the first MEMORY_LIMIT lines', () => {
    const lines = ['## Code', ...Array.from({ length: MEMORY_LIMIT + 5 }, (_, index) => `- rule ${index + 1}`)]
    const rules = parseEntries({ text: lines.join('\n') })
    expect(rules).toHaveLength(MEMORY_LIMIT - 1)
    expect(rules.at(-1)).toBe(`rule ${MEMORY_LIMIT - 1}`)
  })
})

describe('parseReply', () => {
  test('reads brief bullets, caller-only bullets and sweep flags', () => {
    expect(parseReply({ text: '- prefer early returns  (stated by user 2x, from you)\ncaller only:\n- ask before pushing  (seen 2x, from team)' }))
      .toEqual(['prefer early returns', 'ask before pushing'])
    expect(parseReply({ text: '- a.ts:3  nested ifs  — rule: use `x()` (not `y`) (stated by user 2x, from you)' })).toEqual(['use `x()` (not `y`)'])
    expect(parseReply({ text: 'no relevant memory' })).toEqual([])
    expect(parseReply({ text: 'clean' })).toEqual([])
  })
})

describe('matching', () => {
  test('normalizes case, whitespace and trailing punctuation', () => {
    expect(normalize({ text: '  Prefer   early returns. ' })).toBe('prefer early returns')
    expect(hashRule({ text: 'Prefer early returns.' })).toBe(hashRule({ text: 'prefer  early returns' }))
    expect(hashRule({ text: 'prefer early returns' })).not.toBe(hashRule({ text: 'use pnpm' }))
  })

  test('matches equal text or a prefix either way, each entry once', () => {
    const entries = ['Prefer early returns', 'Keep tests beside the code', 'prefer early returns.']
    expect(matchEntries({ entries, cited: ['prefer early returns, always', 'PREFER EARLY RETURNS'] })).toEqual(['Prefer early returns'])
    expect(matchEntries({ entries, cited: ['keep tests'] })).toEqual(['Keep tests beside the code'])
    expect(matchEntries({ entries, cited: ['use pnpm', ''] })).toEqual([])
  })
})

describe('usage', () => {
  test('counts uses, keeping the latest 10 times', () => {
    const once = countUses({ usage: {}, keys: ['k'], now: 5 })
    expect(once).toEqual({ k: { count: 1, firstSeen: 5, lastSeen: 5, recent: [5] } })
    const many = Array.from({ length: 11 }, (_, at) => at + 6).reduce((usage, now) => countUses({ usage, keys: ['k'], now }), once)
    expect(many.k).toEqual({ count: 12, firstSeen: 5, lastSeen: 16, recent: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16] })
  })

  test('drops stored values that are not usage', () => {
    expect(toRuleUsage({ stored: { a: { count: 1, firstSeen: 1, lastSeen: 1, recent: [1] }, b: { count: 'x' }, c: null } })).toEqual({ a: { count: 1, firstSeen: 1, lastSeen: 1, recent: [1] } })
    expect(toRuleUsage({ stored: ['junk'] })).toEqual({})
  })

  test('sorts rules into stale and often', () => {
    const usage = {
      [hashRule({ text: 'a' })]: { count: 9, firstSeen: 0, lastSeen: NOW - 30 * DAY, recent: [NOW - 30 * DAY] },
      [hashRule({ text: 'b' })]: { count: 6, firstSeen: 0, lastSeen: NOW, recent: [NOW - 31 * DAY, NOW - DAY, NOW - DAY, NOW, NOW, NOW] },
      [hashRule({ text: 'c' })]: { count: 4, firstSeen: 0, lastSeen: NOW, recent: [NOW, NOW, NOW, NOW] },
    }
    const { stale, often } = describeRules({ entries: ['a', 'b', 'c', 'd', 'D.'], usage, now: NOW })
    expect(stale.map(row => row.rule)).toEqual(['a', 'd'])
    expect(often.map(row => [row.rule, row.recentUses])).toEqual([['b', 5]])
  })

  test('describes a rule\'s use', () => {
    expect(describeUse({ now: NOW })).toBe('never seen')
    expect(describeUse({ use: { count: 3, firstSeen: 0, lastSeen: NOW - 1000, recent: [] }, now: NOW })).toBe('3× · last seen today')
    expect(describeUse({ use: { count: 1, firstSeen: 0, lastSeen: NOW - 31 * DAY, recent: [] }, now: NOW })).toBe('1× · last seen 31d ago')
  })
})
