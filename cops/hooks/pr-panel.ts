import type { AgentCall, Thread } from '../types'

// What the threads and agents pane says: the PR's open review threads and the
// cops subagent calls of this session.

export const MODES = ['scout-repo', 'brief-task', 'sweep-diff', 'review-pr', 'triage-threads', 'grill-description', 'draft-author-notes', 'learn-feedback']

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
    && /^\s*\*\*(Note|Drive-by):\*\*/.test(first.body)
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
  return {
    rules: /Rules that apply:\s*(.+)$/m.exec(prompt)?.[1]?.trim(),
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

export const describeAgent = (call: AgentCall): string => {
  const elapsed = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`)
  const tokens = (n: number) => (n < 1000 ? `${n} tokens` : `${Math.round(n / 1000)}k tokens`)
  return [
    call.agent.replace(/^cops:/, ''),
    call.mode,
    call.memoryRoot && `memory-root ${call.memoryRoot}`,
    call.memoryLogin && `login ${call.memoryLogin}`,
    call.rules && `rules: ${call.rules}`,
    call.durationMs !== undefined && elapsed(call.durationMs),
    call.tokens !== undefined && tokens(call.tokens),
    call.state === 'running' ? 'running…' : call.outcome,
  ].filter(Boolean).join(' · ')
}
