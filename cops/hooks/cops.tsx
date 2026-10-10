import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentCall, InboxItem, Thread, Threads } from '../types'
import { parseSuffixes } from './memory-inbox.ts'
import { checkLoaded, checkTool, EXPECTED_HANDOFFS, tickedBy } from './orchestration.ts'
import { describeAgent, describeCall, describeOutcome, snippet, SPINNER_MS, THREADS_QUERY, toThreads } from './pr-panel.ts'
import type { ThreadsResponse } from './pr-panel.ts'
import { findRule } from './rule-band.ts'
import { countLines, describeCapacityWarning, describeMemory } from './status-line.ts'

// The plugin's one hooks module: the status line, the COPS HQ pane of threads,
// agents with their orchestration checks and the memory inbox, and the band offering
// to remember a rule the person typed. What each says is worked out in status-line.ts,
// pr-panel.ts, orchestration.ts, memory-inbox.ts and rule-band.ts.

const REFRESH_MS = 120_000
// Bash commands that can change the branch or its PR.
const BRANCH_COMMAND = /\b(git\s+(checkout|switch|commit|push|pull|merge|rebase|reset)|gh\s+pr)\b/
const PUSH = /\bgit\s+push\b/
const PANE = 'cops-hq'
const TITLE = 'COPS HQ'
// The `$.store` key of the memory inbox, kept across sessions.
const INBOX = 'inbox'
const INBOX_LIMIT = 50
// The `$.store` key of the `kind: text` lines dropped from the inbox, kept so they aren't collected again.
const DROPPED = 'dropped'
const DROPPED_LIMIT = 200

const threads = atom({ plugin: 'cops', key: 'threads' } as const, { status: 'loading' })
const handled = atom({ plugin: 'cops', key: 'handled' } as const, [])
const agents = atom({ plugin: 'cops', key: 'agents' } as const, [])
const isDismissed = atom({ plugin: 'cops', key: 'isDismissed' } as const, false)
const ruleOffer = atom({ plugin: 'cops', key: 'ruleOffer' } as const, null)
const isMemoryOn = atom({ plugin: 'cops', key: 'isMemoryOn' } as const, false)
const openItems = atom({ plugin: 'cops', key: 'openItems' } as const, [])
const checklist = atom({ plugin: 'cops', key: 'checklist' } as const, null)

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
  const isOn = ran?.exitCode === 0 && ran.stdout.includes('COPS memory root:')
  if ((await read($, isMemoryOn)) !== isOn) {
    await update($, isMemoryOn, () => isOn)
    // The pane shows the memory inbox only while memory is on.
    $.ui.invalidate('ui.render')
  }
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

// Memory inbox

let hasToastedInbox = false

// What the store holds under INBOX; anything there that isn't an item is left out.
const readInbox = async ($: EngineInterface): Promise<InboxItem[]> => {
  const isItem = (value: unknown): value is InboxItem =>
    typeof value === 'object' && value !== null
    && 'kind' in value && typeof value.kind === 'string' && ['memory-candidate', 'promote', 'conflict', 'open'].includes(value.kind)
    && 'text' in value && typeof value.text === 'string'
  const stored = await $.store.get(INBOX)
  return Array.isArray(stored) ? stored.filter(isItem) : []
}

// What the store holds under DROPPED; anything there that isn't a string is left out.
const readDropped = async ($: EngineInterface): Promise<string[]> => {
  const stored = await $.store.get(DROPPED)
  return Array.isArray(stored) ? stored.filter(one => typeof one === 'string') : []
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

// Each running cops agent's Bash commands this run, by its agentId, for the 4th-try check.
const commands = new Map<string, string[]>()

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
    const call: AgentCall = {
      id: e.tool_use_id, agent, startedAt, state: 'running', ...describeCall({ agent, prompt: e.prompt }),
      mayRewrite: agent === 'cops:pr-sidekick' && /\brebase\b|\bforce[- ]push/i.test(e.prompt),
    }
    await update($, agents, list => [...list, call].slice(-50))
    void autoOpen($)
    // Redraws the pane so the running call's spinner moves.
    const spin = $.clock.every(SPINNER_MS, () => $.ui.invalidate('ui.render'))
    const ran = await next(e)
      .finally(() => spin.cancel())
      .catch(async error => {
        // A lower hook threw: mark the row failed (✗) and rethrow so the hook's catch still runs.
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
      // Entries on the `deviations:` line, split on `;`:
      //   `deviations: none`        → 0
      //   no line                   → 0
      //   `deviations: renamed x`   → 1
      //   `deviations: a; b; c`     → 3
      const entries = /^deviations:[ \t]*(.*)$/mi.exec(ran.text ?? '')?.[1]?.split(';').map(one => one.trim()).filter(Boolean) || []
      const deviations = entries.length === 1 && entries[0]?.toLowerCase() === 'none' ? 0 : entries.length
      await setCall($, call.id, { state: 'done', ...totals, deviations, outcome: describeOutcome(ran.text ?? '') })
      // Keeps the result's memory lines in the inbox while memory is on.
      try {
        const found = parseSuffixes({ text: ran.text ?? '', modes: call.modes })
        const context = found.length > 0 ? await run($, ['bash', `${$.plugin.root}/hooks/memory-context.sh`, 'claude', memory.path, memory.login]) : undefined
        if (context?.exitCode === 0 && context.stdout.includes('COPS memory root:')) {
          const inbox = await readInbox($)
          const asked = await read($, openItems)
          const dropped = await readDropped($)
          const view = await read($, threads)
          const remote = await run($, ['git', 'remote', 'get-url', 'origin'])
          // The repository's name from its remote URL:
          //   'git@github.com:eddeee888/ai-skills.git' → 'ai-skills'
          //   'https://github.com/eddeee888/ai-skills' → 'ai-skills'
          const repo = remote?.exitCode === 0 ? /([^/:]+?)(?:\.git)?\/?$/.exec(remote.stdout.trim())?.[1] : undefined
          const added = found
            .filter(item => ![...inbox, ...asked].some(one => one.kind === item.kind && one.text === item.text) && !dropped.includes(`${item.kind}: ${item.text}`))
            .map(item => ({ ...item, repo, pr: view.status === 'ready' ? view.pr : undefined }))
          if (added.length > 0) {
            // An `open:` question goes back to the main chat right away, so it's kept for this session only.
            const kept = added.filter(one => one.kind !== 'open')
            if (kept.length > 0) await $.store.set(INBOX, [...inbox, ...kept].slice(-INBOX_LIMIT))
            await update($, openItems, list => [...list, ...added.filter(one => one.kind === 'open')])
            $.ui.invalidate('ui.render')
            if (!hasToastedInbox) {
              hasToastedInbox = true
              $.ui.toast(`COPS memory inbox: ${added.length} new in the COPS HQ pane.`)
            }
            for (const item of added.filter(one => one.kind === 'conflict')) $.ui.toast(`COPS memory conflict: ${item.text}`)
          }
        }
      } catch {}
    }
    return ran
  }).catch(($, e, next) => next(e))

  // A cops skill with handoffs (EXPECTED_HANDOFFS) starts its checklist, replacing the last one.
  on('skill.prompt', async ($, e, next) => {
    const prompted = await next(e)
    try {
      const skill = [e.skill, `cops:${e.skill}`].find(one => EXPECTED_HANDOFFS[one])
      if (skill) {
        await update($, checklist, () => ({ skill, ticked: [] }))
        $.ui.invalidate('ui.render')
      }
    } catch {}
    return prompted
  })

  // Ticks the handoffs a main-chat spawn makes, and links a cops agent's call to its loop.
  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    try {
      const running = await read($, checklist)
      const ticked = running && e.parentAgentId === undefined
        ? tickedBy({ skill: running.skill, agent: e.subagentType, modes: describeCall({ agent: e.subagentType, prompt: e.prompt }).modes || [] })
        : []
      if (running && ticked.length > 0) await update($, checklist, () => ({ ...running, ticked: [...new Set([...running.ticked, ...ticked])] }))
      if (spawned.deny === undefined && spawned.agentId && e.subagentType.startsWith('cops:')) await setCall($, e.tool_use_id, { agentId: spawned.agentId })
      if (ticked.length > 0) $.ui.invalidate('ui.render')
    } catch {}
    return spawned
  })

  // Flags a cops agent's tool call that breaks its agent file's rules, toasting each rule once; the call still runs.
  on('tool.call', async ($, e, next) => {
    try {
      const call = e.agentId ? (await read($, agents)).find(one => one.agentId === e.agentId) : undefined
      if (call && e.agentId) {
        const command = e.tool === 'Bash' ? e.command : undefined
        const run = command === undefined ? commands.get(e.agentId) || [] : [...(commands.get(e.agentId) || []), command]
        commands.set(e.agentId, run)
        const path = 'file_path' in e && typeof e.file_path === 'string' ? e.file_path : 'notebook_path' in e && typeof e.notebook_path === 'string' ? e.notebook_path : undefined
        const found = checkTool({ call, tool: e.tool, command, path, tries: run.filter(one => one === command).length })
        const added = found.filter(flag => !call.flags?.includes(flag))
        if (added.length > 0) {
          await setCall($, call.id, { flags: [...(call.flags || []), ...added] })
          $.ui.invalidate('ui.render')
          const name = call.agent === 'cops:pr-oracle' ? 'Oracle' : 'Sidekick'
          for (const flag of added) $.ui.toast(`COPS rule check: ${name} ${flag}.`)
        }
      }
    } catch {}
    return next(e)
  })

  // Checks a cops oracle's `loaded:` once its run ends, and ends the run's 4th-try count.
  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)
    try {
      const call = e.agentId ? (await read($, agents)).find(one => one.agentId === e.agentId) : undefined
      if (call && e.agentId) {
        commands.delete(e.agentId)
        if (call.agent === 'cops:pr-oracle') {
          await setCall($, call.id, { missingLoads: checkLoaded({ text: e.answer, modes: call.modes || [] }) })
          $.ui.invalidate('ui.render')
        }
      }
    } catch {}
    return completed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const now = await $.clock.now()
    const view = await read($, threads)
    const done = await read($, handled)
    const calls = await read($, agents)
    const running = await read($, checklist)
    // A store that can't be read hides the inbox, not the pane.
    // The inbox stays in the store while memory is off, and shows again once it's on.
    const inbox = (await read($, isMemoryOn)) ? [...(await readInbox($).catch(() => [])), ...(await read($, openItems))] : []

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

    const clear = async ({ item }: { item: InboxItem }): Promise<void> => {
      if (item.kind === 'open') await update($, openItems, list => list.filter(one => one.text !== item.text))
      else await $.store.set(INBOX, (await readInbox($)).filter(one => one.kind !== item.kind || one.text !== item.text))
      $.ui.invalidate('ui.render')
    }

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
          {running && (
            <Box flexDirection="column">
              <Text>Handoffs · {running.skill.replace(/^cops:/, '')}</Text>
              {(EXPECTED_HANDOFFS[running.skill] || []).map(handoff => (
                <Text key={`handoff-${handoff.label}`} dimColor={!running.ticked.includes(handoff.label)}>
                  {running.ticked.includes(handoff.label) ? '[x]' : '[ ]'} {handoff.label}
                </Text>
              ))}
            </Box>
          )}
          {calls.length === 0 && <Text dimColor>No cops agent calls yet.</Text>}
          {calls.map(call => (
            <Box key={call.id} flexDirection="column">
              <Text color={call.state === 'failed' ? 'error' : undefined} wrap="truncate-end">{describeAgent({ call, now })}</Text>
              {call.isLeak && <Text color="error">  pr-sidekick was given memory-root; it must never read memory.</Text>}
              {call.flags?.map(flag => <Text key={`flag-${call.id}-${flag}`} color="error" wrap="truncate-end">  ⚑ {flag}</Text>)}
            </Box>
          ))}
        </Box>
        {inbox.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Inbox ({inbox.length})</Text>
            {inbox.map((item, index) => {
              // A candidate from a call that ran triage-threads can be parked, one from grill-description
              // remembered; every line can be dropped.
              const take = item.kind !== 'memory-candidate' ? undefined
                : item.modes?.includes('triage-threads') ? { key: 'park', label: 'Park as candidate', text: `Park this as a memory candidate: ${item.text}` }
                : item.modes?.includes('grill-description') ? { key: 'remember', label: 'Remember', text: `Remember this rule: ${item.text}` }
                : undefined
              // Where the line came from: 'ai-skills#59', 'ai-skills' outside a PR, '' when unknown.
              const source = `${item.repo || ''}${item.pr ? `#${item.pr}` : ''}`
              return (
                <Box key={`inbox-${index}`} flexDirection="row" gap={1}>
                  <Text color={item.kind === 'conflict' ? 'warning' : undefined} wrap="truncate-end">
                    {item.kind}: {item.text}
                    {source && <Text dimColor> · {source}</Text>}
                  </Text>
                  {take && (
                    <Button
                      key={`${take.key}-${index}`}
                      label={take.label}
                      onPress={async () => {
                        if ((await $.prompt.fill({ text: take.text })).isFilled) await clear({ item })
                      }}
                    />
                  )}
                  <Button
                    key={`drop-${index}`}
                    label="Drop"
                    role="dismiss"
                    onPress={async () => {
                      const line = `${item.kind}: ${item.text}`
                      await $.store.set(DROPPED, [...(await readDropped($)).filter(one => one !== line), line].slice(-DROPPED_LIMIT))
                      await clear({ item })
                    }}
                  />
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })
}
