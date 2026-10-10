import type { AgentCall, Thread } from '../types'

// What the COPS HQ pane says: the PR's open review threads and the
// cops subagent calls of this session.

export const MODES = ['scout-repo', 'brief-task', 'sweep-diff', 'review-pr', 'triage-threads', 'grill-description', 'draft-author-notes', 'learn-feedback']

// Braille spinner frames for a running agent, one per SPINNER_MS.
export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
export const SPINNER_MS = 100

export const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      author { login }
      reviewThreads(first: 100) {
        nodes {
          id isResolved isOutdated path line
          comments(last: 1) { totalCount nodes { author { login } body url } }
          first: comments(first: 1) { nodes { author { login } body reactions(content: THUMBS_UP, first: 50) { nodes { user { login } } } } }
        }
      }
    }
  }
}`

type Comment = { author?: { login: string } | null; body: string; url: string }
type FirstComment = { author?: { login: string } | null; body: string; reactions: { nodes: { user?: { login: string } | null }[] } }
type ThreadNode = {
  id: string; isResolved: boolean; isOutdated: boolean; path: string; line: number | null
  comments: { totalCount: number; nodes: Comment[] }
  first: { nodes: FirstComment[] }
}
export type ThreadsResponse = {
  data?: { repository?: { pullRequest?: { author?: { login: string } | null; reviewThreads: { nodes: ThreadNode[] } } | null } | null }
}

export const snippet = (text: string) => {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

const isAcknowledgedNote = (node: ThreadNode, author?: string) => {
  const first = node.first.nodes[0]
  return !!author && node.comments.totalCount === 1 && first?.author?.login === author
    && /^\s*(\*\*)?(Note|Drive-by):\1/.test(first.body)
    && first.reactions.nodes.some(one => one.user?.login === author)
}

// Open threads only; whoever spoke last decides whose move it is.
export const toThreads = (response: ThreadsResponse): Thread[] => {
  const pr = response.data?.repository?.pullRequest
  if (!pr) return []
  const author = pr.author?.login
  return pr.reviewThreads.nodes
    .filter(node => !node.isResolved)
    // The author's own Note:/Drive-by: they have 👍'd is done, until someone replies.
    .filter(node => !isAcknowledgedNote(node, author))
    .map(node => {
      const last = node.comments.nodes.at(-1)
      const lastAuthor = last?.author?.login ?? 'ghost'
      return {
        id: node.id,
        path: node.path,
        line: node.line,
        isOutdated: node.isOutdated,
        lastAuthor,
        lastBody: snippet(last?.body ?? ''),
        url: last?.url ?? '',
        move: lastAuthor === author ? 'reviewer' : 'you',
      }
    })
}

const field = (prompt: string, name: string) => new RegExp(`${name}:\\s*\`?([^\\s\`]+)`).exec(prompt)?.[1]

// What a cops subagent call was given, read from its prompt.
export const describeCall = (agent: string, prompt: string): Pick<AgentCall, 'mode' | 'memoryRoot' | 'memoryLogin' | 'rules' | 'isLeak'> => {
  if (agent.endsWith('pr-oracle')) {
    const named = /\bmode:?\s*`?([a-z-]+)/.exec(prompt)?.[1]
    return {
      mode: named && MODES.includes(named) ? named : MODES.find(one => new RegExp(`\\b${one}\\b`).test(prompt)),
      memoryRoot: field(prompt, 'memory-root'),
      memoryLogin: field(prompt, 'memory-login'),
      isLeak: false,
    }
  }
  // How many rules the `Rules that apply:` label carries:
  //   `Rules that apply: none`                → 0
  //   no label                                → 0
  //   `Rules that apply: keep tests beside`   → 1 (one inline line)
  //   `Rules that apply:\n- a\n- b\n- c`       → 3 (one per `- ` bullet line)
  const labelled = /Rules that apply:[ \t]*(.*)((?:\r?\n- .*)*)/.exec(prompt)
  const inline = labelled?.[1]?.trim() || ''
  const bullets = labelled?.[2]?.match(/\n- /g)?.length || 0
  return {
    rules: inline.toLowerCase() === 'none' ? 0 : bullets || (inline ? 1 : 0),
    isLeak: agent.endsWith('pr-sidekick') && prompt.includes('memory-root'),
  }
}

// The one line worth showing from what the subagent returned.
export const describeOutcome = (text: string): string => {
  const sentinel = /\bCHECKPOINT_(FOUND|NOT_FOUND|AMBIGUOUS)\b/.exec(text)?.[0]
  if (sentinel) {
    const sha = sentinel === 'CHECKPOINT_FOUND' ? /\b[0-9a-f]{7,40}\b/.exec(text)?.[0] : undefined
    return sha ? `${sentinel} ${sha.slice(0, 7)}` : sentinel
  }
  const pushed = /\bpushed:?\s+`?([0-9a-f]{7,40})\b/i.exec(text)?.[1]
  if (pushed) return `pushed ${pushed.slice(0, 7)}`
  const committed = /^committed:\s*`?([0-9a-f]{7,40})\b/m.exec(text)?.[1]
  if (committed) return `committed ${committed.slice(0, 7)}`
  const findings = text.match(/\*\*(Issue|Suggestion|Question|Test):\*\*/g)?.length ?? 0
  if (findings > 0) return `${findings} finding${findings === 1 ? '' : 's'}`
  return snippet(text) || 'no output'
}

// One pane row per call, led by its status:
//   running, now 0   → `⠋ 🔮 Oracle · brief-task` (the frame steps every 100ms of `now`)
//   running, now 100 → `⠙ 🔮 Oracle · brief-task`
//   done             → `✓ 🔮 Oracle · brief-task · 3s · 12k tokens · CHECKPOINT_FOUND abc1234`
//   sidekick done    → `✓ 🦸 Sidekick · 6 rules · 1 deviation · 3s · 12k tokens · committed 9f8e7d6`
//                      (`no rules` for none; the deviation part only when there are some)
//   failed           → `✗ 🦸 Sidekick · failed`
//   background       → `🔮 Oracle · running in the background`
//   another agent    → `✓ pr-other · …`, its name without `cops:`
export const describeAgent = ({ call, now }: { call: AgentCall; now: number }): string => {
  const elapsed = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`)
  const tokens = (n: number) => (n < 1000 ? `${n} tokens` : `${Math.round(n / 1000)}k tokens`)
  const marks = { running: SPINNER[Math.floor(now / SPINNER_MS) % SPINNER.length], done: '✓', failed: '✗', background: '' }
  const names: Record<string, string> = { 'cops:pr-oracle': '🔮 Oracle', 'cops:pr-sidekick': '🦸 Sidekick' }
  const line = [
    names[call.agent] ?? call.agent.replace(/^cops:/, ''),
    call.mode,
    call.rules !== undefined && (call.rules === 0 ? 'no rules' : `${call.rules} rule${call.rules === 1 ? '' : 's'}`),
    !!call.deviations && `${call.deviations} deviation${call.deviations === 1 ? '' : 's'}`,
    call.durationMs !== undefined && elapsed(call.durationMs),
    call.tokens !== undefined && tokens(call.tokens),
    call.outcome,
  ].filter(Boolean).join(' · ')
  return [marks[call.state], line].filter(Boolean).join(' ')
}
