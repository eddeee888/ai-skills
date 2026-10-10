import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentCall, Thread, Threads } from '../types'
import { describeAgent, describeCall, describeOutcome, snippet, SPINNER_MS, THREADS_QUERY, toThreads } from './pr-panel.ts'
import type { ThreadsResponse } from './pr-panel.ts'
import { findRule } from './rule-band.ts'
import { countLines, describeCapacityWarning, describeMemory } from './status-line.ts'

// The plugin's one hooks module: the status line, the COPS HQ pane of threads
// and agents, and the band offering to remember a rule the person typed. What each
// says is worked out in status-line.ts, pr-panel.ts and rule-band.ts.

const REFRESH_MS = 120_000
// Bash commands that can change the branch or its PR.
const BRANCH_COMMAND = /\b(git\s+(checkout|switch|commit|push|pull|merge|rebase|reset)|gh\s+pr)\b/
const PUSH = /\bgit\s+push\b/
const PANE = 'cops-hq'
const TITLE = 'COPS HQ'

const threads = atom({ plugin: 'cops', key: 'threads' } as const, { status: 'loading' })
const handled = atom({ plugin: 'cops', key: 'handled' } as const, [])
const agents = atom({ plugin: 'cops', key: 'agents' } as const, [])
const isDismissed = atom({ plugin: 'cops', key: 'isDismissed' } as const, false)
const ruleOffer = atom({ plugin: 'cops', key: 'ruleOffer' } as const, null)

const run = async ($: EngineInterface, argv: readonly string[]) => {
  try {
    return await $.process.run(argv, { timeoutMs: 15_000 })
  } catch {
    return undefined
  }
}

// Status line

let hasWarnedCapacity = false

const memoryPart = async ($: EngineInterface, { path, login }: { path: string; login: string }): Promise<string | undefined> => {
  const ran = await run($, ['bash', `${$.plugin.root}/hooks/memory-context.sh`, 'claude', path, login])
  if (ran?.exitCode !== 0) return undefined
  const lineCount = async ({ file }: { file: string }): Promise<number | undefined> => {
    try {
      return countLines({ text: await $.fs.read(file) })
    } catch {
      return undefined
    }
  }
  // The script's resolved root, so PR_MEMORY_PATH counts as much as the option.
  const root = /^COPS memory root: (.+)$/m.exec(ran.stdout)?.[1]
  const memoryLogin = /^COPS memory login: (\S+)$/m.exec(ran.stdout)?.[1]
  const [personal, team] = root
    ? await Promise.all([
        memoryLogin ? lineCount({ file: `${root}/memory/users/${memoryLogin}/MEMORY.md` }) : undefined,
        lineCount({ file: `${root}/memory/team/MEMORY.md` }),
      ])
    : []
  const usage = { personal, team }
  const warning = describeCapacityWarning({ usage })
  if (warning && !hasWarnedCapacity) {
    hasWarnedCapacity = true
    $.ui.toast(warning)
  }
  return describeMemory({ context: ran.stdout, usage })
}

type Memory = { path: string; login: string }
let isStatusRefreshing = false

const refreshStatus = async ($: EngineInterface, memory: Memory) => {
  if (isStatusRefreshing) return
  isStatusRefreshing = true
  try {
    // The host already labels the entry with the plugin's name.
    $.ui.status(await memoryPart($, { path: memory.path, login: memory.login }))
  } finally {
    isStatusRefreshing = false
  }
}

// Threads

const fetchThreads = async ($: EngineInterface): Promise<Threads> => {
  const branch = await run($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch?.exitCode !== 0) return { status: 'no-repo' }
  const pr = await run($, ['gh', 'pr', 'view', '--json', 'number,url'])
  if (pr?.exitCode !== 0) return { status: pr?.stderr.includes('no pull requests found') ? 'no-pr' : 'needs-gh' }
  try {
    // JSON.parse returns `any`; dropping these casts takes a runtime check of gh's output.
    const { number, url } = JSON.parse(pr.stdout) as { number: number; url: string }
    const ran = await run($, [
      'gh', 'api', 'graphql', '-F', 'owner={owner}', '-F', 'name={repo}', '-F', `number=${number}`, '-f', `query=${THREADS_QUERY}`,
    ])
    if (ran?.exitCode !== 0) return { status: 'needs-gh' }
    return { status: 'ready', pr: number, url, threads: toThreads(JSON.parse(ran.stdout) as ThreadsResponse) }
  } catch {
    return { status: 'needs-gh' }
  }
}

// Opens the pane unasked when it has something to show, unless the person
// closed it. Unasked, a narrow terminal keeps it undrawn until it widens.
const autoOpen = async ($: EngineInterface) => {
  try {
    if (!(await read($, isDismissed))) await $.ui.open({ id: PANE, title: TITLE })
  } catch {}
}

let isThreadsRefreshing = false

const refreshThreads = async ($: EngineInterface) => {
  if (isThreadsRefreshing) return
  isThreadsRefreshing = true
  try {
    const next = await fetchThreads($)
    await update($, threads, () => next)
    // A write that lands while the pane is mid-draw, after it read `threads`,
    // doesn't draw it again by itself; without this it stays on "loading".
    $.ui.invalidate('ui.render')
    const done = await read($, handled)
    if (next.status === 'ready' && next.threads.some(one => one.move === 'you' && !done.includes(one.id))) await autoOpen($)
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
    // Immediate: opening the pane touches nothing the running turn holds.
    await $.command.register({ name: 'cops-hq', description: 'Show the PR’s open review threads and this session’s cops agents', immediate: true })
    void refreshAll($, memory)
    $.clock.every(REFRESH_MS, () => refreshAll($, memory))
    return started
  })

  on('command.run', { command: 'cops-hq' }, async $ => {
    await update($, isDismissed, () => false)
    void refreshThreads($).catch(() => undefined)
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'Opened the COPS HQ pane.' : 'This surface doesn’t show panes.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') await update($, isDismissed, () => true).catch(() => undefined)
    return closed
  })

  // Offers the rule-like sentence of a prompt the person typed, while memory is on.
  // The offer stays until the person takes or dismisses it, or a later rule replaces it.
  on('prompt.submit', async ($, e, next) => {
    const submitted = await next(e)
    try {
      if (submitted.drop !== undefined) return submitted
      const sentence = findRule({ text: e.text, origin: e.origin.kind })
      if (!sentence) return submitted
      const ran = await run($, ['bash', `${$.plugin.root}/hooks/memory-context.sh`, 'claude', memory.path, memory.login])
      if (ran?.exitCode === 0 && ran.stdout.includes('COPS memory root:')) await update($, ruleOffer, () => sentence)
    } catch {}
    return submitted
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const sentence = await read($, ruleOffer)
    if (e.props.hasSurvey || !sentence) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={1}>
        <Text wrap="truncate-end">Remember “{sentence}”?</Text>
        <Button
          key="remember-personally"
          label="Remember personally"
          onPress={async () => {
            if ((await $.prompt.fill({ text: `Remember this rule: ${sentence}` })).isFilled) await update($, ruleOffer, () => null)
          }}
        />
        <Button
          key="record-team"
          label="Record for team"
          onPress={async () => {
            if ((await $.prompt.fill({ text: `record-team: ${sentence}` })).isFilled) await update($, ruleOffer, () => null)
          }}
        />
        <Button key="dismiss" label="Dismiss" role="dismiss" onPress={() => update($, ruleOffer, () => null)} />
      </Box>
    )
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (PUSH.test(e.command) && ran.deny === undefined && ran.isError !== true) await clearHandled($)
    if (BRANCH_COMMAND.test(e.command)) void refreshThreads($).catch(() => undefined)
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const agent = e.subagent_type ?? ''
    if (!agent.startsWith('cops:')) return next(e)
    const startedAt = await $.clock.now()
    const call: AgentCall = { id: e.tool_use_id, agent, startedAt, state: 'running', ...describeCall(agent, e.prompt) }
    await update($, agents, list => [...list, call].slice(-50))
    void autoOpen($)
    // Redraws the pane so the running call's spinner moves.
    const spin = $.clock.every(SPINNER_MS, () => $.ui.invalidate('ui.render'))
    const ran = await next(e)
      .finally(() => spin.cancel())
      .catch(async error => {
        // A lower hook threw: the row shows ✗ rather than spinning on, and the hook's catch still runs.
        await setCall($, call.id, { state: 'failed', durationMs: await elapsedSince($, startedAt), outcome: snippet(error instanceof Error ? error.message : '') || 'failed' })
        throw error
      })
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
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const now = await $.clock.now()
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
            <Link href={thread.url}>{where}</Link> · {thread.lastAuthor}: {thread.lastBody}
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
            <Text bold>Threads · <Link href={view.url}>{`PR #${view.pr}`}</Link></Text>
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
              <Text color={call.state === 'failed' ? 'error' : undefined} wrap="truncate-end">{describeAgent({ call, now })}</Text>
              {call.isLeak && <Text color="error">  pr-sidekick was given memory-root; it must never read memory.</Text>}
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
