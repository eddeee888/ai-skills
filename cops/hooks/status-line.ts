// What the status line says about COPS memory and the current branch's PR and CI.

const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
const PASSED = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])

type Check = { conclusion?: string | null; state?: string | null; status?: string | null }
export type PullRequest = { number: number; state: string; isDraft?: boolean; statusCheckRollup?: Check[] | null }

// Reads memory state from the session-start hook's own output, so both agree.
export const describeMemory = (context: string): string => {
  if (!context.includes('COPS memory root:')) {
    return context.includes('not configured') ? 'memory: ✗ (off)' : 'memory: ✗ (bad path)'
  }
  const login = /^COPS memory login: (\S+)$/m.exec(context)?.[1]
  return login ? `memory: ${login}` : 'memory: ✗ (no login)'
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
