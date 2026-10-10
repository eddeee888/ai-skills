import type { EngineInterface, Register } from 'claude-code'

// Shows COPS memory state and the current branch's PR and CI in the status line.

const REFRESH_MS = 120_000
// Bash commands that can change the branch, its PR, or its CI.
const BRANCH_COMMAND = /\b(git\s+(checkout|switch|commit|push|pull|merge|rebase|reset)|gh\s+pr)\b/
const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
const PASSED = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])

type Check = { conclusion?: string | null; state?: string | null; status?: string | null }
type PullRequest = { number: number; state: string; isDraft?: boolean; statusCheckRollup?: Check[] | null }

// Reads memory state from the session-start hook's own output, so both agree.
export const describeMemory = (context: string): string => {
  if (!context.includes('COPS memory root:')) {
    return context.includes('not configured') ? 'memory off' : 'memory ✗ bad path'
  }
  const login = /^COPS memory login: (\S+)$/m.exec(context)?.[1]
  return login ? `memory ✓ ${login}` : 'memory ✓ no login'
}

export const describeChecks = (checks: readonly Check[]): string => {
  if (checks.length === 0) return 'no CI'
  const results = checks.map(check => (check.conclusion || check.state || '').toUpperCase())
  const failed = results.filter(result => FAILED.has(result)).length
  if (failed > 0) return `CI ✗ ${failed}/${checks.length}`
  const passed = results.filter(result => PASSED.has(result)).length
  return passed === checks.length ? 'CI ✓' : `CI … ${passed}/${checks.length}`
}

export const describePullRequest = (pr: PullRequest): string => {
  const state = pr.isDraft ? 'draft' : pr.state.toLowerCase()
  const label = `PR #${pr.number}${state === 'open' ? '' : ` ${state}`}`
  return state === 'open' || state === 'draft' ? `${label} · ${describeChecks(pr.statusCheckRollup ?? [])}` : label
}

const run = async ($: EngineInterface, argv: readonly string[]) => {
  try {
    return await $.process.run(argv, { timeoutMs: 15_000 })
  } catch {
    return undefined
  }
}

const memoryPart = async ($: EngineInterface, path: string, login: string) => {
  const ran = await run($, ['bash', `${$.plugin.root}/hooks/memory-context.sh`, 'claude', path, login])
  return ran?.exitCode === 0 ? describeMemory(ran.stdout) : undefined
}

// Branch and PR; nothing outside a Git repository, branch alone when gh can't answer.
const branchPart = async ($: EngineInterface) => {
  const branch = await run($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch?.exitCode !== 0) return undefined
  const name = branch.stdout.trim()
  const pr = await run($, ['gh', 'pr', 'view', '--json', 'number,state,isDraft,statusCheckRollup'])
  if (pr?.exitCode === 0) {
    try {
      return describePullRequest(JSON.parse(pr.stdout) as PullRequest)
    } catch {
      return name
    }
  }
  return pr?.stderr.includes('no pull requests found') ? `${name} · no PR` : name
}

type Memory = { path: string; login: string }
let refreshing = false

const refresh = async ($: EngineInterface, memory: Memory) => {
  if (refreshing) return
  refreshing = true
  try {
    const parts = await Promise.all([memoryPart($, memory.path, memory.login), branchPart($)])
    $.ui.status(['cops', ...parts.filter(Boolean)].join(' · '))
  } finally {
    refreshing = false
  }
}

export const register: Register = (on, options) => {
  const memory: Memory = {
    path: typeof options.memory_path === 'string' ? options.memory_path : '',
    login: typeof options.memory_login === 'string' ? options.memory_login : '',
  }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void refresh($, memory)
    $.clock.every(REFRESH_MS, () => refresh($, memory))
    return started
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (BRANCH_COMMAND.test(e.command)) void refresh($, memory)
    return ran
  }).catch(($, e, next) => next(e))
}
