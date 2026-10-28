import type { RuleUsage } from '../types'
import { MEMORY_LIMIT } from './status-line.ts'

// How often each remembered rule fires in pr-oracle's brief-task, sweep-diff and review-pr replies, and which have gone stale.

const DAY_MS = 86_400_000
// A rule last seen this long ago, or never, is stale.
export const STALE_MS = 30 * DAY_MS
// A rule seen this many times within STALE_MS is a CLAUDE.md candidate.
export const OFTEN_USES = 5
// The most recent times kept per rule; enough to tell OFTEN_USES within STALE_MS.
const RECENT_LIMIT = 10

// A line without its last trailing parenthesized group, which may hold parentheses of its own:
//   'prefer early returns  (stated by user 2x)'                → 'prefer early returns'
//   'use `x()` (not `y`)  (seen 2x, from you)'                → 'use `x()` (not `y`)'
//   'cite the doc (see (a) and (b))'                           → 'cite the doc'
//   'no evidence here'                                         → 'no evidence here'
//   'prefer early returns  (seen 2x)  applies-to: **/*.md'     → 'prefer early returns'
const stripEvidence = ({ text }: { text: string }): string => {
  const trimmed = text.replace(/\s+applies-to:.*$/, '').trimEnd()
  if (!trimmed.endsWith(')')) {
    return trimmed
  }
  let depth = 0
  for (let at = trimmed.length - 1; at >= 0; at--) {
    if (trimmed[at] === ')') {
      depth++
    }
    if (trimmed[at] === '(') {
      depth--
    }
    if (depth === 0) {
      return trimmed.slice(0, at).trimEnd()
    }
  }
  return trimmed
}

// A rule's leading permanent ID, `[U-nnn]` personal, `[C-nnn]` candidate or `[T-nnn]` team, with the ID in group 1:
//   '[U-014] prefer early returns' → 'U-014'
const RULE_ID = /^\s*\[([UCT]-\d+)\]\s*/

// Rule text as matching compares it, without its ID:
//   '  Prefer   early returns. '    → 'prefer early returns'
//   'Keep tests beside code;:'      → 'keep tests beside code'
//   '[U-014] Prefer early returns'  → 'prefer early returns'
export const normalize = ({ text }: { text: string }): string =>
  text.replace(RULE_ID, '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[\s.,;:!?…]+$/, '')

// A short key for a rule without its ID or evidence, so a changing `2x` or a new ID keeps it (FNV-1a over the normalized text):
//   'Prefer early returns.', 'prefer  early returns' and '[U-014] Prefer early returns' → the same key
export const hashRule = ({ text }: { text: string }): string => {
  let hash = 0x811c9dc5
  for (const char of normalize({ text })) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

// The rules of a MEMORY.md's first MEMORY_LIMIT lines, the ones the oracle reads, with their IDs but without their evidence: top-level `- ` bullets under `## ` headings:
//   '# Memory\n- loose\n## Code\n- prefer early returns  (stated by user 2x)\n  - detail' → ['prefer early returns']
//   '## Everywhere\n- [U-014] prefer early returns  (stated by user)'                      → ['[U-014] prefer early returns']
//   a rule on line MEMORY_LIMIT + 1                                                          → left out
export const parseEntries = ({ text }: { text: string }): string[] => {
  const rules: string[] = []
  let isUnderHeading = false
  for (const line of text.split('\n').slice(0, MEMORY_LIMIT)) {
    if (/^#{1,6}\s/.test(line)) {
      isUnderHeading = line.startsWith('## ')
    }
    const bullet = /^- (.+)$/.exec(line)?.[1]
    if (!isUnderHeading || !bullet) {
      continue
    }
    const rule = stripEvidence({ text: bullet })
    if (rule) {
      rules.push(rule)
    }
  }
  return rules
}

// The rules a pr-oracle brief-task or sweep-diff reply cites, without their evidence:
//   '- prefer early returns  (stated by user 2x, from you)'                          → ['prefer early returns']
//   'caller only:\n- ask before pushing  (seen 2x, from you)'                        → ['ask before pushing']
//   '- a.ts:3  nested ifs  — rule: prefer early returns (stated by user 2x, from team)' → ['prefer early returns']
//   '- a.ts:3  nested ifs  — rule: [U-014] prefer early returns (stated by user)'     → ['[U-014] prefer early returns']
//   '- a.ts:3  nested ifs  — rule: [U-014]'                                           → ['[U-014]']
//   'no relevant memory', 'clean'                                                    → []
export const parseReply = ({ text }: { text: string }): string[] =>
  text.split('\n').flatMap(line => {
    const bullet = /^\s*- (.+)$/.exec(line)?.[1]
    if (!bullet) {
      return []
    }
    const rule = stripEvidence({ text: /\s—\s*rule:\s*(.+)$/.exec(bullet)?.[1] ?? bullet })
    return rule ? [rule] : []
  })

// The rules a sweep-diff reply flags: only its `— rule:` lines, without their evidence:
//   '- a.ts:3  nested ifs  — rule: [U-014] prefer early returns (stated by user)' → ['[U-014] prefer early returns']
//   '- prefer early returns  (stated by user 2x, from you)'                       → []
//   'clean'                                                                      → []
export const parseFlagged = ({ text }: { text: string }): string[] =>
  text.split('\n').flatMap(line => {
    const rule = /^\s*- .*?\s—\s*rule:\s*(.+)$/.exec(line)?.[1]
    const stripped = rule ? stripEvidence({ text: rule }) : ''
    return stripped ? [stripped] : []
  })

// The rules a review-pr reply names in its comments' private `rule:` fields, without their evidence:
//   '    rule: [U-014] prefer early returns (stated by user)'   → ['[U-014] prefer early returns']
//   '  - rule: "prefer early returns"'                          → ['prefer early returns']
//   '    rule: null', '    rule:', 'no comments'                → []
export const parseReviewRules = ({ text }: { text: string }): string[] =>
  text.split('\n').flatMap(line => {
    const value = /^\s*(?:- )?rule:\s*(.*)$/.exec(line)?.[1] ?? ''
    const rule = stripEvidence({ text: value.trim().replace(/^(["'])(.*)\1$/, '$2') })
    return rule && rule !== 'null' ? [rule] : []
  })

// The entries a reply's rules match, each once: the same ID, or text equal once normalized, or one a prefix of the other:
//   entries ['prefer early returns', 'keep tests beside code'], cited ['Prefer early returns, always.'] → ['prefer early returns']
//   entries ['prefer early returns'], cited ['prefer'] → ['prefer early returns']
//   entries ['prefer early returns'], cited ['use pnpm'] → []
//   entries ['[U-014] prefer early returns'], cited ['[U-014]'] → ['[U-014] prefer early returns']
export const matchEntries = ({ entries, cited }: { entries: string[]; cited: string[] }): string[] => {
  const ids = cited.flatMap(text => RULE_ID.exec(text)?.[1] ?? [])
  const rules = cited.map(text => normalize({ text })).filter(Boolean)
  const matched = entries.filter(entry => {
    const own = normalize({ text: entry })
    const id = RULE_ID.exec(entry)?.[1]
    return own !== '' && ((id !== undefined && ids.includes(id)) || rules.some(rule => rule === own || rule.startsWith(own) || own.startsWith(rule)))
  })
  return matched.filter((entry, index) => matched.findIndex(other => normalize({ text: other }) === normalize({ text: entry })) === index)
}

// The usage after one reply matched `keys` (cited) and `flaggedKeys` (flagged by a sweep-diff line), at `now`; a flagged key also counts as cited:
//   {}, ['k'], [], 5 → { k: { count: 1, firstSeen: 5, lastSeen: 5, recent: [5] } }
//   {}, [], ['k'], 5 → { k: { count: 1, flagged: 1, firstSeen: 5, lastSeen: 5, recent: [5] } }
//   { k: { count: 1, flagged: 1, firstSeen: 5, lastSeen: 5, recent: [5] } }, ['k'], [], 9
//     → { k: { count: 2, flagged: 1, firstSeen: 5, lastSeen: 9, recent: [5, 9] } }   (a citation leaves flagged alone)
//   { k: { count: 1, firstSeen: 5, lastSeen: 5, recent: [5] } }, [], ['k'], 9
//     → { k: { count: 2, flagged: 1, firstSeen: 5, lastSeen: 9, recent: [5, 9] } }   (no stored flagged reads as 0)
//   { k: { count: 10, firstSeen: 1, lastSeen: 10, recent: [1, 2, …, 10] } }, ['k'], [], 11
//     → { k: { count: 11, firstSeen: 1, lastSeen: 11, recent: [2, 3, …, 11] } }   (RECENT_LIMIT keeps the newest 10)
export const countUses = ({ usage, keys, flaggedKeys, now }: { usage: Record<string, RuleUsage>; keys: string[]; flaggedKeys: string[]; now: number }): Record<string, RuleUsage> => ({
  ...usage,
  ...Object.fromEntries([...new Set([...keys, ...flaggedKeys])].map(key => {
    const prior = usage[key]
    const flagged = flaggedKeys.includes(key) ? (prior?.flagged ?? 0) + 1 : prior?.flagged
    return [key, { count: (prior?.count ?? 0) + 1, flagged, firstSeen: prior?.firstSeen ?? now, lastSeen: now, recent: [...(prior?.recent ?? []), now].slice(-RECENT_LIMIT) }]
  })),
})

// What the store holds under `ruleUsage`; anything there that isn't a rule's usage is left out.
export const toRuleUsage = ({ stored }: { stored: unknown }): Record<string, RuleUsage> => {
  const isUsage = (value: unknown): value is RuleUsage =>
    typeof value === 'object' && value !== null
    && 'count' in value && typeof value.count === 'number'
    && 'firstSeen' in value && typeof value.firstSeen === 'number'
    && 'lastSeen' in value && typeof value.lastSeen === 'number'
    && (!('flagged' in value) || value.flagged === undefined || typeof value.flagged === 'number')
    && 'recent' in value && Array.isArray(value.recent) && value.recent.every(one => typeof one === 'number')
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return {}
  }
  return Object.fromEntries(Object.entries(stored).filter(([, value]) => isUsage(value)))
}

/** One remembered rule with its usage; `use` is unset for a rule never seen. */
export type RuleRow = { rule: string; key: string; use?: RuleUsage; recentUses: number }

// Each entry once with its usage, sorted into stale (last seen STALE_MS+ ago, or never) and often (OFTEN_USES+ uses within STALE_MS):
//   entries ['a', 'b'], usage { [key a]: lastSeen 31 days ago }, now → { stale: [a, b], often: [] }
//   entries ['a'], usage { [key a]: 5 recent within 30 days }, now   → { stale: [], often: [a] }
//   entries ['a'], usage { [key a]: 2 recent within 30 days }, now   → { stale: [], often: [] }    (used, but not often)
//   entries ['d', 'D.'], usage {}, now                               → { stale: [d], often: [] }   (same key, first entry kept)
export const describeRules = ({ entries, usage, now }: { entries: string[]; usage: Record<string, RuleUsage>; now: number }): { stale: RuleRow[]; often: RuleRow[] } => {
  const rows = entries
    .map(rule => {
      const key = hashRule({ text: rule })
      const use = usage[key]
      return { rule, key, use, recentUses: use?.recent.filter(at => now - at < STALE_MS).length ?? 0 }
    })
    .filter((row, index, all) => all.findIndex(other => other.key === row.key) === index)
  return {
    stale: rows.filter(row => !row.use || now - row.use.lastSeen >= STALE_MS),
    often: rows.filter(row => row.recentUses >= OFTEN_USES).sort((a, b) => b.recentUses - a.recentUses),
  }
}

// A rule's count, how often a sweep flagged it (only above 0), and when it was last seen:
//   no use                                      → 'never seen'
//   count 3, last seen earlier today            → 'seen 3× · last seen today'
//   count 5, flagged 3, last seen 2 days ago    → 'seen 5× · flagged 3× · last seen 2d ago'
//   count 1, flagged 0, last seen 31 days ago   → 'seen 1× · last seen 31d ago'
export const describeUse = ({ use, now }: { use?: RuleUsage; now: number }): string => {
  if (!use) {
    return 'never seen'
  }
  const days = Math.floor((now - use.lastSeen) / DAY_MS)
  const flagged = (use.flagged ?? 0) > 0 ? ` · flagged ${use.flagged}×` : ''
  return `seen ${use.count}×${flagged} · last seen ${days === 0 ? 'today' : `${days}d ago`}`
}
