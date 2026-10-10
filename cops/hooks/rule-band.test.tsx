import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptOrigin } from 'claude-code'
import { findRule } from './rule-band.ts'

const MEMORY_ON = 'COPS memory root: /memory\nCOPS memory login: octocat\n'
const MEMORY_OFF = 'COPS memory not configured: PR_MEMORY_PATH is unset, so pr-oracle runs without memory.\n'
const MEMORY = { options: { memory_path: '~/mem', memory_login: 'octocat' } }

type Ui = Awaited<ReturnType<Engine['ui']['mount']>>

// Answers what the plugin asks of the engine, and records what it puts in the prompt box.
const world = ({ on, memory = MEMORY_ON }: { on: On; memory?: string }): { fills: string[] } => {
  const fills: string[] = []
  mock.clock(on)
  on('process.run', ($, e) => ({
    value: {
      exitCode: 0, stdout: e.argv[0] === 'bash' ? memory : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false,
    },
  }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.fill', ($, e) => {
    fills.push(e.text)
    return { isFilled: true }
  })
  // The engine's own band: what the plugin hands on when it has nothing to offer.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  return { fills }
}

const submit = async ({ $, text, origin = { kind: 'composer' } }: { $: Engine; text: string; origin?: PromptOrigin }): Promise<void> => {
  await $.prompt.submit({ text, wait: false, origin })
}

const mount = ({ $, surface }: { $: Engine; surface: 'terminal' | 'desktop' }): Promise<Ui> =>
  $.ui.mount({
    plugin: 'cops', surface, component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })

const band = async ({ ui }: { ui: Ui }): Promise<string | undefined> => (await ui.find({ type: 'Text', text: /Remember “/ }))?.text

describe('rule band', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`offers "from now on" rules to remember personally (${surface})`, MEMORY, async ($, on) => {
      const { fills } = world({ on })
      await submit({ $, text: 'from now on use pnpm. Thanks' })
      const ui = await mount({ $, surface })
      expect(await band({ ui })).toBe('Remember “from now on use pnpm.”?')
      await ui.press({ key: 'remember-personally' })
      expect(fills).toEqual(['Remember this rule: from now on use pnpm.'])
      expect(await band({ ui })).toBeUndefined()
      expect(await ui.find({ text: 'engine band' })).toBeDefined()
      await ui.unmount()
    })
  }

  test('offers "never" rules to record for the team', MEMORY, async ($, on) => {
    const { fills } = world({ on })
    await submit({ $, text: 'Looks good. Never do force pushes!' })
    const ui = await mount({ $, surface: 'terminal' })
    expect(await band({ ui })).toBe('Remember “Never do force pushes!”?')
    await ui.press({ key: 'record-team' })
    expect(fills).toEqual(['record-team: Never do force pushes!'])
    expect(await band({ ui })).toBeUndefined()
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
    await ui.unmount()
  })

  test('dismiss clears the offer without filling the prompt', MEMORY, async ($, on) => {
    const { fills } = world({ on })
    await submit({ $, text: 'always run the tests' })
    const ui = await mount({ $, surface: 'terminal' })
    await ui.press({ key: 'dismiss' })
    expect(fills).toEqual([])
    expect(await band({ ui })).toBeUndefined()
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
    await ui.unmount()
  })

  test('yields to a survey', MEMORY, async ($, on) => {
    world({ on })
    await submit({ $, text: 'never do Y' })
    const ui = await $.ui.mount({
      plugin: 'cops', surface: 'terminal', component: 'AbovePrompt',
      props: { hasSurvey: true, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    })
    expect(await band({ ui })).toBeUndefined()
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
    await ui.unmount()
  })

  const skipped: [string, string, PromptOrigin?][] = [
    ['prompts that already say remember', 'Remember: always squash'],
    ['record-team prompts', 'record-team: never force-push'],
    ['slash commands', '/review always check tests'],
    ['plugin prompts', 'always run tests', { kind: 'plugin', name: 'other' }],
    ['prompts with no rule', 'it always fails on CI'],
  ]
  for (const [name, text, origin] of skipped) {
    test(`makes no offer for ${name}`, MEMORY, async ($, on) => {
      world({ on })
      await submit({ $, text, origin })
      const ui = await mount({ $, surface: 'terminal' })
      expect(await band({ ui })).toBeUndefined()
      expect(await ui.find({ text: 'engine band' })).toBeDefined()
      await ui.unmount()
    })
  }

  // No plugin option: memory-context.sh reports memory on from PR_MEMORY_PATH.
  test('offers rules when memory is set only by PR_MEMORY_PATH', async ($, on) => {
    world({ on })
    await submit({ $, text: 'from now on use X' })
    const ui = await mount({ $, surface: 'terminal' })
    expect(await band({ ui })).toBe('Remember “from now on use X”?')
    await ui.unmount()
  })

  test('makes no offer when memory is off', MEMORY, async ($, on) => {
    world({ on, memory: MEMORY_OFF })
    await submit({ $, text: 'from now on use X' })
    const ui = await mount({ $, surface: 'terminal' })
    expect(await band({ ui })).toBeUndefined()
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
    await ui.unmount()
  })
})

describe('findRule', () => {
  test('finds the rule-like sentence the person typed', () => {
    expect(findRule({ text: 'from now on use pnpm. Thanks', origin: 'composer' })).toBe('from now on use pnpm.')
    expect(findRule({ text: 'Looks good.\nPlease never push to main!', origin: 'bridge' })).toBe('Please never push to main!')
    expect(findRule({ text: 'Stop doing drive-bys', origin: 'composer' })).toBe('Stop doing drive-bys')
  })

  test('skips consent already given, commands, other origins, and prompts with no rule', () => {
    expect(findRule({ text: 'remember: always squash', origin: 'composer' })).toBeUndefined()
    expect(findRule({ text: 'record-team: never force-push', origin: 'composer' })).toBeUndefined()
    expect(findRule({ text: '/review always', origin: 'composer' })).toBeUndefined()
    expect(findRule({ text: 'always run tests', origin: 'plugin' })).toBeUndefined()
    expect(findRule({ text: 'always run tests', origin: 'sdk' })).toBeUndefined()
    expect(findRule({ text: 'looks good, thanks', origin: 'composer' })).toBeUndefined()
  })
})
