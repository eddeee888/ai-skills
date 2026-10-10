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

const node = (id: string, author: string, extra: { isResolved?: boolean; isOutdated?: boolean } = {}) => ({
  id, isResolved: false, isOutdated: false, path: `src/${id}.ts`, line: 3, ...extra,
  comments: { nodes: [{ author: { login: author }, body: `${id} says hi\nmore`, url: `https://example.com/${id}` }] },
})

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
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', ($, e) => {
    if (e.argv[0] === 'bash') return { value: ok('COPS memory not configured.\n') }
    if (e.argv[0] === 'git') return { value: ok('feat\n') }
    if (e.argv[1] === 'api') return { value: answers.graphql ?? ok(JSON.stringify(RESPONSE)) }
    return { value: answers.pr ?? ok(JSON.stringify({ number: 7, state: 'OPEN', statusCheckRollup: [] })) }
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }) as never)
}

const start = ($: Engine) => $.session.start({ cwd: '/repo', surface: null, isInteractive: false })

const mount = ($: Engine, surface: 'terminal' | 'desktop') =>
  $.ui.mount({
    plugin: 'cops', surface, component: 'Pane', requestId: 'cops-threads',
    props: { title: 'COPS threads and agents', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
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
      text: e.subagent_type === 'cops:pr-oracle' ? 'CHECKPOINT_FOUND abc1234def on repro/12' : 'changed: a.ts — x\ncommitted: 9f8e7d6c\ndeviations: none',
    }))
    await start($)
    await $.tool.call({
      tool: 'Agent', description: 'brief', subagent_type: 'cops:pr-oracle',
      prompt: 'mode: brief-task\nmemory-root: /mem\nmemory-login: octocat\nTask: fix it',
    })
    await $.tool.call({
      tool: 'Agent', description: 'fix', subagent_type: 'cops:pr-sidekick',
      prompt: 'Fix it.\nRules that apply: keep tests beside code\nmemory-root: /mem',
    })
    await $.tool.call({ tool: 'Agent', description: 'look', subagent_type: 'Explore', prompt: 'find things' })

    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Agents (2)'))
    const drawn = await text(ui)
    expect(drawn).toContain('pr-oracle · brief-task · memory-root /mem · login octocat · 3s · 12k tokens · CHECKPOINT_FOUND abc1234')
    expect(drawn).toContain('pr-sidekick · rules: keep tests beside code · 3s · 12k tokens · committed 9f8e7d6')
    expect(drawn).toContain('pr-sidekick was given memory-root')
    expect(drawn).not.toContain('Explore')
    await ui.unmount()
  })
})

describe('descriptions', () => {
  test('threads', () => {
    const threads = toThreads(RESPONSE)
    expect(threads.map(one => [one.id, one.move])).toEqual([['t1', 'you'], ['t2', 'reviewer'], ['t4', 'you']])
    expect(threads[0]?.lastBody).toBe('t1 says hi')
    expect(toThreads({})).toEqual([])
  })

  test('calls', () => {
    expect(describeCall('cops:pr-oracle', 'Run `review-pr`.\nmemory-root: `/m`\nmemory-login: unset')).toEqual({
      mode: 'review-pr', memoryRoot: '/m', memoryLogin: 'unset', isLeak: false,
    })
    expect(describeCall('cops:pr-sidekick', 'Rules that apply: none')).toEqual({ rules: 'none', isLeak: false })
  })

  test('outcomes', () => {
    expect(describeOutcome('CHECKPOINT_NOT_FOUND')).toBe('CHECKPOINT_NOT_FOUND')
    expect(describeOutcome('done, pushed 0123abcdef to origin')).toBe('pushed 0123abc')
    expect(describeOutcome('**Issue:** a\n**Suggestion:** b')).toBe('2 findings')
    expect(describeOutcome('no mode given')).toBe('no mode given')
  })
})
