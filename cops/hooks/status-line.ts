// What the status line says about COPS memory and the current branch's PR and CI.

const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
const PASSED = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])

type Check = { conclusion?: string | null; state?: string | null; status?: string | null }
export type PullRequest = { number: number; state: string; isDraft?: boolean; statusCheckRollup?: Check[] | null }

// The oracle reads only the first MEMORY_LIMIT lines of each MEMORY.md.
export const MEMORY_LIMIT = 200
const MEMORY_WARN = 180

/** Lines in the personal and team MEMORY.md; absent when the file isn't there. */
export type MemoryUsage = { personal?: number; team?: number }

// Counts lines the way an editor does, final newline or not:
// '' → 0, 'a' → 1, 'a\nb\n' → 2, 'a\n\nb' → 3.
export const countLines = ({ text }: { text: string }): number =>
  text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

// Reads memory state from the session-start hook's own output, so both agree.
export const describeMemory = ({ context, usage = {} }: { context: string; usage?: MemoryUsage }): string => {
  if (!context.includes('COPS memory root:')) {
    return context.includes('not configured') ? 'memory: ✗ (off)' : 'memory: ✗ (bad path)'
  }
  const login = /^COPS memory login: (\S+)$/m.exec(context)?.[1]
  return [
    login ? `memory: ${login}` : 'memory: ✗ (no login)',
    usage.personal === undefined ? undefined : `${usage.personal}/${MEMORY_LIMIT}${usage.personal >= MEMORY_LIMIT ? ' over' : ''}`,
    usage.team === undefined ? undefined : `team ${usage.team}/${MEMORY_LIMIT}${usage.team >= MEMORY_LIMIT ? ' over' : ''}`,
  ].filter(Boolean).join(' · ')
}

// A toast's text once a MEMORY.md nears the lines the oracle reads:
// { personal: 179, team: 12 } → undefined
// { personal: 185 } → 'COPS memory: personal MEMORY.md has 185 of 200 lines; …'
// { personal: 180, team: 200 } → 'COPS memory: personal MEMORY.md has 180 and team MEMORY.md has 200 of 200 lines; …'
export const describeCapacityWarning = ({ usage }: { usage: MemoryUsage }): string | undefined => {
  const full = [
    usage.personal !== undefined && usage.personal >= MEMORY_WARN ? `personal MEMORY.md has ${usage.personal}` : undefined,
    usage.team !== undefined && usage.team >= MEMORY_WARN ? `team MEMORY.md has ${usage.team}` : undefined,
  ].filter(Boolean)
  if (full.length === 0) return undefined
  return `COPS memory: ${full.join(' and ')} of ${MEMORY_LIMIT} lines; pr-oracle reads only the first ${MEMORY_LIMIT}.`
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
