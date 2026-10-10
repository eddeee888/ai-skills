import type { AgentCall } from '../types'

// What the COPS HQ pane checks of the cops agents' orchestration: which handoffs the
// running cops skill owes, whether an oracle read the files its modes need, and which
// tool calls of a cops agent break its agent file's rules. Nothing here blocks a call.

/** One handoff a cops skill owes: an oracle call in `label`'s modes, or a spawn of one of `agents`. */
export type Handoff = { label: string; agents: string[] }

const ORACLE = ['cops:pr-oracle']
const SIDEKICK = ['cops:pr-sidekick']

// Each cops skill's handoffs in skill order: the oracle modes of its `Call points:` entry and the
// handoffs of its `Required handoffs:` entry in CONVENTIONS-orchestration.md, each once.
// scripts/validate.sh compares those lines with the `'cops:<skill>': [` keys and `label:` values
// here, one skill or handoff per line.
export const EXPECTED_HANDOFFS: Record<string, Handoff[]> = {
  'cops:pr-address': [
    { label: 'triage-threads + scout-repo', agents: ORACLE },
    { label: '5a batches', agents: SIDEKICK },
    { label: 'sweep-diff', agents: ORACLE },
    { label: '5b research', agents: ['Explore', 'general-purpose'] },
  ],
  'cops:pr-sync': [
    { label: 'scout-repo', agents: ORACLE },
    { label: 'brief-task', agents: ORACLE },
    { label: 'Steps 2–6', agents: SIDEKICK },
    { label: 'grill-description', agents: ORACLE },
  ],
  'cops:pr-review': [
    { label: 'review-pr', agents: ORACLE },
  ],
  'cops:pr-note': [
    { label: 'draft-author-notes', agents: ORACLE },
  ],
  'cops:pr-start': [
    { label: 'scout-repo + brief-task', agents: ORACLE },
    { label: 'fix loop', agents: SIDEKICK },
    { label: 'sweep-diff', agents: ORACLE },
  ],
}

// The labels of a skill's handoffs that a spawn ticks. An oracle handoff is ticked by a call
// naming each of its modes:
//   'cops:pr-start', 'cops:pr-oracle', modes ['scout-repo', 'brief-task'] → ['scout-repo + brief-task']
//   'cops:pr-sync', 'cops:pr-oracle', modes ['scout-repo', 'brief-task']  → ['scout-repo', 'brief-task']
//   'cops:pr-start', 'cops:pr-oracle', modes ['scout-repo']               → []
//   'cops:pr-start', 'cops:pr-sidekick'                                   → ['fix loop']
//   'cops:pr-address', 'Explore'                                          → ['5b research']
//   a skill with no handoffs                                              → []
export const tickedBy = ({ skill, agent, modes }: { skill: string; agent: string; modes: string[] }): string[] =>
  (EXPECTED_HANDOFFS[skill] || [])
    .filter(handoff => handoff.agents.includes(agent) && (agent !== 'cops:pr-oracle' || handoff.label.split(' + ').every(mode => modes.includes(mode))))
    .map(handoff => handoff.label)

// The files an oracle reply's `loaded:` lacks: memory.md, and modes/<mode>.md for each mode it ran.
// Entries match by their end, so a path through ../references/pr-oracle/ counts:
//   'loaded: memory.md, modes/sweep-diff.md', modes ['sweep-diff']      → []
//   'loaded: ../references/pr-oracle/memory.md, …/modes/sweep-diff.md'   → []
//   'loaded:\n  - memory.md\n  - modes/review-pr.md', modes ['review-pr'] → [] (review-mode YAML)
//   'loaded: memory.md', modes ['sweep-diff']                            → ['modes/sweep-diff.md']
//   no `loaded:` line, modes ['scout-repo']                             → ['memory.md', 'modes/scout-repo.md']
export const checkLoaded = ({ text, modes }: { text: string; modes: string[] }): string[] => {
  const found = /^\s*loaded:[ \t]*(.*)((?:\r?\n\s+- .*)*)/m.exec(text)
  const loaded = [...(found?.[1]?.split(',') || []), ...(found?.[2]?.split(/\r?\n\s+- /) || [])]
    .map(one => one.trim().replace(/^[`'"]|[`'"]$/g, ''))
    .filter(Boolean)
  return ['memory.md', ...modes.map(mode => `modes/${mode}.md`)]
    .filter(file => !loaded.some(one => one === file || one.endsWith(`/${file}`)))
}

// The rules a cops agent's tool call breaks, from its agent file. `tries` counts this run's Bash
// calls of exactly this command, this one included.
//   oracle, review-pr, Write /mem/memory/users/me/x.md     → ['wrote /mem/memory/users/me/x.md outside a learn-feedback call']
//   oracle, learn-feedback, memory-root /mem, Write /repo/a.ts → ['wrote /repo/a.ts outside its memory tree']
//   oracle, learn-feedback, Write /mem/memory/team/MEMORY.md   → []
//   oracle, Bash 'git log -3'                               → []
//   oracle, Bash 'git push'                                 → ['ran a non-read command: git push']
//   sidekick, Bash 'git push --force'                       → ['force-pushed']
//   sidekick allowed to rewrite, Bash 'git push --force'    → []
//   sidekick, Bash 'git commit --amend --no-verify'         → ['amended a commit', 'skipped hooks with --no-verify']
//   sidekick, Bash 'gh api graphql -f query=…resolveReviewThread…' → ['resolved a review thread']
//   sidekick, Bash 'pnpm test', tries 4                     → ['4th try of: pnpm test']
export const checkTool = ({ call, tool, command, path, tries }: {
  call: Pick<AgentCall, 'agent' | 'modes' | 'memoryRoot' | 'mayRewrite'>; tool: string; command?: string; path?: string; tries: number
}): string[] => {
  // `git`, then any global options before its subcommand: 'git push', 'git -C /mem commit', 'git --no-pager log'.
  const GIT = String.raw`\bgit(?:\s+(?:-[Cc]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+`
  if (call.agent === 'cops:pr-oracle') {
    // Tools that write the file their input names.
    const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']
    const isLearning = call.modes?.includes('learn-feedback')
    const root = call.memoryRoot && call.memoryRoot !== 'unavailable' ? `${call.memoryRoot.replace(/\/$/, '')}/memory/` : undefined
    // Commands that change a repository, GitHub, or a file; the oracle's Bash only reads.
    const WRITES = new RegExp(String.raw`${GIT}(commit|push|pull|clone|checkout|switch|reset|rebase|merge|add|rm|mv|tag|fetch|cherry-pick|revert|restore|apply|am|clean|init)\b|\bgh\s+(pr|issue)\s+(create|edit|merge|close|reopen|comment|review|ready)\b|\bgh\s+api\b.*\s(-X|--method)\s*(POST|PUT|PATCH|DELETE)\b|\bmutation\b|(^|[;&|]\s*)(rm|mv|cp|mkdir|touch|tee|chmod|ln)\s|\bsed\s+-i\b|\s>>?\s*(?!\/dev\/null)[\w./~$]`)
    return [
      path && WRITE_TOOLS.includes(tool) && !isLearning && `wrote ${path} outside a learn-feedback call`,
      path && WRITE_TOOLS.includes(tool) && isLearning && !(root && path.startsWith(root)) && `wrote ${path} outside its memory tree`,
      tool === 'Bash' && command && WRITES.test(command) && `ran a non-read command: ${command.trim().split('\n')[0]}`,
    ].filter(one => typeof one === 'string')
  }
  if (call.agent !== 'cops:pr-sidekick') return []
  const run = tool === 'Bash' ? command || '' : ''
  return [
    !call.mayRewrite && new RegExp(String.raw`${GIT}commit\b[^;&|]*\s--amend\b`).test(run) && 'amended a commit',
    !call.mayRewrite && new RegExp(String.raw`${GIT}push\b[^;&|]*(\s--force(-with-lease)?\b|\s-f\b|\s\+\S)`).test(run) && 'force-pushed',
    /\s--no-verify\b/.test(run) && 'skipped hooks with --no-verify',
    (/\bresolveReviewThread\b/.test(run) || /resolve.*thread/i.test(tool)) && 'resolved a review thread',
    tool === 'Bash' && tries >= 4 && `4th try of: ${run.trim().split('\n')[0]}`,
  ].filter(one => typeof one === 'string')
}
