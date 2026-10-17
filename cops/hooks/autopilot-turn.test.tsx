import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

type Ui = Awaited<ReturnType<Engine['ui']['mount']>>

// Answers what the plugin asks of the engine, with no PR on the branch.
const world = ({ on }: { on: On }): void => {
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => ({
    value: { exitCode: 1, stdout: '', stderr: 'no pull requests found', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'Skill' }, () => ({ result: { success: true, commandName: 'cops:pr-start' } }))
}

const mount = async ({ $ }: { $: Engine }): Promise<Ui> => {
  await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
  return $.ui.mount({
    plugin: 'cops', surface: 'terminal', component: 'Pane', requestId: 'cops-hq',
    props: { title: 'COPS HQ', isFocused: true, bodyColumns: 200, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
}

const until = async ({ check }: { check: () => Promise<boolean> }): Promise<void> => {
  for (let tries = 0; tries < 3000; tries++) {
    if (await check()) {
      return
    }
  }
  throw new Error('never happened')
}

describe('autopilot strip', () => {
  test('a prompt submitted after the turn ended reads running again', async ($, on) => {
    world({ on })
    const ui = await mount({ $ })
    await $.tool.call({ tool: 'Skill', skill: 'cops:pr-start', args: '--autopilot fix the thing' })
    await $.turn.complete({ answer: 'Confirm, or edit any line.' })
    await until({ check: async () => ((await ui.find({ type: 'Box' }))?.text ?? '').includes('stopped at fix') })
    await $.prompt.submit({ text: 'confirm', wait: false, origin: { kind: 'composer' } })
    await until({ check: async () => !((await ui.find({ type: 'Box' }))?.text ?? '').includes('stopped at fix') })
    expect((await ui.find({ type: 'Box' }))?.text).toContain('Autopilot')
    await ui.unmount()
  })
})

const PR_URL = 'https://github.com/o/r/pull/81'

describe('finished autopilot card', () => {
  test('Mark ready runs gh pr ready on the PR and the card reads ready after', async ($, on) => {
    // Answers what the plugin asks of the engine, with draft PR #81 on the branch carrying the author's
    // `Note:` thread; records each `gh pr ready` and toast, and reads the PR as ready once one ran.
    const ok = ({ stdout }: { stdout: string }): ProcessRunResult => ({
      exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false,
    })
    const readies: string[][] = []
    const toasts: string[] = []
    mock.clock(on)
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.status', () => ({ value: undefined }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('process.run', ($, e) => {
      if (e.argv[0] === 'git') {
        return { value: ok({ stdout: 'feat\n' }) }
      }
      if (e.argv[0] === 'gh' && e.argv[1] === 'pr' && e.argv[2] === 'ready') {
        readies.push([...e.argv])
        return { value: ok({ stdout: '' }) }
      }
      if (e.argv[0] === 'gh' && e.argv[1] === 'pr' && e.argv[2] === 'view') {
        return { value: ok({ stdout: JSON.stringify({ number: 81, url: PR_URL, isDraft: readies.length === 0 }) }) }
      }
      if (e.argv[0] === 'gh' && e.argv[1] === 'api') {
        const note = {
          id: 'n1', isResolved: false, isOutdated: false, path: 'src/a.ts', line: 3,
          comments: { totalCount: 1, nodes: [{ author: { login: 'octocat' }, body: '**Note:** why', url: 'https://example.com/n1' }] },
          first: { nodes: [{ author: { login: 'octocat' }, body: '**Note:** why', reactions: { nodes: [] } }] },
        }
        return { value: ok({ stdout: JSON.stringify({ data: { repository: { pullRequest: { author: { login: 'octocat' }, reviewThreads: { nodes: [note] } } } } }) }) }
      }
      return { value: { exitCode: 1, stdout: '', stderr: 'not answered', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('turn.complete', ($, e) => ({ text: e.answer }))
    on('tool.call', { tool: 'Skill' }, () => ({ result: { success: true, commandName: 'cops:pr-start' } }))
    const ui = await mount({ $ })
    const text = async (): Promise<string> => (await ui.find({ type: 'Box' }))?.text ?? ''
    await until({ check: async () => (await text()).includes('PR #81') })
    await $.tool.call({ tool: 'Skill', skill: 'cops:pr-start', args: '--autopilot fix the thing' })
    for (const stage of ['review', 'address', 'sync', 'note']) {
      await $.tool.call({ tool: 'Skill', skill: `cops:pr-${stage}`, args: `${PR_URL} — autopilot stage of this pr-start run` })
    }
    await $.turn.complete({ answer: 'Autopilot finished.' })
    await until({ check: async () => (await text()).includes('finished · still a draft') })
    expect(await text()).not.toContain('stopped at')
    await ui.press({ key: 'mark-ready' })
    expect(readies).toEqual([['gh', 'pr', 'ready', '81']])
    expect(toasts).toContain('PR #81 is ready for review')
    await until({ check: async () => !(await text()).includes('finished · still a draft') })
    expect(await text()).toContain('✓ ready')
    await ui.unmount()
  })
})
