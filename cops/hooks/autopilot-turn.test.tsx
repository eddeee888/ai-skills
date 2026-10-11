import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

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
