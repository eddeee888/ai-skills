import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { checkLoaded, checkTool, tickedBy } from './orchestration.ts'

type Ui = Awaited<ReturnType<Engine['ui']['mount']>>

// One subagent run inside its Agent call: the tool calls it makes once spawned, carrying the
// agentId it got, and the answer its turn ends with.
type Run = { does?: ({ $, agentId }: { $: Engine; agentId: string }) => Promise<void>; answer?: string }

// Answers what the plugin asks of the engine outside a repository, and runs each Agent call's
// subagent the way a session does: spawned, its tool calls, then its turn's end. `runs` names
// what each prompt's subagent does; one not named spawns and ends at once. Records the toasts.
const world = ({ $, on, runs = {} }: { $: Engine; on: On; runs?: Record<string, Run> }): { toasts: string[] } => {
  const toasts: string[] = []
  let count = 0
  mock.clock(on)
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('agent.spawn', () => ({ model: 'sonnet', agentId: `agent-${count}` }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
  on('tool.call', { tool: 'Agent' }, async (_, e) => {
    count += 1
    const run = runs[e.prompt]
    const spawned = await $.agent.spawn({
      tool_use_id: e.tool_use_id, prompt: e.prompt, description: e.description, subagentType: e.subagent_type || 'general-purpose',
      provider: { plugin: 'cops', tier: 'user' }, parentModel: 'opus', background: false, fork: false,
    })
    const agentId = spawned.deny === undefined ? spawned.agentId || '' : ''
    await run?.does?.({ $, agentId })
    await $.turn.complete({ answer: run?.answer || '', durationMs: 1, isAborted: false, turnId: `turn-${count}`, agentId, reason: 'answer' })
    return {
      result: {
        status: 'completed', agentId, content: [], totalToolUseCount: 1, totalDurationMs: 1000, totalTokens: 100, prompt: e.prompt,
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
      },
      text: '',
    }
  })
  return { toasts }
}

const spawn = async ({ $, agent, prompt }: { $: Engine; agent: string; prompt: string }): Promise<void> => {
  await $.tool.call({ tool: 'Agent', description: prompt, subagent_type: agent, prompt })
}

const mount = async ({ $ }: { $: Engine }): Promise<Ui> => {
  await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
  return $.ui.mount({
    plugin: 'cops', surface: 'terminal', component: 'Pane', requestId: 'cops-hq',
    props: { title: 'COPS HQ', isFocused: true, bodyColumns: 200, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
}

const text = async ({ ui }: { ui: Ui }): Promise<string> => (await ui.find({ type: 'Box' }))?.text ?? ''

describe('handoff checklist', () => {
  test('ticks a combined oracle call by each mode it names', () => {
    expect(tickedBy({ skill: 'cops:pr-start', agent: 'cops:pr-oracle', modes: ['scout-repo', 'brief-task'] })).toEqual(['scout-repo + brief-task'])
    expect(tickedBy({ skill: 'cops:pr-sync', agent: 'cops:pr-oracle', modes: ['scout-repo', 'brief-task'] })).toEqual(['scout-repo', 'brief-task'])
    expect(tickedBy({ skill: 'cops:pr-start', agent: 'cops:pr-oracle', modes: ['scout-repo'] })).toEqual([])
    expect(tickedBy({ skill: 'cops:pr-start', agent: 'cops:pr-sidekick', modes: [] })).toEqual(['fix loop'])
    expect(tickedBy({ skill: 'cops:pr-address', agent: 'Explore', modes: [] })).toEqual(['5b research'])
    expect(tickedBy({ skill: 'oss:issue-fix', agent: 'cops:pr-sidekick', modes: [] })).toEqual([])
  })

  test('a pr-address run missing sweep-diff leaves it unticked', async ($, on) => {
    world({ $, on })
    await $.skill.prompt({ skill: 'cops:pr-address', text: 'Address the threads.' })
    await spawn({ $, agent: 'cops:pr-oracle', prompt: 'mode: triage-threads + scout-repo' })
    await spawn({ $, agent: 'cops:pr-sidekick', prompt: 'Rules that apply: none' })
    const ui = await mount({ $ })
    const drawn = await text({ ui })
    expect(drawn).toContain('Handoffs · pr-address')
    expect(drawn).toContain('[x] triage-threads + scout-repo')
    expect(drawn).toContain('[x] 5a batches')
    expect(drawn).toContain('[ ] sweep-diff')
    expect(drawn).toContain('[ ] 5b research')
    await ui.unmount()
  })

  test('a spawn inside a subagent ticks nothing', async ($, on) => {
    world({ $, on })
    await $.skill.prompt({ skill: 'cops:pr-review', text: 'Review it.' })
    await $.agent.spawn({
      tool_use_id: 'nested', prompt: 'mode: review-pr', description: 'review', subagentType: 'cops:pr-oracle',
      provider: { plugin: 'cops', tier: 'user' }, parentModel: 'opus', background: false, fork: false, parentAgentId: 'agent-1',
    })
    const ui = await mount({ $ })
    expect(await text({ ui })).toContain('[ ] review-pr')
    await ui.unmount()
  })
})

describe('oracle loaded check', () => {
  test('names the files loaded: lacks', () => {
    expect(checkLoaded({ text: 'fix: t1\nloaded: memory.md, modes/sweep-diff.md', modes: ['sweep-diff'] })).toEqual([])
    expect(checkLoaded({ text: 'loaded: ../references/pr-oracle/memory.md, ../references/pr-oracle/modes/sweep-diff.md', modes: ['sweep-diff'] })).toEqual([])
    expect(checkLoaded({ text: 'loaded:\n  - memory.md\n  - modes/review-pr.md\nunverified: []', modes: ['review-pr'] })).toEqual([])
    expect(checkLoaded({ text: 'loaded: memory.md', modes: ['triage-threads', 'scout-repo'] })).toEqual(['modes/triage-threads.md', 'modes/scout-repo.md'])
    expect(checkLoaded({ text: 'profile: …', modes: ['scout-repo'] })).toEqual(['memory.md', 'modes/scout-repo.md'])
  })

  test('marks an oracle row whose loaded: lacks its mode file ⚠, and a full one ✓', async ($, on) => {
    world({
      $, on, runs: {
        'mode: sweep-diff': { answer: 'clean\nloaded: memory.md' },
        'mode: brief-task': { answer: 'brief\nloaded: memory.md, modes/brief-task.md' },
      },
    })
    await spawn({ $, agent: 'cops:pr-oracle', prompt: 'mode: sweep-diff' })
    await spawn({ $, agent: 'cops:pr-oracle', prompt: 'mode: brief-task' })
    const ui = await mount({ $ })
    const drawn = await text({ ui })
    expect(drawn).toContain('sweep-diff · ⚠ loaded lacks modes/sweep-diff.md')
    expect(drawn).toContain('brief-task · ✓ loaded')
    await ui.unmount()
  })
})

describe('rule checks', () => {
  const ORACLE = { agent: 'cops:pr-oracle', modes: ['review-pr'], memoryRoot: '/mem' }
  const LEARNING = { agent: 'cops:pr-oracle', modes: ['learn-feedback'], memoryRoot: '/mem' }
  const SIDEKICK = { agent: 'cops:pr-sidekick' }

  test('flags an oracle writing outside learn-feedback or its memory tree, or running a non-read command', () => {
    expect(checkTool({ call: ORACLE, tool: 'Write', path: '/mem/memory/users/me/x.md', tries: 0 })).toEqual(['wrote /mem/memory/users/me/x.md outside a learn-feedback call'])
    expect(checkTool({ call: LEARNING, tool: 'Edit', path: '/repo/a.ts', tries: 0 })).toEqual(['wrote /repo/a.ts outside its memory tree'])
    expect(checkTool({ call: { ...LEARNING, memoryRoot: 'unavailable' }, tool: 'Write', path: '/mem/memory/team/MEMORY.md', tries: 0 })).toEqual(['wrote /mem/memory/team/MEMORY.md outside its memory tree'])
    expect(checkTool({ call: LEARNING, tool: 'Write', path: '/mem/memory/team/MEMORY.md', tries: 0 })).toEqual([])
    for (const command of ['git log -3', 'git diff main...HEAD 2>/dev/null', 'gh pr view --json number', 'gh api graphql -f query=\'query { viewer { login } }\'']) {
      expect(checkTool({ call: ORACLE, tool: 'Bash', command, tries: 1 })).toEqual([])
    }
    for (const command of ['git push', 'git -C /mem commit -m x', 'rm -rf memory', 'echo x > notes.md', 'gh api -X POST repos/o/r/issues', 'gh pr comment 1 -b hi']) {
      expect(checkTool({ call: ORACLE, tool: 'Bash', command, tries: 1 })).toEqual([`ran a non-read command: ${command}`])
    }
  })

  test('flags a sidekick amending, force-pushing, skipping hooks, resolving a thread, or trying a 4th time', () => {
    expect(checkTool({ call: SIDEKICK, tool: 'Bash', command: 'git push --force origin HEAD', tries: 1 })).toEqual(['force-pushed'])
    expect(checkTool({ call: SIDEKICK, tool: 'Bash', command: 'git push -f', tries: 1 })).toEqual(['force-pushed'])
    expect(checkTool({ call: SIDEKICK, tool: 'Bash', command: 'git push --force-with-lease', tries: 1 })).toEqual(['force-pushed'])
    expect(checkTool({ call: { ...SIDEKICK, mayRewrite: true }, tool: 'Bash', command: 'git push --force-with-lease', tries: 1 })).toEqual([])
    expect(checkTool({ call: SIDEKICK, tool: 'Bash', command: 'git push origin HEAD', tries: 1 })).toEqual([])
    expect(checkTool({ call: SIDEKICK, tool: 'Bash', command: 'git commit --amend --no-verify', tries: 1 })).toEqual(['amended a commit', 'skipped hooks with --no-verify'])
    expect(checkTool({ call: SIDEKICK, tool: 'Bash', command: 'gh api graphql -f query=\'mutation { resolveReviewThread(input: {threadId: "x"}) { thread { id } } }\'', tries: 1 })).toEqual(['resolved a review thread'])
    expect(checkTool({ call: SIDEKICK, tool: 'Bash', command: 'pnpm test', tries: 3 })).toEqual([])
    expect(checkTool({ call: SIDEKICK, tool: 'Bash', command: 'pnpm test', tries: 4 })).toEqual(['4th try of: pnpm test'])
    expect(checkTool({ call: SIDEKICK, tool: 'Write', path: '/repo/a.ts', tries: 0 })).toEqual([])
  })

  test('flags a sidekick force-push on its row and toasts it once', async ($, on) => {
    const { toasts } = world({
      $, on, runs: {
        'Rules that apply: none': {
          does: async ({ $, agentId }) => {
            for (let tries = 0; tries < 2; tries++) await $.tool.call({ tool: 'Bash', command: 'git push --force', agentId })
          },
        },
      },
    })
    await spawn({ $, agent: 'cops:pr-sidekick', prompt: 'Rules that apply: none' })
    const ui = await mount({ $ })
    expect(await text({ ui })).toContain('⚑ force-pushed')
    expect(toasts.filter(one => one.includes('force-pushed'))).toEqual(['COPS rule check: Sidekick force-pushed.'])
    await ui.unmount()
  })

  test('leaves a force-push unflagged when the sidekick prompt names a rebase', async ($, on) => {
    const prompt = 'Rebase onto main, then force-push.'
    const { toasts } = world({
      $, on, runs: { [prompt]: { does: async ({ $, agentId }) => void (await $.tool.call({ tool: 'Bash', command: 'git push --force-with-lease', agentId })) } },
    })
    await spawn({ $, agent: 'cops:pr-sidekick', prompt })
    const ui = await mount({ $ })
    expect(await text({ ui })).not.toContain('⚑')
    expect(toasts).toEqual([])
    await ui.unmount()
  })

  test('flags the 4th identical command of one sidekick run', async ($, on) => {
    world({
      $, on, runs: {
        'Rules that apply: none': {
          does: async ({ $, agentId }) => {
            for (let tries = 0; tries < 5; tries++) await $.tool.call({ tool: 'Bash', command: 'pnpm test', agentId })
          },
        },
      },
    })
    await spawn({ $, agent: 'cops:pr-sidekick', prompt: 'Rules that apply: none' })
    const ui = await mount({ $ })
    expect((await text({ ui })).split('⚑ 4th try of: pnpm test')).toHaveLength(2)
    await ui.unmount()
  })
})
