import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import { countLines, describeCapacityWarning, describeMemory } from './status-line.ts'

const ok = (stdout: string): ProcessRunResult => ({
  exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false,
})
const failed = (stderr: string): ProcessRunResult => ({
  exitCode: 1, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false,
})

const MEMORY_ON = 'COPS memory root: /memory\nPass this exact path...\nCOPS memory login: octocat\nPass `memory-login: octocat`...\n'
const PERSONAL = '/memory/memory/users/octocat/MEMORY.md'
const TEAM = '/memory/memory/team/MEMORY.md'
const lines = ({ count }: { count: number }): string => 'rule\n'.repeat(count)
const MEMORY_OFF = 'COPS memory not configured: PR_MEMORY_PATH is unset, so pr-oracle runs without memory.\n'

// Answers the commands and reads the status line makes, and resolves with the first status it sets.
const world = (
  on: On,
  answers: { memory: string; files?: Record<string, string> },
) => {
  const argvs: string[][] = []
  const toasts: string[] = []
  const reads: string[] = []
  const clock = mock.clock(on)
  on('fs.read', ($, e) => {
    reads.push(e.path)
    const text = answers.files?.[e.path]
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('process.run', ($, e) => {
    argvs.push([...e.argv])
    // The threads pane's git and gh calls find no repository.
    return { value: e.argv[0] === 'bash' ? ok(answers.memory) : failed('fatal: not a git repository') }
  })
  const status = new Promise<string | undefined>(resolve => {
    on('ui.status', ($, e) => {
      resolve(e.text)
      return { value: undefined }
    })
  })
  return { argvs, status, toasts, reads, clock }
}

const start = ($: Engine) => $.session.start({ cwd: '/repo', surface: null, isInteractive: false })

describe('status line', () => {
  test('shows only memory, with no PR or CI', async ($, on) => {
    const { status, argvs } = world(on, { memory: MEMORY_ON, files: { [PERSONAL]: lines({ count: 12 }), [TEAM]: lines({ count: 40 }) } })
    await start($)
    expect(await status).toBe('memory: octocat (12/200,40/200)')
    expect(argvs.some(argv => argv.join(' ').startsWith('gh pr view --json number,state'))).toBe(false)
  })

  test('says when memory is off', async ($, on) => {
    const { status } = world(on, { memory: MEMORY_OFF })
    await start($)
    expect(await status).toBe('memory: ✗ (off)')
  })

  test('passes the configured memory options to the session-start script', { options: { memory_path: '~/mem', memory_login: 'octocat' } }, async ($, on) => {
    const { status, argvs } = world(on, { memory: MEMORY_ON })
    await start($)
    await status
    expect(argvs.find(argv => argv[0] === 'bash')?.slice(2)).toEqual(['claude', '~/mem', 'octocat'])
  })
})

describe('memory capacity', () => {
  test('shows lines used in the personal and team MEMORY.md', async ($, on) => {
    const { status, toasts } = world(on, { memory: MEMORY_ON, files: { [PERSONAL]: lines({ count: 12 }), [TEAM]: lines({ count: 40 }) } })
    await start($)
    expect(await status).toBe('memory: octocat (12/200,40/200)')
    expect(toasts).toEqual([])
  })

  test('counts a missing team file as 0 lines', async ($, on) => {
    const { status } = world(on, { memory: MEMORY_ON, files: { [PERSONAL]: lines({ count: 12 }) } })
    await start($)
    expect(await status).toBe('memory: octocat (12/200,0/200)')
  })

  test('warns once from 180 lines', async ($, on) => {
    const { status, toasts, reads, clock } = world(on, { memory: MEMORY_ON, files: { [PERSONAL]: lines({ count: 185 }) } })
    await start($)
    expect(await status).toBe('memory: octocat (185/200,0/200)')
    expect(toasts).toEqual(['COPS memory: personal MEMORY.md has 185 of 200 lines; pr-oracle reads only the first 200.'])
    await clock.advance(120_000)
    expect(reads.filter(path => path === PERSONAL)).toHaveLength(2)
    expect(toasts).toHaveLength(1)
  })

  test('warns about a team file over 200 lines', async ($, on) => {
    const { status, toasts } = world(on, { memory: MEMORY_ON, files: { [PERSONAL]: lines({ count: 12 }), [TEAM]: lines({ count: 204 }) } })
    await start($)
    expect(await status).toBe('memory: octocat (12/200,204/200)')
    expect(toasts).toEqual(['COPS memory: team MEMORY.md has 204 of 200 lines; pr-oracle reads only the first 200.'])
  })

  test('reads nothing while memory is off', async ($, on) => {
    const { status, toasts, reads } = world(on, { memory: MEMORY_OFF, files: { [PERSONAL]: lines({ count: 190 }) } })
    await start($)
    expect(await status).toBe('memory: ✗ (off)')
    expect(reads).toEqual([])
    expect(toasts).toEqual([])
  })
})

describe('descriptions', () => {
  test('memory states', () => {
    expect(describeMemory({ context: 'COPS memory root: /m\nCOPS memory login unset: ...' })).toBe('memory: ✗ (no login)')
    expect(describeMemory({ context: MEMORY_OFF })).toBe('memory: ✗ (off)')
    expect(describeMemory({ context: 'COPS memory unavailable: the configured path is not a Git root.' })).toBe('memory: ✗ (bad path)')
  })

  test('memory usage', () => {
    expect(describeMemory({ context: MEMORY_ON })).toBe('memory: octocat (0/200,0/200)')
    expect(describeMemory({ context: MEMORY_ON, usage: { personal: 205, team: 3 } })).toBe('memory: octocat (205/200,3/200)')
    expect(describeMemory({ context: 'COPS memory root: /m\nCOPS memory login unset: ...', usage: { team: 5 } })).toBe('memory: ✗ (no login)')
    expect(describeMemory({ context: MEMORY_OFF, usage: { personal: 5 } })).toBe('memory: ✗ (off)')
  })

  test('capacity warnings', () => {
    expect(describeCapacityWarning({ usage: { personal: 179, team: 179 } })).toBeUndefined()
    expect(describeCapacityWarning({ usage: {} })).toBeUndefined()
    expect(describeCapacityWarning({ usage: { personal: 180, team: 200 } })).toBe(
      'COPS memory: personal MEMORY.md has 180 and team MEMORY.md has 200 of 200 lines; pr-oracle reads only the first 200.',
    )
  })

  test('line counts', () => {
    expect(countLines({ text: '' })).toBe(0)
    expect(countLines({ text: 'a' })).toBe(1)
    expect(countLines({ text: 'a\nb\n' })).toBe(2)
    expect(countLines({ text: 'a\n\nb' })).toBe(3)
  })
})
