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
  /**
   * `url` is the PR's web page; `state` is whether it's still open. `isMine`: the viewer opened the PR (undefined when unknown); `isDraft`: the PR is still a draft (undefined when unknown);
   * `isReviewed`: someone else commented in a thread; `hasNotes`: the author left a `Note:` / `Drive-by:`.
   */
  | { status: 'ready'; pr: number; url: string; state: 'OPEN' | 'MERGED' | 'CLOSED'; threads: Thread[]; isMine?: boolean; isDraft?: boolean; isReviewed: boolean; hasNotes: boolean }

/** One subagent call this session, a cops agent's or any other. */
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
  /** The model the engine resolved the call to (an alias or an id); unset until the spawn or the result names it. */
  resolvedModel?: string
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
  /** The Agent call's `model` input; unset = the call inherits the main chat's model. */
  model?: string
}

/** One skill expanded for the model this session. */
export type SkillRun = {
  /** Its number in the session, from 1; kept when older runs drop off the list. */
  n: number
  /** The skill's name as the engine gives it, e.g. `cops:pr-review`. */
  skill: string
  /** What followed the name, typed or passed to the Skill tool. */
  args?: string
  /** `you` typed the slash command, the `model` called the Skill tool, `other` covers the rest (a subagent preload). */
  by: 'you' | 'model' | 'other'
  /** Set when `skill.prompt` never fired for the run: the hook that recorded it instead, the typed command's or the Skill call's. */
  source?: 'typed' | 'tool.call'
  /** `$.clock.now()` when it expanded. */
  at: number
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

/**
 * How often a remembered rule matched a pr-oracle brief-task or sweep-diff reply, kept across sessions in
 * `$.store` under the key `ruleUsage`, by a hash of the rule's normalized text. Times are `$.clock.now()`.
 */
export type RuleUsage = {
  /** Times a reply cited it, a sweep-diff flag included. */
  count: number
  /** Times a sweep-diff reply flagged it; unset reads as 0. */
  flagged?: number
  firstSeen: number
  lastSeen: number
  /** The latest times it matched, oldest first, capped. */
  recent: number[]
}

/** Calls, time and tokens summed over finished calls. */
export type UsageTotals = {
  calls: number
  durationMs: number
  tokens: number
}

/**
 * What the cops agent calls cost per pr-oracle mode set or pr-sidekick job, kept across sessions in `$.store`
 * under the key `usage`. `since` is `$.clock.now()` when it started accumulating; a reset sets a new one.
 * Each key's totals are also split by the Agent call's `model` input (`inherit` when unset).
 */
export type Usage = {
  since: number
  keys: Record<string, UsageTotals & { models: Record<string, UsageTotals> }>
}

declare module 'claude-code' {
  interface PluginState {
    cops: {
      threads: Threads
      /** Thread ids marked handled locally; cleared by a push. */
      handled: string[]
      agents: AgentCall[]
      /** This session's skill runs, oldest first. */
      skills: SkillRun[]
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
      /** The COPS HQ pane's tab: `hq` shows threads, activity and inbox; `rules` shows remembered rules' usage; `stats` shows what the cops agents cost. */
      paneTab: 'hq' | 'rules' | 'stats'
      /** `$.clock.now()` when the main chat's last turn ended (not a subagent's); null before one has. */
      turnEndedAt: number | null
      /** The rules of the personal and team MEMORY.md, without their evidence, as the status line last read them. */
      memoryRules: { rule: string; source: 'personal' | 'team' }[]
    }
  }
}
