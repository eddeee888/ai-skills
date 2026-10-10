import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import { parseSuffixes } from './memory-inbox.ts'

const MEMORY_ON = 'COPS memory root: /memory\nCOPS memory login: octocat\n'
const MEMORY_OFF = 'COPS memory not configured: PR_MEMORY_PATH is unset, so pr-oracle runs without memory.\n'
const MEMORY = { options: { memory_path: '~/mem', memory_login: 'octocat' } }

type Ui = Awaited<ReturnType<Engine['ui']['mount']>>

// Answers what the plugin asks of the engine, gives each cops agent the result `replies` names
// for its type, and records the prompt fills and toasts.
// With `pr`, the branch is in ai-skills and has that PR.
const world = ({ on, memory = MEMORY_ON, replies, stored = {}, isFilled = true, pr }: {
  on: On; memory?: string; replies: Record<string, string>; stored?: Record<string, unknown>; isFilled?: boolean; pr?: number
}): { fills: string[]; toasts: string[]; clock: ReturnType<typeof mock.clock>; setMemory: (next: string) => void } => {
  const ok = ({ stdout }: { stdout: string }): ProcessRunResult => ({
    exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false,
  })
  const fills: string[] = []
  const toasts: string[] = []
  let context = memory
  const clock = mock.clock(on)
  // Writes land in `stored`, so a test can check what the store keeps.
  on('store.get', ($, e) => ({ value: stored[e.key] }))
  on('store.set', ($, e) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', ($, e) => {
    if (e.argv[0] === 'bash') return { value: ok({ stdout: context }) }
    if (!pr) return { value: { ...ok({ stdout: '' }), exitCode: 1, stderr: 'no pull requests found' } }
    if (e.argv[1] === 'remote') return { value: ok({ stdout: 'git@github.com:eddeee888/ai-skills.git\n' }) }
    if (e.argv[0] === 'git') return { value: ok({ stdout: 'feat\n' }) }
    if (e.argv[1] === 'api') return { value: ok({ stdout: JSON.stringify({ data: { repository: { pullRequest: { author: { login: 'octocat' }, reviewThreads: { nodes: [] } } } } }) }) }
    return { value: ok({ stdout: JSON.stringify({ number: pr, url: `https://github.com/eddeee888/ai-skills/pull/${pr}` }) }) }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.fill', ($, e) => {
    if (isFilled) fills.push(e.text)
    return { isFilled }
  })
  on('tool.call', { tool: 'Agent' }, ($, e) => ({
    result: {
      status: 'completed', agentId: 'a1', content: [], totalToolUseCount: 1, totalDurationMs: 1000, totalTokens: 100, prompt: e.prompt,
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
    },
    text: replies[e.prompt] ?? '',
  }))
  return { fills, toasts, clock, setMemory: next => { context = next } }
}

const oracle = async ({ $, mode, label = 'mode' }: { $: Engine; mode: string; label?: string }): Promise<void> => {
  await $.tool.call({ tool: 'Agent', description: mode, subagent_type: 'cops:pr-oracle', prompt: `${label}: ${mode}` })
}

const sidekick = async ({ $ }: { $: Engine }): Promise<void> => {
  await $.tool.call({ tool: 'Agent', description: 'fix', subagent_type: 'cops:pr-sidekick', prompt: 'Rules that apply: none' })
}

// Starts the session first, so the status line has checked whether memory is on.
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
  for (let tries = 0; tries < 3000; tries++) if (await check()) return
  throw new Error('never happened')
}

const REPLIES = {
  'mode: triage-threads': 'fix: t1\nmemory-candidate: prefer early returns\nloaded: memory.md',
  'mode: grill-description': 'q1\nmemory-candidate: name the ticket in the title\npromote: use pnpm here\nloaded: memory.md',
  'mode: review-pr': 'findings: []\nmemory-candidate: test the error path\nconflict: squash — contradicts team/MEMORY.md:3\nloaded: memory.md',
  'Rules that apply: none': 'changed: a.ts — x\ncommitted: no\nopen: should the flag be renamed?',
}

describe('memory inbox', () => {
  test('collects each line once, kept in the store', MEMORY, async ($, on) => {
    world({ on, replies: REPLIES })
    await oracle({ $, mode: 'triage-threads' })
    await oracle({ $, mode: 'grill-description' })
    await oracle({ $, mode: 'review-pr' })
    await sidekick({ $ })
    await oracle({ $, mode: 'triage-threads' })
    await oracle({ $, mode: 'review-pr' })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('Inbox (6)') })
    const drawn = await text({ ui })
    for (const line of [
      'memory-candidate: prefer early returns', 'memory-candidate: name the ticket in the title', 'promote: use pnpm here',
      'memory-candidate: test the error path', 'conflict: squash — contradicts team/MEMORY.md:3', 'open: should the flag be renamed?',
    ]) expect(drawn.split(line)).toHaveLength(2)
    expect(drawn).not.toContain('loaded:')
    await ui.unmount()
  })

  test('shows items stored by an earlier session', MEMORY, async ($, on) => {
    world({ on, replies: {}, stored: { inbox: [{ kind: 'promote', text: 'use pnpm here', modes: ['grill-description'] }, 'junk'] } })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('Inbox (1)') })
    expect(await text({ ui })).toContain('promote: use pnpm here')
    await ui.unmount()
  })

  test('gives each source its buttons', MEMORY, async ($, on) => {
    world({ on, replies: REPLIES })
    await oracle({ $, mode: 'triage-threads' })
    await oracle({ $, mode: 'grill-description' })
    await oracle({ $, mode: 'review-pr' })
    await sidekick({ $ })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('Inbox (6)') })
    const keys = async ({ index }: { index: number }): Promise<string[]> => {
      const found = await Promise.all(['park', 'remember', 'drop'].map(async key => ((await ui.find({ key: `${key}-${index}` })) ? key : '')))
      return found.filter(Boolean)
    }
    expect(await keys({ index: 0 })).toEqual(['park', 'drop'])
    expect((await ui.find({ key: 'park-0' }))?.props.label).toBe('Park as candidate')
    expect(await keys({ index: 1 })).toEqual(['remember', 'drop'])
    expect((await ui.find({ key: 'remember-1' }))?.props.label).toBe('Remember')
    for (const index of [2, 3, 4, 5]) expect(await keys({ index })).toEqual(['drop'])
    await ui.unmount()
  })

  test('offers park for a call that ran triage-threads with another mode, in any case', MEMORY, async ($, on) => {
    world({
      on,
      replies: {
        'Mode: triage-threads + scout-repo': 'memory-candidate: prefer early returns',
        'mode: scout-repo + triage-threads': 'memory-candidate: name tests after behavior',
      },
    })
    await oracle({ $, mode: 'triage-threads + scout-repo', label: 'Mode' })
    await oracle({ $, mode: 'scout-repo + triage-threads' })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('Inbox (2)') })
    expect((await ui.find({ key: 'park-0' }))?.props.label).toBe('Park as candidate')
    expect((await ui.find({ key: 'park-1' }))?.props.label).toBe('Park as candidate')
    await ui.unmount()
  })

  test('park and remember fill the prompt and clear the item', MEMORY, async ($, on) => {
    const { fills } = world({ on, replies: REPLIES })
    await oracle({ $, mode: 'triage-threads' })
    await oracle({ $, mode: 'grill-description' })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('Inbox (3)') })
    await ui.press({ key: 'park-0' })
    await until({ check: async () => (await text({ ui })).includes('Inbox (2)') })
    expect(fills).toEqual(['Park this as a memory candidate: prefer early returns'])
    await ui.press({ key: 'remember-0' })
    await until({ check: async () => (await text({ ui })).includes('Inbox (1)') })
    expect(fills).toEqual(['Park this as a memory candidate: prefer early returns', 'Remember this rule: name the ticket in the title'])
    expect(await text({ ui })).toContain('promote: use pnpm here')
    await ui.unmount()
  })

  test('keeps the item when the prompt is not filled', MEMORY, async ($, on) => {
    const { fills } = world({ on, replies: REPLIES, isFilled: false })
    await oracle({ $, mode: 'grill-description' })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('Inbox (2)') })
    await ui.press({ key: 'remember-0' })
    expect(fills).toEqual([])
    expect(await text({ ui })).toContain('Inbox (2)')
    await ui.unmount()
  })

  test('drop clears the item without filling the prompt', MEMORY, async ($, on) => {
    const { fills } = world({ on, replies: REPLIES })
    await oracle({ $, mode: 'review-pr' })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('Inbox (2)') })
    await ui.press({ key: 'drop-1' })
    await until({ check: async () => (await text({ ui })).includes('Inbox (1)') })
    expect(await text({ ui })).not.toContain('conflict:')
    await ui.press({ key: 'drop-0' })
    await until({ check: async () => !(await text({ ui })).includes('Inbox') })
    expect(fills).toEqual([])
    await ui.unmount()
  })

  test('does not collect a dropped line again', MEMORY, async ($, on) => {
    world({ on, replies: { ...REPLIES, 'mode: sweep-diff': 'swept\nmemory-candidate: prefer early returns\nmemory-candidate: keep tests beside code' } })
    await oracle({ $, mode: 'triage-threads' })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('Inbox (1)') })
    await ui.press({ key: 'drop-0' })
    await until({ check: async () => !(await text({ ui })).includes('Inbox') })
    await oracle({ $, mode: 'triage-threads' })
    await oracle({ $, mode: 'sweep-diff' })
    await until({ check: async () => (await text({ ui })).includes('Inbox (1)') })
    const drawn = await text({ ui })
    expect(drawn).toContain('memory-candidate: keep tests beside code')
    expect(drawn).not.toContain('memory-candidate: prefer early returns')
    await ui.unmount()
  })

  test('keeps the newest 50 items', MEMORY, async ($, on) => {
    const stored = Array.from({ length: 50 }, (_, index) => ({ kind: 'promote', text: `rule ${index}` }))
    world({ on, replies: REPLIES, stored: { inbox: stored } })
    await oracle({ $, mode: 'triage-threads' })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('memory-candidate: prefer early returns') })
    const drawn = await text({ ui })
    expect(drawn).toContain('Inbox (50)')
    expect(drawn).not.toContain('promote: rule 0')
    expect(drawn).toContain('promote: rule 1')
    expect(drawn.indexOf('memory-candidate: prefer early returns')).toBeGreaterThan(drawn.indexOf('promote: rule 49'))
    await ui.unmount()
  })

  test('shows the repository and PR each line came from', MEMORY, async ($, on) => {
    world({ on, replies: REPLIES, pr: 59 })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('PR #59') })
    await oracle({ $, mode: 'triage-threads' })
    await until({ check: async () => (await text({ ui })).includes('Inbox (1)') })
    expect(await text({ ui })).toContain('memory-candidate: prefer early returns · ai-skills#59')
    await ui.unmount()
  })

  test('keeps open lines for this session only', MEMORY, async ($, on) => {
    const stored: Record<string, unknown> = {}
    world({ on, replies: REPLIES, stored })
    await sidekick({ $ })
    await oracle({ $, mode: 'triage-threads' })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('Inbox (2)') })
    expect(await text({ ui })).toContain('open: should the flag be renamed?')
    expect(stored.inbox).toEqual([{ kind: 'memory-candidate', text: 'prefer early returns', modes: ['triage-threads'] }])
    await ui.press({ key: 'drop-1' })
    await until({ check: async () => (await text({ ui })).includes('Inbox (1)') })
    expect(await text({ ui })).not.toContain('open:')
    await ui.unmount()
  })

  test('toasts the first time the list grows and on every new conflict', MEMORY, async ($, on) => {
    const { toasts } = world({
      on,
      replies: { ...REPLIES, 'mode: sweep-diff': 'conflict: rebase — contradicts team/MEMORY.md:9\nconflict: squash — contradicts team/MEMORY.md:3' },
    })
    await oracle({ $, mode: 'triage-threads' })
    expect(toasts).toEqual(['COPS memory inbox: 1 new in the COPS HQ pane.'])
    await oracle({ $, mode: 'grill-description' })
    expect(toasts).toHaveLength(1)
    await oracle({ $, mode: 'review-pr' })
    await oracle({ $, mode: 'sweep-diff' })
    await oracle({ $, mode: 'review-pr' })
    expect(toasts).toEqual([
      'COPS memory inbox: 1 new in the COPS HQ pane.',
      'COPS memory conflict: squash — contradicts team/MEMORY.md:3',
      'COPS memory conflict: rebase — contradicts team/MEMORY.md:9',
    ])
  })

  test('hides stored items while memory is off, and shows them once it is on again', MEMORY, async ($, on) => {
    const { clock, setMemory } = world({ on, replies: {}, stored: { inbox: [{ kind: 'promote', text: 'use pnpm here', modes: ['grill-description'] }] } })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('Inbox (1)') })
    setMemory(MEMORY_OFF)
    await clock.advance(120_000)
    await until({ check: async () => !(await text({ ui })).includes('Inbox') })
    setMemory(MEMORY_ON)
    await clock.advance(120_000)
    await until({ check: async () => (await text({ ui })).includes('Inbox (1)') })
    await ui.unmount()
  })

  test('collects nothing when memory is off, even with the memory_path option set', MEMORY, async ($, on) => {
    const { toasts } = world({ on, memory: MEMORY_OFF, replies: REPLIES })
    await oracle({ $, mode: 'triage-threads' })
    await sidekick({ $ })
    const ui = await mount({ $ })
    await until({ check: async () => (await text({ ui })).includes('2 agents') })
    expect(await text({ ui })).not.toContain('Inbox')
    expect(toasts).toEqual([])
    await ui.unmount()
  })
})

describe('parseSuffixes', () => {
  test('finds memory-candidate, promote, conflict and open lines with the modes', () => {
    expect(parseSuffixes({ text: 'ok\nmemory-candidate: prefer early returns\nloaded: memory.md', modes: ['triage-threads', 'scout-repo'] }))
      .toEqual([{ kind: 'memory-candidate', text: 'prefer early returns', modes: ['triage-threads', 'scout-repo'] }])
    expect(parseSuffixes({ text: 'promote: use pnpm here', modes: ['grill-description'] }))
      .toEqual([{ kind: 'promote', text: 'use pnpm here', modes: ['grill-description'] }])
    expect(parseSuffixes({ text: 'conflict: squash — contradicts team/MEMORY.md:3', modes: ['review-pr'] }))
      .toEqual([{ kind: 'conflict', text: 'squash — contradicts team/MEMORY.md:3', modes: ['review-pr'] }])
    expect(parseSuffixes({ text: 'committed: no\nopen: rename the flag?' })).toEqual([{ kind: 'open', text: 'rename the flag?' }])
  })

  test('reads learn-feedback\'s promote list', () => {
    expect(parseSuffixes({ text: 'team:\n  recorded: none\npromote:\n  - use pnpm here\n  - none\nconflict: x', modes: ['learn-feedback'] })).toEqual([
      { kind: 'promote', text: 'use pnpm here', modes: ['learn-feedback'] },
      { kind: 'conflict', text: 'x', modes: ['learn-feedback'] },
    ])
  })

  test('skips none, other lines, and duplicates', () => {
    expect(parseSuffixes({ text: 'open: none\nloaded: memory.md\npersonal:\n  - not a promote' })).toEqual([])
    expect(parseSuffixes({ text: 'conflict: x\nconflict: x\npromote: x' })).toEqual([{ kind: 'conflict', text: 'x' }, { kind: 'promote', text: 'x' }])
  })
})
