import type { InboxItem } from '../types'

// Which lines of a cops agent's result the memory inbox collects.

const KINDS: InboxItem['kind'][] = ['memory-candidate', 'promote', 'conflict', 'open']

// The memory lines of a result, each kind + text once, with the pr-oracle modes of the call that returned them:
//   "memory-candidate: prefer early returns", modes ['triage-threads']
//                                            → [{ kind: 'memory-candidate', text: 'prefer early returns', modes: ['triage-threads'] }]
//   "promote: run pnpm lint before pushing"  → [{ kind: 'promote', text: 'run pnpm lint before pushing', modes }]
//   "promote:\n  - use pnpm\n  - none"       → [{ kind: 'promote', text: 'use pnpm', modes }] (learn-feedback's list)
//   "conflict: X — contradicts Y in team"    → [{ kind: 'conflict', text: 'X — contradicts Y in team', modes }]
//   "open: rename the flag?", no modes       → [{ kind: 'open', text: 'rename the flag?', modes: undefined }]
//   "open: none", "loaded: memory.md"        → []
//   "conflict: X" twice                      → one item
export const parseSuffixes = ({ text, modes }: { text: string; modes?: string[] }): InboxItem[] => {
  const items: InboxItem[] = []
  // The kind of a `promote:` line that heads a list of its rules below it.
  let listKind: InboxItem['kind'] | undefined
  for (const line of text.split('\n')) {
    const named = /^\s*([a-z-]+):\s*(.*?)\s*$/.exec(line)
    const bullet = /^\s+-\s+(.+?)\s*$/.exec(line)?.[1]
    const kind = named ? KINDS.find(one => one === named[1]) : bullet ? listKind : undefined
    const body = named ? named[2] : bullet
    if (named || !bullet) listKind = named && !named[2] ? kind : undefined
    if (!kind || !body || body === 'none' || items.some(one => one.kind === kind && one.text === body)) continue
    items.push({ kind, text: body, modes })
  }
  return items
}
