// The values the `pr-panel` hooks module keeps in `$.state`.

/** Who moves next on a thread: the PR author, or the reviewer. */
export type Move = 'you' | 'reviewer'

export type Thread = {
  id: string
  path: string
  line: number | null
  isOutdated: boolean
  /** Login of whoever commented last. */
  lastAuthor: string
  /** The last comment's first line, cut short. */
  lastBody: string
  url: string
  move: Move
}

export type Threads =
  | { status: 'loading' | 'no-repo' | 'no-pr' | 'needs-gh' }
  /** `url` is the PR's web page. */
  | { status: 'ready'; pr: number; url: string; threads: Thread[] }

/** One cops subagent call this session. */
export type AgentCall = {
  id: string
  agent: string
  /** The pr-oracle modes the prompt names, in order. */
  modes?: string[]
  memoryRoot?: string
  memoryLogin?: string
  /** How many rules the `Rules that apply:` label of a pr-sidekick prompt carries. */
  rules?: number
  /** How many entries the pr-sidekick's `deviations:` line reports. */
  deviations?: number
  /** A pr-sidekick prompt that carries `memory-root`, against the contract. */
  isLeak: boolean
  /** A pr-sidekick prompt that names a rebase or a force-push, so amending and force-pushing are allowed. */
  mayRewrite?: boolean
  /** The id of the subagent's loop, which its tool calls carry; set once it spawned. */
  agentId?: string
  /** The files a pr-oracle reply's `loaded:` lacks; none = all there; unset until the reply. */
  missingLoads?: string[]
  /** The rules the agent's tool calls broke, each once. */
  flags?: string[]
  startedAt: number
  state: 'running' | 'background' | 'done' | 'failed'
  /** Checkpoint sentinel, pushed or committed SHA, findings count, or the first line. */
  outcome?: string
  durationMs?: number
  tokens?: number
}

/**
 * One memory line from a cops agent's result, in the COPS HQ memory inbox.
 * The inbox is kept across sessions in `$.store` under the key `inbox`, except
 * `open:` lines, which stay for the session in `openItems`.
 */
export type InboxItem = {
  kind: 'memory-candidate' | 'promote' | 'conflict' | 'open'
  text: string
  /** The pr-oracle modes of the call that returned the line; none for pr-sidekick. */
  modes?: string[]
  /** The repository's name, from its `origin` remote. */
  repo?: string
  /** The branch's PR number, once its threads have loaded. */
  pr?: number
}

declare module 'claude-code' {
  interface PluginState {
    cops: {
      threads: Threads
      /** Thread ids marked handled locally; cleared by a push. */
      handled: string[]
      agents: AgentCall[]
      /** The person closed the pane, so it stops opening by itself; `/cops-hq` resets it. */
      isDismissed: boolean
      /** A rule-like sentence from the person's last prompt, offered above the prompt; null when there is none. */
      ruleOffer: string | null
      /** What the status line's last run of memory-context.sh said: memory is configured and its root found. */
      isMemoryOn: boolean
      /** This session's `open:` lines, shown in the inbox. */
      openItems: InboxItem[]
      /** The running cops skill and the labels of its handoffs made so far; null before one runs. */
      checklist: { skill: string; ticked: string[] } | null
    }
  }
}
