import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import { describeActivity, describeCall, describeNext, describeOutcome, describeSkill, groupActivity, isSameSkill, summarize, toThreads } from './pr-panel.ts'
import type { ThreadsResponse } from './pr-panel.ts'
import type { Thread } from '../types'

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
            node('t2', 'alice', { totalCount: 2, lastAuthor: 'octocat' }),
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
      tool: 'Agent', description: 'brief', subagent_type: 'cops:pr-oracle', model: 'haiku',
      prompt: 'mode: brief-task\nmemory-root: /mem\nmemory-login: octocat\nTask: fix it',
    })
    await $.tool.call({
      tool: 'Agent', description: 'fix', subagent_type: 'cops:pr-sidekick',
      prompt: 'Fix it.\nRules that apply:\n- a\n- b\n- c\n- d\n- e\n- f\nmemory-root: /mem',
    })
    await $.tool.call({ tool: 'Agent', description: 'look', subagent_type: 'Explore', prompt: 'find things' })

    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('3 agents'))
    const drawn = await text(ui)
    expect(drawn).toContain('✓ 🔮 Oracle · haiku · brief-task · 3s · 12k tokens · CHECKPOINT_FOUND abc1234')
    expect(drawn).not.toContain('login octocat')
    expect(drawn).toContain('✓ 🦸 Sidekick · inherit · 6 rules · 1 deviation · 3s · 12k tokens · committed 9f8e7d6')
    expect(drawn).toContain('pr-sidekick was given memory-root')
    // Any other agent gets its row, with none of a cops agent's rule or deviation counts.
    expect(drawn).toContain('✓ Explore · inherit · 3s · 12k tokens · committed 9f8e7d6')
    await ui.unmount()
  })

  test('names the model a call resolved to after inherit, and keeps a set alias alone', async ($, on) => {
    world(on)
    on('tool.call', { tool: 'Agent' }, ($, e) => ({
      result: {
        status: 'completed', agentId: 'a1', content: [], totalToolUseCount: 1, totalDurationMs: 3000, totalTokens: 500, prompt: e.prompt,
        resolvedModel: e.subagent_type === 'Explore' ? undefined : 'claude-opus-5-5',
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
      },
      text: 'done',
    }))
    await start($)
    await $.tool.call({ tool: 'Agent', description: 'brief', subagent_type: 'cops:pr-oracle', prompt: 'mode: brief-task' })
    await $.tool.call({ tool: 'Agent', description: 'fix', subagent_type: 'cops:pr-sidekick', model: 'sonnet', prompt: 'Rules that apply: none' })
    await $.tool.call({ tool: 'Agent', description: 'look', subagent_type: 'Explore', prompt: 'find things' })
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('3 agents'))
    const drawn = await text(ui)
    expect(drawn).toContain('✓ 🔮 Oracle · inherit (claude-opus-5-5) · brief-task · 3s')
    expect(drawn).toContain('✓ 🦸 Sidekick · sonnet · no rules · 3s')
    expect(drawn).not.toContain('sonnet (')
    expect(drawn).toContain('✓ Explore · inherit · 3s')
    await ui.unmount()
  })

  test('names the model a background launch resolved to', async ($, on) => {
    world(on)
    on('tool.call', { tool: 'Agent' }, () => ({ result: { status: 'async_launched', agentId: 'a', description: 'd', resolvedModel: 'claude-opus-5-5' }, text: '' }) as never)
    await start($)
    await $.tool.call({ tool: 'Agent', description: 'brief', subagent_type: 'cops:pr-oracle', prompt: 'mode: brief-task' })
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('1 agent'))
    expect(await text(ui)).toContain('🔮 Oracle · inherit (claude-opus-5-5) · brief-task · 0s · running in the background')
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
    await until(async () => (await text(ui)).includes('2 agents'))
    const frame = async (): Promise<string | undefined> => /([⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]) 🔮 Oracle · inherit · brief-task/.exec(await text(ui))?.[1]
    const first = await frame()
    expect(first).toBeDefined()
    await clock.advance(100)
    await until(async () => (await frame()) !== first)
    expect(await frame()).toBeDefined()
    await clock.advance(1000)
    await until(async () => (await text(ui)).includes('✗ 🦸 Sidekick · inherit · no rules · 1s · boom'))
    await clock.advance(1000)
    await until(async () => (await text(ui)).includes('✓ 🔮 Oracle · inherit · brief-task · 2s · 500 tokens · all good'))
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
    await until(async () => (await text(ui)).includes('✗ 🦸 Sidekick · inherit · no rules'))
    expect(await text(ui)).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] 🦸 Sidekick/)
    await ui.unmount()
  })
})

describe('next step', () => {
  const withViewer = (viewer: string, nodes = RESPONSE.data?.repository?.pullRequest?.reviewThreads.nodes ?? []) =>
    ok(JSON.stringify({ data: { viewer: { login: viewer }, repository: { pullRequest: { author: { login: 'octocat' }, reviewThreads: { nodes } } } } }))

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`points the author at pr-address and fills the prompt (${surface})`, async ($, on) => {
      world(on, { graphql: withViewer('octocat') })
      const fills: string[] = []
      const toasts: string[] = []
      on('ui.toast', ($, e) => {
        toasts.push(e.text)
        return { value: undefined }
      })
      on('prompt.fill', ($, e) => {
        fills.push(e.text)
        return { isFilled: true }
      })
      await start($)
      const ui = await mount($, surface)
      await until(async () => (await text(ui)).includes('Next:'))
      const drawn = await text(ui)
      expect(drawn).toContain('Next: /cops:pr-address · 2 threads need you')
      expect(drawn.indexOf('Next:')).toBeLessThan(drawn.indexOf('Needs you'))
      await ui.press({ key: 'next-skill' })
      expect(fills).toEqual(['/cops:pr-address '])
      expect(toasts).toEqual([])
      await ui.unmount()
    })
  }

  test('toasts the skill to type when the prompt is not filled', async ($, on) => {
    world(on, { graphql: withViewer('octocat') })
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('prompt.fill', () => ({ isFilled: false }))
    await start($)
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Next:'))
    await ui.press({ key: 'next-skill' })
    expect(toasts).toEqual(["Couldn't fill the prompt — type /cops:pr-address"])
    await ui.unmount()
  })

  test('points a reviewer at pr-review', async ($, on) => {
    world(on, { graphql: withViewer('alice') })
    await start($)
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Next: /cops:pr-review · someone else’s PR'))
    await ui.unmount()
  })

  test('points a branch without a PR at pr-start', async ($, on) => {
    world(on, { pr: failed('no pull requests found for branch "feat"') })
    await start($)
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Next: /cops:pr-start · this branch has no PR yet'))
    await ui.unmount()
  })

  test('points a merged PR at pr-start and stays shut for its threads', async ($, on) => {
    const { opens } = world(on, { graphql: withViewer('octocat'), pr: ok(JSON.stringify({ number: 7, url: 'https://github.com/o/r/pull/7', state: 'MERGED' })) })
    await start($)
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Next: /cops:pr-start · PR #7 is merged, start the next task'))
    expect(await text(ui)).toContain('PR #7 (merged)')
    expect(opens).toEqual([])
    await ui.unmount()
  })

  test('says nothing when gh does not name the viewer', async ($, on) => {
    world(on)
    await start($)
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('PR #7'))
    expect(await text(ui)).not.toContain('Next:')
    await ui.unmount()
  })

  test('descriptions', () => {
    const ready = (extra: Partial<{ isMine: boolean; isReviewed: boolean; hasNotes: boolean }>) => ({
      status: 'ready' as const, pr: 7, url: 'u', state: 'OPEN' as const, threads: toThreads(RESPONSE), isReviewed: true, hasNotes: false, ...extra,
    })
    expect(describeNext({ view: ready({ isMine: true }), handled: [] })?.why).toBe('2 threads need you')
    expect(describeNext({ view: ready({ isMine: true }), handled: ['t1'] })?.why).toBe('1 thread needs you')
    expect(describeNext({ view: ready({ isMine: true }), handled: ['t1', 't4'] })).toBeUndefined()
    const fresh = { ...ready({ isMine: true, isReviewed: false }), threads: [] }
    expect(describeNext({ view: fresh, handled: [] })).toEqual({ skill: 'cops:pr-review', why: 'your PR, self-review it first' })
    expect(describeNext({ view: fresh, handled: [], ran: ['cops:pr-review'] })).toEqual({ skill: 'cops:pr-sync', why: 'self-reviewed, refresh the description' })
    expect(describeNext({ view: fresh, handled: [], ran: ['pr-review', 'pr-sync'] })?.skill).toBe('cops:pr-note')
    expect(describeNext({ view: fresh, handled: [], ran: ['cops:pr-sync'] })?.skill).toBe('cops:pr-review')
    expect(describeNext({ view: { ...ready({ isMine: true, isReviewed: false, hasNotes: true }), threads: [] }, handled: [] })).toBeUndefined()
    expect(describeNext({ view: ready({ isMine: false }), handled: [] })?.skill).toBe('cops:pr-review')
    expect(describeNext({ view: { ...ready({ isMine: true }), state: 'MERGED' }, handled: [] })).toEqual({ skill: 'cops:pr-start', why: 'PR #7 is merged, start the next task' })
    expect(describeNext({ view: { ...ready({}), state: 'CLOSED' }, handled: [] })?.why).toBe('PR #7 is closed, start the next task')
    expect(describeNext({ view: ready({}), handled: [] })).toBeUndefined()
    expect(describeNext({ view: { status: 'needs-gh' }, handled: [] })).toBeUndefined()

    const pr = ({ nodes, viewer }: { nodes: ReturnType<typeof node>[]; viewer?: string }): ReturnType<typeof summarize> => summarize({ response: { data: { viewer: viewer ? { login: viewer } : null, repository: { pullRequest: { author: { login: 'octocat' }, reviewThreads: { nodes } } } } } })
    expect(pr({ nodes: [], viewer: 'octocat' })).toEqual({ isMine: true, isReviewed: false, hasNotes: false })
    expect(pr({ nodes: [node('a', 'octocat', { body: '**Note:** x', isResolved: true })], viewer: 'alice' })).toEqual({ isMine: false, isReviewed: false, hasNotes: true })
    expect(pr({ nodes: [node('b', 'octocat', { totalCount: 2, lastAuthor: 'alice' })] }).isReviewed).toBe(true)
    expect(pr({ nodes: [node('c', 'alice', { isResolved: true })] }).isMine).toBeUndefined()
    expect(pr({ nodes: [node('c', 'alice', { isResolved: true })] }).isReviewed).toBe(true)
  })
})

describe('skill history', () => {
  test('lists each skill run with who started it', async ($, on) => {
    const { clock } = world(on, { pr: failed('no pull requests found for branch "feat"') })
    on('skill.prompt', ($, e) => ({ text: e.text }))
    // A typed skill command expands its prompt; the Skill tool does the same inside its call.
    on('command.run', async (_, e) => {
      await $.skill.prompt({ skill: e.command, text: 'body' })
      return { text: '' }
    })
    on('tool.call', { tool: 'Skill' }, async (_, e) => {
      await $.skill.prompt({ skill: `cops:${e.skill}`, text: 'body' })
      return { result: { success: true, commandName: e.skill }, text: '' } as never
    })
    await start($)
    await $.command.run({ command: 'cops:pr-review', args: 'https://github.com/o/r/pull/7', origin: { kind: 'composer' } } as never)
    // A plugin's own command run isn't the person typing.
    await $.command.run({ command: 'cops:pr-note', args: 'x', origin: { kind: 'plugin', name: 'other' } } as never)
    await clock.advance(120_000)
    await $.tool.call({ tool: 'Skill', skill: 'pr-address', args: '' })
    await $.skill.prompt({ skill: 'oss:issue-fix', text: 'body' })
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Activity · 4 skills'))
    const drawn = await text(ui)
    expect(drawn).toContain('1. /cops:pr-review https://github.com/o/r/pull/7 · you · 2m ago')
    expect(drawn).toContain('2. /cops:pr-note · preloaded · 2m ago')
    expect(drawn).toContain('3. /cops:pr-address · model · just now')
    expect(drawn).toContain('4. /oss:issue-fix · preloaded · just now')
    await ui.unmount()
  })

  test('a typed cops skill shows its run and starts its Handoffs checklist', async ($, on) => {
    world(on, { pr: failed('no pull requests found for branch "feat"') })
    on('skill.prompt', ($, e) => ({ text: e.text }))
    // The engine expands a typed skill's prompt inside the command's run.
    on('command.run', async (_, e) => {
      await $.skill.prompt({ skill: e.command, text: 'body' })
      return { text: '' }
    })
    await start($)
    await $.command.run({ command: 'cops:pr-start', args: 'add a readme line', origin: { kind: 'composer' } } as never)
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Activity · 1 skill'))
    const drawn = await text(ui)
    expect(drawn).toContain('1. /cops:pr-start add a readme line · you · just now')
    expect(drawn).toContain('Handoffs · pr-start')
    expect(drawn).toContain('[ ] scout-repo + brief-task')
    await ui.unmount()
  })

  // A managed plugin above can skip every user plugin's `skill.prompt`: the command and the Skill call
  // run their skills with no `skill.prompt` reaching cops.
  test('records a skill run skill.prompt never saw, naming the hook that did', async ($, on) => {
    world(on, { pr: failed('no pull requests found for branch "feat"') })
    on('session.usage', () => ({
      value: { startedAt: 0, rateLimits: [], context: { breakdown: { skills: { totalSkills: 1, includedSkills: 1, tokens: 1, skillFrontmatter: [{ name: 'cops:pr-start', source: 'plugin', pluginName: 'cops', tokens: 1 }] } } } } as never,
    }))
    on('command.run', () => ({ text: '' }))
    on('tool.call', { tool: 'Skill' }, (_, e) => ({ result: { success: true, commandName: e.skill }, text: '' }) as never)
    await start($)
    await $.command.run({ command: 'cops:pr-start', args: 'add a readme line', origin: { kind: 'composer' } } as never)
    // Not a skill the session lists: no run.
    await $.command.run({ command: 'cops-hq', args: '', origin: { kind: 'composer' } } as never)
    await $.tool.call({ tool: 'Skill', skill: 'cops:pr-address', args: '' })
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Activity · 2 skills'))
    const drawn = await text(ui)
    expect(drawn).toContain('1. /cops:pr-start add a readme line · you (source:typed) · just now')
    expect(drawn).toContain('2. /cops:pr-address · model (source:tool.call) · just now')
    expect(drawn).not.toContain('/cops-hq')
    expect(drawn).toContain('Handoffs · pr-address')
    await ui.unmount()
  })

  test('records a run once when skill.prompt sees it', async ($, on) => {
    world(on, { pr: failed('no pull requests found for branch "feat"') })
    on('session.usage', () => ({
      value: { startedAt: 0, rateLimits: [], context: { breakdown: { skills: { totalSkills: 1, includedSkills: 1, tokens: 1, skillFrontmatter: [{ name: 'cops:pr-start', source: 'plugin', pluginName: 'cops', tokens: 1 }] } } } } as never,
    }))
    on('skill.prompt', ($, e) => ({ text: e.text }))
    on('command.run', async (_, e) => {
      await $.skill.prompt({ skill: e.command, text: 'body' })
      return { text: '' }
    })
    on('tool.call', { tool: 'Skill' }, async (_, e) => {
      await $.skill.prompt({ skill: e.skill, text: 'body' })
      return { result: { success: true, commandName: e.skill }, text: '' } as never
    })
    await start($)
    await $.command.run({ command: 'cops:pr-start', args: 'x', origin: { kind: 'composer' } } as never)
    await $.tool.call({ tool: 'Skill', skill: 'cops:pr-address', args: '' })
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Activity · 2 skills'))
    const drawn = await text(ui)
    expect(drawn).toContain('1. /cops:pr-start x · you · just now')
    expect(drawn).toContain('2. /cops:pr-address · model · just now')
    expect(drawn).not.toContain('source:')
    await ui.unmount()
  })

  test('toasts, once, a skill run it could not record', async ($, on) => {
    world(on, { pr: failed('no pull requests found for branch "feat"') })
    on('state.set', { plugin: 'cops', key: 'skills' }, () => ({ deny: 'store down' }))
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('skill.prompt', ($, e) => ({ text: e.text }))
    await start($)
    expect(await $.skill.prompt({ skill: 'cops:pr-start', text: 'body' })).toEqual({ text: 'body' })
    await $.skill.prompt({ skill: 'cops:pr-sync', text: 'body' })
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toStartWith("COPS HQ couldn't record /cops:pr-start in Activity: ")
    expect(toasts[0]).toContain('store down')
  })

  test('runs a cops agent call it could not add a row for, and toasts once', async ($, on) => {
    world(on, { pr: failed('no pull requests found for branch "feat"') })
    on('state.set', { plugin: 'cops', key: 'agents' }, () => ({ deny: 'store down' }))
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    let runs = 0
    on('tool.call', { tool: 'Agent' }, () => {
      runs += 1
      return { result: { status: 'async_launched' }, text: '' } as never
    })
    await start($)
    await $.tool.call({ tool: 'Agent', description: 'scout', subagent_type: 'cops:pr-oracle', prompt: 'mode: scout-repo' })
    await $.tool.call({ tool: 'Agent', description: 'review', subagent_type: 'cops:pr-oracle', prompt: 'mode: review-pr' })
    expect(runs).toBe(2)
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toStartWith("COPS HQ couldn't add a row for cops:pr-oracle: ")
  })

  test('nests each agent call under the skill run it started in', async ($, on) => {
    const { clock } = world(on, { pr: failed('no pull requests found for branch "feat"') })
    on('skill.prompt', ($, e) => ({ text: e.text }))
    on('tool.call', { tool: 'Agent' }, ($, e) => ({
      result: {
        status: 'completed', agentId: 'a1', content: [], totalToolUseCount: 1, totalDurationMs: 1000, totalTokens: 500, prompt: e.prompt,
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
      },
      text: 'done',
    }))
    await start($)
    await $.tool.call({ tool: 'Agent', description: 'scout', subagent_type: 'cops:pr-oracle', prompt: 'mode: scout-repo' })
    await clock.advance(1000)
    await $.skill.prompt({ skill: 'cops:pr-review', text: 'body' })
    await $.tool.call({ tool: 'Agent', description: 'review', subagent_type: 'cops:pr-oracle', prompt: 'mode: review-pr' })
    await clock.advance(1000)
    await $.skill.prompt({ skill: 'cops:pr-address', text: 'body' })
    await $.tool.call({ tool: 'Agent', description: 'fix', subagent_type: 'cops:pr-sidekick', prompt: 'Rules that apply: none' })
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Activity · 2 skills · 3 agents'))
    const drawn = await text(ui)
    const at = (part: string) => drawn.indexOf(part)
    expect(at('✓ 🔮 Oracle · inherit · scout-repo')).toBeLessThan(at('1. /cops:pr-review'))
    expect(at('1. /cops:pr-review')).toBeLessThan(at('   ✓ 🔮 Oracle · inherit · review-pr'))
    expect(at('   ✓ 🔮 Oracle · inherit · review-pr')).toBeLessThan(at('2. /cops:pr-address'))
    expect(at('2. /cops:pr-address')).toBeLessThan(at('   ✓ 🦸 Sidekick · inherit · no rules'))
    expect(at('─'.repeat(20))).toBeGreaterThan(-1)
    expect(at('─'.repeat(20))).toBeLessThan(at('Activity · 2 skills'))
    expect(drawn).not.toContain('   ✓ 🔮 Oracle · inherit · scout-repo')
    await ui.unmount()
  })

  test('keeps each run\'s number once older runs drop off', async ($, on) => {
    world(on, { pr: failed('no pull requests found for branch "feat"') })
    on('skill.prompt', ($, e) => ({ text: e.text }))
    await start($)
    for (let i = 1; i <= 52; i++) await $.skill.prompt({ skill: `s${i}`, text: 'body' })
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('52. /s52'))
    const drawn = await text(ui)
    expect(drawn).toContain('Activity · 50 skills')
    expect(drawn).toContain('3. /s3 ')
    expect(drawn).not.toContain('/s2 ')
    await ui.unmount()
  })

  test('the Next line names the run that already used its skill', async ($, on) => {
    world(on, { pr: failed('no pull requests found for branch "feat"') })
    on('skill.prompt', ($, e) => ({ text: e.text }))
    await start($)
    await $.skill.prompt({ skill: 'cops:pr-start', text: 'body' })
    const ui = await mount($, 'terminal')
    await until(async () => (await text(ui)).includes('Next: /cops:pr-start · this branch has no PR yet · ran as 1.'))
    await ui.unmount()
  })

  test('descriptions', () => {
    expect(isSameSkill({ a: 'cops:pr-review', b: 'pr-review' })).toBe(true)
    expect(isSameSkill({ a: 'cops:pr-review', b: 'oss:pr-review' })).toBe(false)
    expect(isSameSkill({ a: 'pr-note', b: 'pr-review' })).toBe(false)
    expect(describeSkill({ run: { n: 51, skill: 'cops:pr-sync', by: 'you', at: 0 }, now: 7_200_000 })).toEqual({ counter: '51.', command: '/cops:pr-sync', args: '', detail: 'you · 2h ago' })
    expect(describeSkill({ run: { n: 4, skill: 'cops:pr-sync', by: 'you', source: 'typed', at: 0 }, now: 0 })).toEqual({ counter: '4.', command: '/cops:pr-sync', args: '', detail: 'you (source:typed) · just now' })
    expect(describeSkill({ run: { n: 5, skill: 'pr-address', by: 'model', source: 'tool.call', at: 0 }, now: 0 })).toEqual({ counter: '5.', command: '/pr-address', args: '', detail: 'model (source:tool.call) · just now' })
    expect(describeActivity({ runs: 0, calls: 0 })).toBe('Activity · none yet')
    expect(describeActivity({ runs: 1, calls: 0 })).toBe('Activity · 1 skill')
    expect(describeActivity({ runs: 2, calls: 1 })).toBe('Activity · 2 skills · 1 agent')
    const call = (id: string, startedAt: number) => ({ id, agent: 'cops:pr-oracle', startedAt, state: 'done' as const, isLeak: false })
    const runs = [{ n: 1, skill: 'a', by: 'you' as const, at: 0 }, { n: 2, skill: 'b', by: 'model' as const, at: 50 }]
    const grouped = groupActivity({ runs, calls: [call('x', 10), call('y', 20), call('z', 60)] })
    expect(grouped.loose).toEqual([])
    expect(grouped.groups.map(group => group.calls.map(one => one.id))).toEqual([['x', 'y'], ['z']])
    expect(groupActivity({ runs: [], calls: [call('x', 10)] }).loose.map(one => one.id)).toEqual(['x'])
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
    const waiting = { data: { repository: { pullRequest: { author: { login: 'octocat' }, reviewThreads: { nodes: [node('t2', 'alice', { totalCount: 2, lastAuthor: 'octocat' })] } } } } }
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

  test('decides whose move a thread is', () => {
    const moves = ({ nodes }: { nodes: ReturnType<typeof node>[] }): Thread['move'][] => toThreads({ data: { repository: { pullRequest: { author: { login: 'octocat' }, reviewThreads: { nodes } } } } }).map(one => one.move)
    expect(moves({ nodes: [node('a', 'octocat', { body: '**Issue:** x' })] })).toEqual(['you'])
    expect(moves({ nodes: [node('b', 'octocat', { body: '**Note:** x' })] })).toEqual(['reviewer'])
    expect(moves({ nodes: [node('c', 'octocat', { body: 'Drive-by: x' })] })).toEqual(['reviewer'])
    expect(moves({ nodes: [node('d', 'alice', { totalCount: 2, lastAuthor: 'octocat' })] })).toEqual(['reviewer'])
    expect(moves({ nodes: [node('e', 'octocat', { body: '**Issue:** x', totalCount: 2 })] })).toEqual(['reviewer'])
    const view = { status: 'ready' as const, pr: 7, url: 'u', state: 'OPEN' as const, isMine: true, isReviewed: false, hasNotes: true }
    const threads = toThreads({ data: { repository: { pullRequest: { author: { login: 'octocat' }, reviewThreads: { nodes: [node('a', 'octocat', { body: '**Issue:** x' })] } } } } })
    expect(describeNext({ view: { ...view, threads }, handled: [] })?.skill).toBe('cops:pr-address')
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
    expect(describeCall({ agent: 'cops:pr-oracle', prompt: 'Run `review-pr`.\nmemory-root: `/m`\nmemory-login: unset' })).toEqual({
      modes: ['review-pr'], memoryRoot: '/m', memoryLogin: 'unset', isLeak: false,
    })
    expect(describeCall({ agent: 'cops:pr-oracle', prompt: 'Mode: triage-threads + scout-repo' }).modes).toEqual(['triage-threads', 'scout-repo'])
    expect(describeCall({ agent: 'cops:pr-oracle', prompt: 'mode: scout-repo + triage-threads' }).modes).toEqual(['scout-repo', 'triage-threads'])
    expect(describeCall({ agent: 'cops:pr-oracle', prompt: 'Run it.' }).modes).toEqual([])
    expect(describeCall({ agent: 'cops:pr-sidekick', prompt: 'Rules that apply: none' })).toEqual({ rules: 0, isLeak: false })
    expect(describeCall({ agent: 'cops:pr-sidekick', prompt: 'Fix it.' })).toEqual({ rules: 0, isLeak: false })
    expect(describeCall({ agent: 'cops:pr-sidekick', prompt: 'Rules that apply: keep tests beside code' })).toEqual({ rules: 1, isLeak: false })
    expect(describeCall({ agent: 'cops:pr-sidekick', prompt: 'Rules that apply:\n- a\n- b\n- c\n\nTests: x\n- not a rule' })).toEqual({ rules: 3, isLeak: false })
  })

  test('outcomes', () => {
    expect(describeOutcome('CHECKPOINT_NOT_FOUND')).toBe('CHECKPOINT_NOT_FOUND')
    expect(describeOutcome('done, pushed 0123abcdef to origin')).toBe('pushed 0123abc')
    expect(describeOutcome('**Issue:** a\n**Suggestion:** b')).toBe('2 findings')
    expect(describeOutcome('no mode given')).toBe('no mode given')
  })
})
