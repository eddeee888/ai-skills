import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import { addUsage, describeUsage, keyCall, toUsage } from './usage-stats.ts'

const DAY = 86_400_000
const NOW = 100 * DAY
const MEMORY_ON = 'COPS memory root: /memory\nCOPS memory login: octocat\n'
const MEMORY_OFF = 'COPS memory not configured: PR_MEMORY_PATH is unset, so pr-oracle runs without memory.\n'
const MEMORY = { options: { memory_path: '~/mem', memory_login: 'octocat' } }
const PERSONAL = '/memory/memory/users/octocat/MEMORY.md'
const TEAM = '/memory/memory/team/MEMORY.md'
const FILES = { [PERSONAL]: '## Code\n- Prefer early returns  (stated by user 2x)\n', [TEAM]: '## Team\n- Keep tests beside the code  (stated by user)\n' }

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
  on('skill.prompt', ($, e) => ({ text: e.text }))
  // A prompt of `fail` throws; `background` launches the agent without waiting; `unfinished` returns without a token count.
  on('tool.call', { tool: 'Agent' }, ($, e) => {
    if (e.prompt === 'fail') {
      throw new Error('boom')
    }
    if (e.prompt === 'background') {
      return { result: { status: 'async_launched', agentId: 'b1', description: 'x', prompt: 'x' }, text: '' }
    }
    if (e.prompt === 'unfinished') {
      // The kit's Agent result type has no finished-but-not-completed shape, so the cast builds one.
      return { result: { status: 'error' }, text: '' } as never
    }
    return {
    result: {
      status: 'completed', agentId: 'a1', content: [], totalToolUseCount: 1, totalDurationMs: 1000, totalTokens: 100, prompt: e.prompt,
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
    },
    text: replies[e.prompt] ?? '',
    }
  })
  return { fills, clock }
}

const oracle = async ({ $, mode, model }: { $: Engine; mode: string; model?: string }): Promise<void> => {
  await $.tool.call({ tool: 'Agent', description: mode, subagent_type: 'cops:pr-oracle', prompt: `mode: ${mode}`, ...(model && { model }) })
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

const stats = async ({ $, ui }: { $: Engine; ui: Ui }): Promise<void> => {
  await until({ check: async () => (await ui.find({ key: 'tab-stats' })) !== undefined })
  await ui.press({ key: 'tab-stats' })
  await until({ check: async () => (await text({ ui })).includes('Usage') })
}

describe('recording usage', () => {
  test('a finished oracle call is stored under its modes, split by model', MEMORY, async ($, on) => {
    const stored: Record<string, unknown> = {}
    world({ on, stored })
    await $.tool.call({ tool: 'Agent', description: 'x', subagent_type: 'cops:pr-oracle', prompt: 'mode: scout-repo + brief-task', model: 'sonnet' })
    await oracle({ $, mode: 'sweep-diff' })
    const usage = toUsage({ stored: stored.usage })
    expect(usage?.since).toBe(NOW)
    expect(usage?.keys['scout-repo + brief-task']).toEqual({
      calls: 1, durationMs: 1000, tokens: 100, models: { sonnet: { calls: 1, durationMs: 1000, tokens: 100 } },
    })
    expect(usage?.keys['sweep-diff']?.models).toEqual({ inherit: { calls: 1, durationMs: 1000, tokens: 100 } })
  })

  test('calls, time and tokens add up per mode and per model', MEMORY, async ($, on) => {
    const stored: Record<string, unknown> = {}
    world({ on, stored })
    await oracle({ $, mode: 'sweep-diff', model: 'sonnet' })
    await oracle({ $, mode: 'sweep-diff', model: 'opus' })
    await oracle({ $, mode: 'sweep-diff', model: 'opus' })
    expect(toUsage({ stored: stored.usage })?.keys['sweep-diff']).toEqual({
      calls: 3, durationMs: 3000, tokens: 300,
      models: { sonnet: { calls: 1, durationMs: 1000, tokens: 100 }, opus: { calls: 2, durationMs: 2000, tokens: 200 } },
    })
  })

  test('a pr-sidekick call is stored under the running skill\'s handoff label, else pr-sidekick', MEMORY, async ($, on) => {
    const stored: Record<string, unknown> = {}
    world({ on, stored })
    await $.tool.call({ tool: 'Agent', description: 'x', subagent_type: 'cops:pr-sidekick', prompt: 'do it' })
    await $.skill.prompt({ skill: 'cops:pr-start', text: 'Start.' })
    await $.tool.call({ tool: 'Agent', description: 'x', subagent_type: 'cops:pr-sidekick', prompt: 'do it' })
    expect(Object.keys(toUsage({ stored: stored.usage })?.keys || {}).sort()).toEqual(['fix loop', 'pr-sidekick'])
  })

  test('two calls finishing together are both stored', MEMORY, async ($, on) => {
    const stored: Record<string, unknown> = {}
    world({ on, stored })
    await Promise.all([oracle({ $, mode: 'sweep-diff' }), oracle({ $, mode: 'sweep-diff' })])
    expect(toUsage({ stored: stored.usage })?.keys['sweep-diff']).toMatchObject({ calls: 2, durationMs: 2000, tokens: 200 })
  })

  test('a finished call without a token count adds nothing', MEMORY, async ($, on) => {
    const stored: Record<string, unknown> = {}
    world({ on, stored })
    await $.tool.call({ tool: 'Agent', description: 'x', subagent_type: 'cops:pr-oracle', prompt: 'unfinished' })
    expect(stored.usage).toBeUndefined()
  })

  test('totals survive a new session', MEMORY, async ($, on) => {
    const stored = { usage: addUsage({ usage: undefined, key: 'sweep-diff', model: 'inherit', durationMs: 500, tokens: 50, now: DAY }) }
    world({ on, stored })
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    await oracle({ $, mode: 'sweep-diff' })
    const usage = toUsage({ stored: stored.usage })
    expect(usage?.since).toBe(DAY)
    expect(usage?.keys['sweep-diff']).toMatchObject({ calls: 2, durationMs: 1500, tokens: 150 })
  })

  test('a failed or background call, and a non-cops agent, are not counted', MEMORY, async ($, on) => {
    const stored: Record<string, unknown> = {}
    world({ on, stored })
    await $.tool.call({ tool: 'Agent', description: 'x', subagent_type: 'cops:pr-oracle', prompt: 'fail' }).catch(() => undefined)
    await $.tool.call({ tool: 'Agent', description: 'x', subagent_type: 'cops:pr-oracle', prompt: 'background' })
    await $.tool.call({ tool: 'Agent', description: 'x', subagent_type: 'Explore', prompt: 'look' })
    expect(stored.usage).toBeUndefined()
  })
})

describe('Stats tab', () => {
  test('draws a Usage section with a row per mode or job, most tokens first', MEMORY, async ($, on) => {
    const usage = {
      since: 50 * DAY,
      keys: {
        'sweep-diff': { calls: 1, durationMs: 65_000, tokens: 800, models: { inherit: { calls: 1, durationMs: 65_000, tokens: 800 } } },
        'fix loop': { calls: 2, durationMs: 90_000, tokens: 3000, models: { sonnet: { calls: 2, durationMs: 90_000, tokens: 3000 } } },
      },
    }
    world({ on, stored: { usage } })
    const ui = await mount({ $ })
    await stats({ $, ui })
    const drawn = await text({ ui })
    expect(drawn).toContain('since 1970-02-20')
    expect(drawn).toContain('fix loop · 2 calls · avg 45s · avg 1.5k tokens · sonnet')
    expect(drawn).toContain('sweep-diff · 1 call · avg 1m 5s · avg 800 tokens · inherit')
    expect(drawn.indexOf('fix loop')).toBeLessThan(drawn.indexOf('sweep-diff'))
    expect(drawn).not.toContain('Threads:')
    await ui.unmount()
  })

  test('says none when nothing is stored', MEMORY, async ($, on) => {
    world({ on })
    const ui = await mount({ $ })
    await stats({ $, ui })
    expect(await text({ ui })).toContain('none')
    await ui.unmount()
  })

  test('is hidden while memory is off', MEMORY, async ($, on) => {
    world({ on, memory: MEMORY_OFF })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('Threads:') })
    expect(await ui.find({ key: 'tab-stats' })).toBeUndefined()
    await ui.unmount()
  })

  test('Reset clears the stored usage at once and sets a new since date', MEMORY, async ($, on) => {
    const stored = {
      usage: addUsage({ usage: undefined, key: 'sweep-diff', model: 'inherit', durationMs: 500, tokens: 50, now: DAY }),
    }
    world({ on, stored })
    const ui = await mount({ $ })
    await stats({ $, ui })
    expect(await text({ ui })).toContain('sweep-diff · 1 call')
    expect(await text({ ui })).toContain('since 1970-01-02')
    await ui.press({ key: 'reset-usage' })
    await until({ check: async () => (await text({ ui })).includes('since 1970-04-11') })
    expect(await text({ ui })).toContain('none')
    expect(stored.usage).toEqual({ since: NOW, keys: {} })
    await ui.unmount()
  })
})

describe('usage-stats', () => {
  test('keys a call by its modes, or the job, falling back to the agent', () => {
    expect(keyCall({ agent: 'cops:pr-oracle', modes: ['scout-repo', 'brief-task'] })).toBe('scout-repo + brief-task')
    expect(keyCall({ agent: 'cops:pr-oracle' })).toBe('pr-oracle')
    expect(keyCall({ agent: 'cops:pr-sidekick', job: 'fix loop' })).toBe('fix loop')
    expect(keyCall({ agent: 'cops:pr-sidekick' })).toBe('pr-sidekick')
  })

  test('lists a key\'s models with the most tokens first', () => {
    let usage = addUsage({ usage: undefined, key: 'sweep-diff', model: 'sonnet', durationMs: 1000, tokens: 10, now: 5 })
    usage = addUsage({ usage, key: 'sweep-diff', model: 'opus', durationMs: 1000, tokens: 90, now: 6 })
    expect(describeUsage({ usage })[0]?.text).toEndWith(' · opus, sonnet')
  })

  test('drops stored keys and models that are not totals', () => {
    const totals = { calls: 1, durationMs: 1000, tokens: 10 }
    const usage = toUsage({ stored: { since: 5, keys: { a: 'junk', b: { ...totals, models: { sonnet: 'junk', opus: totals } } } } })
    expect(usage).toEqual({ since: 5, keys: { b: { ...totals, models: { opus: totals } } } })
  })

  test('describes no usage as no rows', () => {
    expect(describeUsage({ usage: undefined })).toEqual([])
    expect(toUsage({ stored: 'junk' })).toBeUndefined()
  })
})
