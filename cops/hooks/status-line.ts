// What the status line says about COPS memory: its state, and how full each MEMORY.md is.

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
// A missing file counts as 0 lines, since the oracle reads nothing from it:
// { personal: 12, team: 40 } → 'memory: octocat (12/200,40/200)'
// { personal: 12 } → 'memory: octocat (12/200,0/200)'
export const describeMemory = ({ context, usage = {} }: { context: string; usage?: MemoryUsage }): string => {
  if (!context.includes('COPS memory root:')) {
    return context.includes('not configured') ? 'memory: ✗ (off)' : 'memory: ✗ (bad path)'
  }
  const login = /^COPS memory login: (\S+)$/m.exec(context)?.[1]
  if (!login) return 'memory: ✗ (no login)'
  return `memory: ${login} (${usage.personal ?? 0}/${MEMORY_LIMIT},${usage.team ?? 0}/${MEMORY_LIMIT})`
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
