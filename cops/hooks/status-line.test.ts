import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import { describeChecks, describeMemory, describePullRequest } from './status-line.ts'

const ok = (stdout: string): ProcessRunResult => ({
  exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false,
})
const failed = (stderr: string): ProcessRunResult => ({
  exitCode: 1, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false,
})

const MEMORY_ON = 'COPS memory root: /memory\nPass this exact path...\nCOPS memory login: octocat\nPass `memory-login: octocat`...\n'
const MEMORY_OFF = 'COPS memory not configured: PR_MEMORY_PATH is unset, so pr-oracle runs without memory.\n'

// Answers the commands the status line runs, and resolves with the first status it sets.
const world = (on: On, answers: { memory: string; branch?: ProcessRunResult; pr?: ProcessRunResult }) => {
  const argvs: string[][] = []
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('process.run', ($, e) => {
    argvs.push([...e.argv])
    if (e.argv[0] === 'bash') return { value: ok(answers.memory) }
    if (e.argv[0] === 'git') return { value: answers.branch ?? failed('fatal: not a git repository') }
    return { value: answers.pr ?? failed('no pull requests found for branch "main"') }
  })
  const status = new Promise<string | undefined>(resolve => {
    on('ui.status', ($, e) => {
      resolve(e.text)
      return { value: undefined }
    })
  })
  return { argvs, status }
}

const start = ($: Engine) => $.session.start({ cwd: '/repo', surface: null, isInteractive: false })

describe('status line', () => {
  test('shows memory, PR and CI on a branch with an open PR', async ($, on) => {
    const pr = { number: 45, state: 'OPEN', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }, { state: 'SUCCESS' }] }
    const { status } = world(on, { memory: MEMORY_ON, branch: ok('feat\n'), pr: ok(JSON.stringify(pr)) })
    await start($)
    expect(await status).toBe('cops · memory ✓ octocat · PR #45 · CI ✓')
  })

  test('says when the branch has no PR', async ($, on) => {
    const { status } = world(on, { memory: MEMORY_OFF, branch: ok('main\n') })
    await start($)
    expect(await status).toBe('cops · memory off · main · no PR')
  })

  test('leaves out the branch outside a Git repository', async ($, on) => {
    const { status, argvs } = world(on, { memory: MEMORY_OFF })
    await start($)
    expect(await status).toBe('cops · memory off')
    expect(argvs.some(argv => argv[0] === 'gh')).toBe(false)
  })

  test('passes the configured memory options to the session-start script', { options: { memory_path: '~/mem', memory_login: 'octocat' } }, async ($, on) => {
    const { status, argvs } = world(on, { memory: MEMORY_ON })
    await start($)
    await status
    expect(argvs.find(argv => argv[0] === 'bash')?.slice(2)).toEqual(['claude', '~/mem', 'octocat'])
  })
})

describe('descriptions', () => {
  test('memory states', () => {
    expect(describeMemory(MEMORY_ON)).toBe('memory ✓ octocat')
    expect(describeMemory('COPS memory root: /m\nCOPS memory login unset: ...')).toBe('memory ✓ no login')
    expect(describeMemory(MEMORY_OFF)).toBe('memory off')
    expect(describeMemory('COPS memory unavailable: the configured path is not a Git root.')).toBe('memory ✗ bad path')
  })

  test('CI states', () => {
    expect(describeChecks([])).toBe('no CI')
    expect(describeChecks([{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }])).toBe('CI ✗ 1/2')
    expect(describeChecks([{ conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS', conclusion: '' }])).toBe('CI … 1/2')
    expect(describeChecks([{ state: 'PENDING' }])).toBe('CI … 0/1')
  })

  test('PR states', () => {
    expect(describePullRequest({ number: 1, state: 'OPEN', isDraft: true, statusCheckRollup: [] })).toBe('PR #1 draft · no CI')
    expect(describePullRequest({ number: 2, state: 'MERGED', statusCheckRollup: [{ conclusion: 'FAILURE' }] })).toBe('PR #2 merged')
  })
})
