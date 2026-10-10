import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import { describeCall, describeOutcome, toThreads } from './pr-panel.ts'
import type { ThreadsResponse } from './pr-panel.ts'

const ok = (stdout: string): ProcessRunResult => ({
  exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false,
})
const failed = (stderr: string): ProcessRunResult => ({
  exitCode: 1, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false,
})

const node = (id: string, author: string, extra: { isResolved?: boolean; isOutdated?: boolean; body?: string; thumbs?: string[]; totalCount?: number; lastAuthor?: string } = {}) => {
  const { body = `${id} says hi\nmore`, thumbs = [], totalCount = 1, lastAuthor = author, ...rest } = extra
  const last = { author: { login: lastAuthor }, body: lastAuthor === author ? body : 'reply', url: `https://example.com/${id}` }
  return {
    id, isResolved: false, isOutdated: false, path: `src/${id}.ts`, line: 3, ...rest,
    comments: { totalCount, nodes: [last] },
    first: { nodes: [{ author: { login: author }, body, reactions: { nodes: thumbs.map(login => ({ user: { login } })) } }] },
  }
}

const RESPONSE: ThreadsResponse = {
  data: {
    repository: {
      pullRequest: {
        author: { login: 'octocat' },
        reviewThreads: {
          nodes: [
            node('t1', 'alice'),
            node('t2', 'octocat'),
            node('t3', 'alice', { isResolved: true }),
            node('t4', 'bob', { isOutdated: true }),
          ],
        },
      },
    },
  },
}

// Answers the commands the plugin runs: git, gh pr view, gh api graphql.
const world = (on: On, answers: { pr?: ProcessRunResult; graphql?: ProcessRunResult } = {}) => {
  const opens: string[] = []
  const commands: { name: string; immediate?: true }[] = []
  const clock = mock.clock(on)
  on('ui.open', ($, e) => {
    opens.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => {
    commands.push({ name: e.name, immediate: e.immediate })
    return { value: { command: e.name } }
  })
  on('ui.status', () => ({ value: undefined }))
  on('process.run', ($, e) => {
    if (e.argv[0] === 'bash') return { value: ok('COPS memory not configured.\n') }
    if (e.argv[0] === 'git') return { value: ok('feat\n') }
    if (e.argv[1] === 'api') return { value: answers.graphql ?? ok(JSON.stringify(RESPONSE)) }
    return { value: answers.pr ?? ok(JSON.stringify({ number: 7, url: 'https://github.com/o/r/pull/7' })) }
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }) as never)
  return { opens, commands, clock }
}

const start = ($: Engine) => $.session.start({ cwd: '/repo', surface: null, isInteractive: false })

const mount = ($: Engine, surface: 'terminal' | 'desktop') =>
  $.ui.mount({
    plugin: 'cops', surface, component: 'Pane', requestId: 'cops-hq',
    props: { title: 'COPS HQ', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })

// Background refreshes settle over a few turns of the event loop.
const until = async (check: () => Promise<boolean>) => {
  for (let tries = 0; tries < 3000; tries++) if (await check()) return
  throw new Error('never happened')
}

const text = async (ui: Awaited<ReturnType<typeof mount>>) => (await ui.find({ type: 'Box' }))?.text ?? ''

describe('threads', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`groups open threads by whose move it is (${surface})`, async ($, on) => {
      world(on)
      await start($)
      const ui = await mount($, surface)
      await until(async () => (await text(ui)).includes('PR #7'))
      const drawn = await text(ui)
      expect(drawn).toContain('Needs you (2)')
      expect(drawn).toContain('Waiting on reviewer (1)')
      expect(drawn).toContain('src/t1.ts:3 · alice: t1 says hi')
      expect(drawn).toContain('src/t4.ts:3 · bob: t4 says hi (outdated)')
      expect(drawn).not.toContain('t3')
      expect((await ui.find({ type: 'Link', text: 'PR #7' }))?.props.href).toBe('https://github.com/o/r/pull/7')
      expect((await ui.find({ type: 'Link', text: 'src/t1.ts:3' }))?.props.href).toBe('https://example.com/t1')
      expect((await ui.find({ type: 'Link', text: 'src/t2.ts:3' }))?.props.href).toBe('https://example.com/t2')
      await ui.unmount()
    })
  }

  test('marks a thread handled locally until a push', async ($, on) => {
    world(on)
    await start($)
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('PR #7'))
    await ui.press({ key: 'handled-t1' })
    await until(async () => (await text(ui)).includes('handled locally'))
    await $.tool.call({ tool: 'Bash', command: 'git push origin feat' })
    await until(async () => !(await text(ui)).includes('handled locally'))
    await ui.unmount()
  })

  test('says it needs gh when gh cannot answer', async ($, on) => {
    world(on, { pr: failed('gh: To get started with GitHub CLI, please run: gh auth login') })
    await start($)
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('needs gh'))
    await ui.unmount()
  })

  test('says when the branch has no PR', async ($, on) => {
    world(on, { pr: failed('no pull requests found for branch "feat"') })
    await start($)
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('this branch has no PR'))
    await ui.unmount()
  })
})

describe('agents', () => {
  test('shows each cops call with its mode, memory, result and tokens, and flags a leak', async ($, on) => {
    world(on)
    on('tool.call', { tool: 'Agent' }, ($, e) => ({
      result: {
        status: 'completed', agentId: 'a1', content: [], totalToolUseCount: 3, totalDurationMs: 3000, totalTokens: 12_400, prompt: e.prompt,
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
      },
      text: e.subagent_type === 'cops:pr-oracle' ? 'CHECKPOINT_FOUND abc1234def on repro/12' : 'changed: a.ts — x\ncommitted: 9f8e7d6c\ndeviations: renamed a helper',
    }))
    await start($)
    await $.tool.call({
      tool: 'Agent', description: 'brief', subagent_type: 'cops:pr-oracle',
      prompt: 'mode: brief-task\nmemory-root: /mem\nmemory-login: octocat\nTask: fix it',
    })
    await $.tool.call({
      tool: 'Agent', description: 'fix', subagent_type: 'cops:pr-sidekick',
      prompt: 'Fix it.\nRules that apply:\n- a\n- b\n- c\n- d\n- e\n- f\nmemory-root: /mem',
    })
    await $.tool.call({ tool: 'Agent', description: 'look', subagent_type: 'Explore', prompt: 'find things' })

    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Agents (2)'))
    const drawn = await text(ui)
    expect(drawn).toContain('✓ 🔮 Oracle · brief-task · 3s · 12k tokens · CHECKPOINT_FOUND abc1234')
    expect(drawn).not.toContain('login octocat')
    expect(drawn).toContain('✓ 🦸 Sidekick · 6 rules · 1 deviation · 3s · 12k tokens · committed 9f8e7d6')
    expect(drawn).toContain('pr-sidekick was given memory-root')
    expect(drawn).not.toContain('Explore')
    await ui.unmount()
  })

  test('spins while a call runs, then shows ✓ when done and ✗ when failed', async ($, on) => {
    const { clock } = world(on)
    on('tool.call', { tool: 'Agent' }, async ($, e) => {
      if (e.subagent_type === 'cops:pr-sidekick') {
        await clock.sleep(1000)
        return { deny: 'boom' }
      }
      await clock.sleep(2000)
      return {
        result: {
          status: 'completed', agentId: 'a1', content: [], totalToolUseCount: 1, totalDurationMs: 2000, totalTokens: 500, prompt: e.prompt,
          usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
        },
        text: 'all good',
      }
    })
    await start($)
    const ui = await mount($, 'terminal')
    void $.tool.call({ tool: 'Agent', description: 'brief', subagent_type: 'cops:pr-oracle', prompt: 'mode: brief-task' })
    void $.tool.call({ tool: 'Agent', description: 'fix', subagent_type: 'cops:pr-sidekick', prompt: 'Rules that apply: none' })
    await until(async () => (await text(ui)).includes('Agents (2)'))
    const frame = async (): Promise<string | undefined> => /([⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]) 🔮 Oracle · brief-task/.exec(await text(ui))?.[1]
    const first = await frame()
    expect(first).toBeDefined()
    await clock.advance(100)
    await until(async () => (await frame()) !== first)
    expect(await frame()).toBeDefined()
    await clock.advance(1000)
    await until(async () => (await text(ui)).includes('✗ 🦸 Sidekick · no rules · 1s · boom'))
    await clock.advance(1000)
    await until(async () => (await text(ui)).includes('✓ 🔮 Oracle · brief-task · 2s · 500 tokens · all good'))
    expect(await frame()).toBeUndefined()
    await ui.unmount()
  })

  test('shows ✗, not a spinner, when a lower hook throws for the call', async ($, on) => {
    world(on)
    on('tool.call', { tool: 'Agent' }, () => {
      throw new Error('kaboom')
    })
    await start($)
    const ui = await mount($, 'terminal')
    await expect($.tool.call({ tool: 'Agent', description: 'fix', subagent_type: 'cops:pr-sidekick', prompt: 'Rules that apply: none' })).rejects.toThrow()
    await until(async () => (await text(ui)).includes('✗ 🦸 Sidekick · no rules'))
    expect(await text(ui)).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] 🦸 Sidekick/)
    await ui.unmount()
  })
})

describe('/cops-hq', () => {
  test('runs at once, even while a turn is in flight', async ($, on) => {
    const { commands } = world(on)
    await start($)
    expect(commands).toEqual([{ name: 'cops-hq', immediate: true }])
  })

  test('opens the pane', async ($, on) => {
    const { opens } = world(on, { pr: failed('no pull requests found for branch "feat"') })
    await start($)
    expect(await $.command.run({ command: 'cops-hq', args: '' })).toEqual({ text: 'Opened the COPS HQ pane.' })
    expect(opens).toContain('cops-hq')
  })
})

describe('opening by itself', () => {
  test('opens when a thread needs you', async ($, on) => {
    const { opens } = world(on)
    await start($)
    await until(async () => opens.includes('cops-hq'))
  })

  test('stays shut when every thread waits on the reviewer', async ($, on) => {
    const waiting = { data: { repository: { pullRequest: { author: { login: 'octocat' }, reviewThreads: { nodes: [node('t2', 'octocat')] } } } } }
    const { opens } = world(on, { graphql: ok(JSON.stringify(waiting)) })
    await start($)
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Waiting on reviewer (1)'))
    expect(opens).toEqual([])
    await ui.unmount()
  })

  test('opens when a cops agent starts, not for other agents', async ($, on) => {
    const { opens } = world(on, { pr: failed('no pull requests found for branch "feat"') })
    on('tool.call', { tool: 'Agent' }, () => ({ result: { status: 'async_launched', agentId: 'a', description: 'd' }, text: '' }) as never)
    await start($)
    await $.tool.call({ tool: 'Agent', description: 'look', subagent_type: 'Explore', prompt: 'find things' })
    expect(opens).toEqual([])
    await $.tool.call({ tool: 'Agent', description: 'brief', subagent_type: 'cops:pr-oracle', prompt: 'mode: brief-task' })
    await until(async () => opens.includes('cops-hq'))
  })
})

describe('descriptions', () => {
  test('threads', () => {
    const threads = toThreads(RESPONSE)
    expect(threads.map(one => [one.id, one.move])).toEqual([['t1', 'you'], ['t2', 'reviewer'], ['t4', 'you']])
    expect(threads[0]?.lastBody).toBe('t1 says hi')
    expect(toThreads({})).toEqual([])
  })

  test('hides the author\'s own note once they 👍 it', () => {
    const note = '**Note:** heads up'
    const ids = (nodes: ReturnType<typeof node>[]) => toThreads({ data: { repository: { pullRequest: { author: { login: 'octocat' }, reviewThreads: { nodes } } } } }).map(one => one.id)
    expect(ids([node('a', 'octocat', { body: note, thumbs: ['octocat'] })])).toEqual([])
    expect(ids([node('b', 'octocat', { body: '**Drive-by:** x', thumbs: ['octocat'] })])).toEqual([])
    expect(ids([node('c', 'octocat', { body: note })])).toEqual(['c'])
    expect(ids([node('d', 'octocat', { body: note, thumbs: [] })])).toEqual(['d'])
    expect(ids([node('e', 'octocat', { body: note, thumbs: ['alice'] })])).toEqual(['e'])
    expect(ids([node('f', 'octocat', { body: note, thumbs: ['octocat'], totalCount: 2, lastAuthor: 'alice' })])).toEqual(['f'])
    expect(ids([node('g', 'octocat', { body: 'plain', thumbs: ['octocat'] })])).toEqual(['g'])
    expect(ids([node('h', 'octocat', { body: 'Note: plain label', thumbs: ['octocat'] })])).toEqual([])
    expect(ids([node('i', 'alice', { body: note, thumbs: ['octocat'] })])).toEqual(['i'])
  })

  test('calls', () => {
    expect(describeCall('cops:pr-oracle', 'Run `review-pr`.\nmemory-root: `/m`\nmemory-login: unset')).toEqual({
      mode: 'review-pr', memoryRoot: '/m', memoryLogin: 'unset', isLeak: false,
    })
    expect(describeCall('cops:pr-sidekick', 'Rules that apply: none')).toEqual({ rules: 0, isLeak: false })
    expect(describeCall('cops:pr-sidekick', 'Fix it.')).toEqual({ rules: 0, isLeak: false })
    expect(describeCall('cops:pr-sidekick', 'Rules that apply: keep tests beside code')).toEqual({ rules: 1, isLeak: false })
    expect(describeCall('cops:pr-sidekick', 'Rules that apply:\n- a\n- b\n- c\n\nTests: x\n- not a rule')).toEqual({ rules: 3, isLeak: false })
  })

  test('outcomes', () => {
    expect(describeOutcome('CHECKPOINT_NOT_FOUND')).toBe('CHECKPOINT_NOT_FOUND')
    expect(describeOutcome('done, pushed 0123abcdef to origin')).toBe('pushed 0123abc')
    expect(describeOutcome('**Issue:** a\n**Suggestion:** b')).toBe('2 findings')
    expect(describeOutcome('no mode given')).toBe('no mode given')
  })
})
