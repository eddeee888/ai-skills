import type { AgentCall, SkillRun, Thread, Threads } from '../types'

// What the COPS HQ pane says: the PR's open review threads, the next cops skill
// to run, and the cops subagent calls and skill runs of this session.

export const MODES = ['scout-repo', 'brief-task', 'sweep-diff', 'review-pr', 'triage-threads', 'grill-description', 'draft-author-notes', 'learn-feedback']

// Braille spinner frames for a running agent, one per SPINNER_MS.
export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
export const SPINNER_MS = 100

export const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
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
  data?: { viewer?: { login: string } | null; repository?: { pullRequest?: { author?: { login: string } | null; reviewThreads: { nodes: ThreadNode[] } } | null } | null }
}

export const snippet = (text: string) => {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

const isNote = (node: ThreadNode, author?: string) => {
  const first = node.first.nodes[0]
  return !!author && first?.author?.login === author && /^\s*(\*\*)?(Note|Drive-by):\1/.test(first.body)
}

const isAcknowledgedNote = (node: ThreadNode, author?: string) =>
  isNote(node, author) && node.comments.totalCount === 1
  && !!node.first.nodes[0]?.reactions.nodes.some(one => one.user?.login === author)

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

// What the next-step hint needs to know about the PR, resolved threads included:
//   isMine     → the viewer opened it (undefined when gh doesn't say who the viewer is)
//   isReviewed → someone other than the author started or answered a thread
//   hasNotes   → the author left a `Note:` / `Drive-by:` thread
export const summarize = (response: ThreadsResponse): { isMine?: boolean; isReviewed: boolean; hasNotes: boolean } => {
  const viewer = response.data?.viewer?.login
  const pr = response.data?.repository?.pullRequest
  const author = pr?.author?.login
  const nodes = pr?.reviewThreads.nodes ?? []
  return {
    isMine: viewer && author ? viewer === author : undefined,
    isReviewed: nodes.some(node => [node.first.nodes[0], node.comments.nodes.at(-1)].some(one => !!one?.author && one.author.login !== author)),
    hasNotes: nodes.some(node => isNote(node, author)),
  }
}

// The cops skill that fits the PR's state, for the pane's `Next:` line:
//   branch without a PR                   → /cops:pr-start
//   someone else's PR                     → /cops:pr-review
//   your PR, threads need you             → /cops:pr-address (threads marked handled don't count)
//   your PR, no review and no notes yet   → /cops:pr-note
//   anything else (waiting, unknown)      → nothing
export const describeNext = ({ view, handled }: { view: Threads; handled: string[] }): { skill: string; why: string } | undefined => {
  if (view.status === 'no-pr') return { skill: 'cops:pr-start', why: 'this branch has no PR yet' }
  if (view.status !== 'ready' || view.isMine === undefined) return undefined
  if (!view.isMine) return { skill: 'cops:pr-review', why: 'someone else’s PR' }
  const waiting = view.threads.filter(one => one.move === 'you' && !handled.includes(one.id)).length
  if (waiting > 0) return { skill: 'cops:pr-address', why: `${waiting} thread${waiting === 1 ? ' needs' : 's need'} you` }
  if (!view.isReviewed && !view.hasNotes) return { skill: 'cops:pr-note', why: 'your PR, no review or notes yet' }
  return undefined
}

// Whether two skill names are the same skill, with or without the plugin prefix:
//   'cops:pr-review' and 'pr-review' → true
//   'cops:pr-review' and 'oss:pr-review' → false
export const isSameSkill = (a: string, b: string) => {
  const bare = (name: string) => name.replace(/^[^:]+:/, '')
  return a === b || ((!a.includes(':') || !b.includes(':')) && bare(a) === bare(b))
}

const ago = (ms: number) => (ms < 60_000 ? 'just now' : ms < 3_600_000 ? `${Math.floor(ms / 60_000)}m ago` : `${Math.floor(ms / 3_600_000)}h ago`)

// One pane row per skill run, numbered in order:
//   typed      → `#1 /cops:pr-review https://github.com/o/r/pull/7 · you · 3m ago`
//   model      → `#2 /cops:pr-address · model · just now`
//   other      → `#3 /oss:issue-fix · preloaded · 1h ago` (expanded with no command or Skill call, e.g. into a subagent)
export const describeSkill = ({ run, index, now }: { run: SkillRun; index: number; now: number }): string => {
  const by = { you: 'you', model: 'model', other: 'preloaded' }
  return [`#${index + 1} /${run.skill}${run.args ? ` ${snippet(run.args)}` : ''}`, by[run.by], ago(Math.max(0, now - run.at))].join(' · ')
}

// The pane's Activity section: each agent call under the skill run it started in,
// the latest run that began at or before the call; calls before any run lead, ungrouped.
//   runs #1 at 0, #2 at 50; calls at 10, 20, 60 → #1 [10, 20], #2 [60]
//   no runs; a call at 10                       → loose [10]
export const groupActivity = ({ runs, calls }: { runs: SkillRun[]; calls: AgentCall[] }) => {
  const owner = (call: AgentCall) => runs.findLastIndex(run => run.at <= call.startedAt)
  return {
    loose: calls.filter(call => owner(call) === -1),
    groups: runs.map((run, index) => ({ run, index, calls: calls.filter(call => owner(call) === index) })),
  }
}

// The Activity heading: `Activity · 2 skills · 1 agent`, `Activity · none yet`.
export const describeActivity = ({ runs, calls }: { runs: number; calls: number }) => {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
  const parts = [runs > 0 && count(runs, 'skill'), calls > 0 && count(calls, 'agent')].filter(Boolean)
  return ['Activity', ...(parts.length > 0 ? parts : ['none yet'])].join(' · ')
}

const field = (prompt: string, name: string) => new RegExp(`${name}:\\s*\`?([^\\s\`]+)`).exec(prompt)?.[1]

// What a cops subagent call was given, read from its prompt. A pr-oracle call keeps
// every mode its `mode` line names, in order, any case:
//   'Mode: triage-threads + scout-repo' → modes ['triage-threads', 'scout-repo']
//   'mode: scout-repo + triage-threads' → modes ['scout-repo', 'triage-threads']
//   'Run `review-pr`.' (no mode line)    → modes ['review-pr'], the first of MODES the prompt names
//   'Run it.'                            → modes []
export const describeCall = ({ agent, prompt }: { agent: string; prompt: string }): Pick<AgentCall, 'modes' | 'memoryRoot' | 'memoryLogin' | 'rules' | 'isLeak'> => {
  if (agent.endsWith('pr-oracle')) {
    const line = /\bmode\b:?(.*)$/im.exec(prompt)?.[1] || ''
    const named = MODES
      .map(one => ({ one, at: line.search(new RegExp(`\\b${one}\\b`, 'i')) }))
      .filter(found => found.at !== -1)
      .sort((a, b) => a.at - b.at)
      .map(found => found.one)
    const fallback = MODES.find(one => new RegExp(`\\b${one}\\b`, 'i').test(prompt))
    return {
      modes: named.length > 0 ? named : fallback ? [fallback] : [],
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
//   two modes        → `⠋ 🔮 Oracle · triage-threads + scout-repo`
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
    call.modes?.join(' + '),
    call.rules !== undefined && (call.rules === 0 ? 'no rules' : `${call.rules} rule${call.rules === 1 ? '' : 's'}`),
    !!call.deviations && `${call.deviations} deviation${call.deviations === 1 ? '' : 's'}`,
    call.durationMs !== undefined && elapsed(call.durationMs),
    call.tokens !== undefined && tokens(call.tokens),
    call.outcome,
  ].filter(Boolean).join(' · ')
  return [marks[call.state], line].filter(Boolean).join(' ')
}
