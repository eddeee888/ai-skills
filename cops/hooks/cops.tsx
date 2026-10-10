import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentCall, Thread, Threads } from '../types'
import { describeAgent, describeCall, describeOutcome, snippet, THREADS_QUERY, toThreads } from './pr-panel.ts'
import type { ThreadsResponse } from './pr-panel.ts'
import { describeMemory, describePullRequest } from './status-line.ts'
import type { PullRequest } from './status-line.ts'

// The plugin's one hooks module: the status line, and the threads and agents
// pane. What each says is worked out in status-line.ts and pr-panel.ts.

const REFRESH_MS = 120_000
// Bash commands that can change the branch, its PR, or its CI.
const BRANCH_COMMAND = /\b(git\s+(checkout|switch|commit|push|pull|merge|rebase|reset)|gh\s+pr)\b/
const PUSH = /\bgit\s+push\b/
const PANE = 'cops-threads'
const TITLE = 'COPS threads and agents'

const threads = atom({ plugin: 'cops', key: 'threads' } as const, { status: 'loading' } as Threads)
const handled = atom({ plugin: 'cops', key: 'handled' } as const, [] as string[])
const agents = atom({ plugin: 'cops', key: 'agents' } as const, [] as AgentCall[])

const run = async ($: EngineInterface, argv: readonly string[]) => {
  try {
    return await $.process.run(argv, { timeoutMs: 15_000 })
  } catch {
    return undefined
  }
}

// Status line

const memoryPart = async ($: EngineInterface, path: string, login: string) => {
  const ran = await run($, ['bash', `${$.plugin.root}/hooks/memory-context.sh`, 'claude', path, login])
  return ran?.exitCode === 0 ? describeMemory(ran.stdout) : undefined
}

// Branch and PR; nothing outside a Git repository, branch alone when gh can't answer.
const branchPart = async ($: EngineInterface) => {
  const branch = await run($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch?.exitCode !== 0) return undefined
  const name = branch.stdout.trim()
  const pr = await run($, ['gh', 'pr', 'view', '--json', 'number,state,isDraft,statusCheckRollup'])
  if (pr?.exitCode === 0) {
    try {
      return describePullRequest(JSON.parse(pr.stdout) as PullRequest)
    } catch {
      return name
    }
  }
  return pr?.stderr.includes('no pull requests found') ? `${name} · no PR` : name
}

type Memory = { path: string; login: string }
let isStatusRefreshing = false

const refreshStatus = async ($: EngineInterface, memory: Memory) => {
  if (isStatusRefreshing) return
  isStatusRefreshing = true
  try {
    const parts = await Promise.all([memoryPart($, memory.path, memory.login), branchPart($)])
    $.ui.status(['cops', ...parts.filter(Boolean)].join(' · '))
  } finally {
    isStatusRefreshing = false
  }
}

// Threads

const fetchThreads = async ($: EngineInterface): Promise<Threads> => {
  const branch = await run($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch?.exitCode !== 0) return { status: 'no-repo' }
  const pr = await run($, ['gh', 'pr', 'view', '--json', 'number'])
  if (pr?.exitCode !== 0) return { status: pr?.stderr.includes('no pull requests found') ? 'no-pr' : 'needs-gh' }
  try {
    const { number } = JSON.parse(pr.stdout) as { number: number }
    const ran = await run($, [
      'gh', 'api', 'graphql', '-F', 'owner={owner}', '-F', 'name={repo}', '-F', `number=${number}`, '-f', `query=${THREADS_QUERY}`,
    ])
    if (ran?.exitCode !== 0) return { status: 'needs-gh' }
    return { status: 'ready', pr: number, threads: toThreads(JSON.parse(ran.stdout) as ThreadsResponse) }
  } catch {
    return { status: 'needs-gh' }
  }
}

let isThreadsRefreshing = false

const refreshThreads = async ($: EngineInterface) => {
  if (isThreadsRefreshing) return
  isThreadsRefreshing = true
  try {
    const next = await fetchThreads($)
    await update($, threads, () => next)
  } finally {
    isThreadsRefreshing = false
  }
}

// Refreshes run in the background; one that fails (the session ended mid-run)
// just leaves the last view up.
const refreshAll = async ($: EngineInterface, memory: Memory) => {
  await Promise.allSettled([refreshStatus($, memory), refreshThreads($)])
}

const elapsedSince = async ($: EngineInterface, startedAt: number) => {
  try {
    return (await $.clock.now()) - startedAt
  } catch {
    return undefined
  }
}

// Bookkeeping after a tool ran never throws: the hook's catch would run the tool again.
const setCall = async ($: EngineInterface, id: string, change: Partial<AgentCall>) => {
  try {
    await update($, agents, list => list.map(call => (call.id === id ? { ...call, ...change } : call)))
  } catch {}
}

const clearHandled = async ($: EngineInterface) => {
  try {
    await update($, handled, () => [])
  } catch {}
}

export const register: Register = (on, options) => {
  const memory: Memory = {
    path: typeof options.memory_path === 'string' ? options.memory_path : '',
    login: typeof options.memory_login === 'string' ? options.memory_login : '',
  }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'cops-threads', description: 'Show the PR’s open review threads and this session’s cops agents' })
    void refreshAll($, memory)
    $.clock.every(REFRESH_MS, () => refreshAll($, memory))
    return started
  })

  on('command.run', { command: 'cops-threads' }, async $ => {
    void refreshThreads($).catch(() => undefined)
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'Opened the COPS threads and agents pane.' : 'This surface doesn’t show panes.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (PUSH.test(e.command) && ran.deny === undefined && ran.isError !== true) await clearHandled($)
    if (BRANCH_COMMAND.test(e.command)) void refreshAll($, memory)
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const agent = e.subagent_type ?? ''
    if (!agent.startsWith('cops:')) return next(e)
    const startedAt = await $.clock.now()
    const call: AgentCall = { id: e.tool_use_id, agent, startedAt, state: 'running', ...describeCall(agent, e.prompt) }
    await update($, agents, list => [...list, call].slice(-50))
    const ran = await next(e)
    const durationMs = await elapsedSince($, startedAt)
    if (ran.deny !== undefined || ran.isError === true) {
      await setCall($, call.id, { state: 'failed', durationMs, outcome: snippet(ran.deny ?? ran.text ?? '') || 'failed' })
    } else if ('status' in ran.result && ran.result.status === 'async_launched') {
      await setCall($, call.id, { state: 'background', durationMs, outcome: 'running in the background' })
    } else {
      const result = ran.result
      const totals = 'status' in result && result.status === 'completed' ? { durationMs: result.totalDurationMs, tokens: result.totalTokens } : { durationMs }
      await setCall($, call.id, { state: 'done', ...totals, outcome: describeOutcome(ran.text ?? '') })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const view = await read($, threads)
    const done = await read($, handled)
    const calls = await read($, agents)

    const row = (thread: Thread) => {
      const isHandled = done.includes(thread.id)
      const where = thread.line === null ? thread.path : `${thread.path}:${thread.line}`
      return (
        <Box key={thread.id} flexDirection="row" gap={1}>
          {thread.move === 'you' && (
            <Button
              key={`handled-${thread.id}`}
              plain
              onPress={() => update($, handled, list => (list.includes(thread.id) ? list.filter(one => one !== thread.id) : [...list, thread.id]))}
            >
              {isHandled ? '[x]' : '[ ]'}
            </Button>
          )}
          <Text dimColor={isHandled} wrap="truncate-end">
            {where} · {thread.lastAuthor}: {thread.lastBody}
            {thread.isOutdated && <Text color="warning"> (outdated)</Text>}
            {isHandled && <Text color="success"> handled locally</Text>}
          </Text>
        </Box>
      )
    }

    const group = (title: string, list: Thread[]) => (
      <Box flexDirection="column">
        <Text bold>{title} ({list.length})</Text>
        {list.length === 0 ? <Text dimColor>none</Text> : list.map(row)}
      </Box>
    )

    const waiting = {
      loading: 'Threads: loading…',
      'no-repo': 'Threads: not in a Git repository.',
      'no-pr': 'Threads: this branch has no PR.',
      'needs-gh': 'Threads: needs gh, logged in.',
    }

    return (
      <Box flexDirection="column" gap={1}>
        {view.status === 'ready' ? (
          <Box flexDirection="column" gap={1}>
            <Text bold>Threads · PR #{view.pr}</Text>
            {group('Needs you', view.threads.filter(one => one.move === 'you'))}
            {group('Waiting on reviewer', view.threads.filter(one => one.move === 'reviewer'))}
          </Box>
        ) : (
          <Text dimColor>{waiting[view.status]}</Text>
        )}
        <Box flexDirection="column">
          <Text bold>Agents ({calls.length})</Text>
          {calls.length === 0 && <Text dimColor>No cops agent calls yet.</Text>}
          {calls.map(call => (
            <Box key={call.id} flexDirection="column">
              <Text color={call.state === 'failed' ? 'error' : undefined} wrap="truncate-end">{describeAgent(call)}</Text>
              {call.isLeak && <Text color="error">  pr-sidekick was given memory-root; it must never read memory.</Text>}
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
