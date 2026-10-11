import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentCall, InboxItem, SkillRun, Thread, Threads } from '../types'
import { parseMemoryGit } from './memory-git.ts'
import type { MemoryGit } from './memory-git.ts'
import { parseSuffixes } from './memory-inbox.ts'
import { checkLoaded, checkTool, EXPECTED_HANDOFFS, tickedBy } from './orchestration.ts'
import { describeActivity, describeAgent, describeCall, describeNext, describeOutcome, describeSkill, groupActivity, isSameSkill, snippet, SPINNER_MS, summarize, THREADS_QUERY, toThreads } from './pr-panel.ts'
import type { ThreadsResponse } from './pr-panel.ts'
import { findRule } from './rule-band.ts'
import { countUses, describeRules, describeUse, hashRule, matchEntries, parseEntries, parseReply, toRuleUsage } from './rule-usage.ts'
import { countLines, describeCapacityWarning, describeMemory } from './status-line.ts'
import { addUsage, describeUsage, keyCall, toUsage } from './usage-stats.ts'

// The plugin's one hooks module: the status line, the COPS HQ pane of threads,
// the next skill, skill runs with their agent calls and orchestration checks, and the memory inbox, its Rules tab of
// remembered rules' usage, and the band offering to remember a rule the person typed. What each says is worked out in
// status-line.ts, pr-panel.ts, orchestration.ts, memory-inbox.ts, rule-usage.ts and rule-band.ts.

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
// The `$.store` key of how often each remembered rule matched a brief-task or sweep-diff reply, kept across sessions.
const RULE_USAGE = 'ruleUsage'
// The `$.store` key of what finished cops agent calls cost per mode or job, kept across sessions.
const USAGE = 'usage'

const threads = atom({ plugin: 'cops', key: 'threads' } as const, { status: 'loading' })
const handled = atom({ plugin: 'cops', key: 'handled' } as const, [])
const agents = atom({ plugin: 'cops', key: 'agents' } as const, [])
const skills = atom({ plugin: 'cops', key: 'skills' } as const, [])
const isDismissed = atom({ plugin: 'cops', key: 'isDismissed' } as const, false)
const ruleOffer = atom({ plugin: 'cops', key: 'ruleOffer' } as const, null)
const isMemoryOn = atom({ plugin: 'cops', key: 'isMemoryOn' } as const, false)
const openItems = atom({ plugin: 'cops', key: 'openItems' } as const, [])
const checklist = atom({ plugin: 'cops', key: 'checklist' } as const, null)
const paneTab = atom({ plugin: 'cops', key: 'paneTab' } as const, 'hq')
const memoryRules = atom({ plugin: 'cops', key: 'memoryRules' } as const, [])

const run = async ($: EngineInterface, argv: readonly string[]) => {
  try {
    return await $.process.run(argv, { timeoutMs: 15_000 })
  } catch {
    return undefined
  }
}

// Failures

// The steps that failed this run, each toasted once. A step that fails leaves the pane or
// status line short, never the tool, prompt or command it ran beside, so it reports instead of throwing:
//   step 'record' → 'COPS HQ couldn't record /cops:pr-start in Activity: <error>'
// Expected misses stay quiet where the pane already says so: a process that fails (`run`),
// a MEMORY.md that isn't there, gh output that doesn't parse ("needs gh").
const failed = new Set<string>()

const reportFailure = ($: EngineInterface, { step, what, error }: { step: string; what: string; error: unknown }): void => {
  if (failed.has(step)) {
    return
  }
  failed.add(step)
  try {
    $.ui.toast(`COPS HQ couldn't ${what}: ${snippet(error instanceof Error ? error.message : String(error)) || 'unknown error'}`)
  } catch {}
}

// The personal and team MEMORY.md that memory-context.sh's output names, and their rules; a file that can't be read is undefined.
const readMemory = async ($: EngineInterface, { context }: { context: string }): Promise<{ personal?: string; team?: string; rules: { rule: string; source: 'personal' | 'team' }[] }> => {
  const readFile = async ({ file }: { file: string }): Promise<string | undefined> => {
    try {
      return await $.fs.read(file)
    } catch {
      return undefined
    }
  }
  // The script's resolved root, so PR_MEMORY_PATH counts as much as the option.
  const root = /^COPS memory root: (.+)$/m.exec(context)?.[1]
  const memoryLogin = /^COPS memory login: (\S+)$/m.exec(context)?.[1]
  if (!root) {
    return { rules: [] }
  }
  const [personal, team] = await Promise.all([
    memoryLogin ? readFile({ file: `${root}/memory/users/${memoryLogin}/MEMORY.md` }) : undefined,
    readFile({ file: `${root}/memory/team/MEMORY.md` }),
  ])
  return {
    personal,
    team,
    rules: [
      ...(personal === undefined ? [] : parseEntries({ text: personal }).map(rule => ({ rule, source: 'personal' }))),
      ...(team === undefined ? [] : parseEntries({ text: team }).map(rule => ({ rule, source: 'team' }))),
    ],
  }
}

// Uncommitted and unpushed changes in the memory repository, read-only; undefined when git can't say.
// No upstream leaves `unpushed` out.
const readMemoryGit = async ($: EngineInterface, { root }: { root: string }): Promise<MemoryGit | undefined> => {
  const [status, ahead] = await Promise.all([
    run($, ['git', '--no-optional-locks', '-C', root, 'status', '--porcelain', '--untracked-files=all']),
    run($, ['git', '-C', root, 'rev-list', '--count', '@{u}..HEAD']),
  ])
  if (status?.exitCode !== 0) {
    return undefined
  }
  return parseMemoryGit({ porcelain: status.stdout, ahead: ahead?.exitCode === 0 ? ahead.stdout : undefined })
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
  if (ran?.exitCode !== 0) {
    return undefined
  }
  const files = await readMemory($, { context: ran.stdout })
  // The script's resolved root, the one memory is on for.
  const root = /^COPS memory root: (.+)$/m.exec(ran.stdout)?.[1]
  const git = isOn && root ? await readMemoryGit($, { root }) : undefined
  const usage = {
    personal: files.personal === undefined ? undefined : countLines({ text: files.personal }),
    team: files.team === undefined ? undefined : countLines({ text: files.team }),
  }
  // The Rules tab lists these.
  if (JSON.stringify(await read($, memoryRules)) !== JSON.stringify(files.rules)) {
    await update($, memoryRules, () => files.rules)
    $.ui.invalidate('ui.render')
  }
  const warning = describeCapacityWarning({ usage })
  if (warning && !hasWarnedCapacity) {
    hasWarnedCapacity = true
    $.ui.toast(warning)
  }
  return describeMemory({ context: ran.stdout, usage, git })
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

// The last read-add-write of the stored usage; each next one starts when it ends, so no update is lost.
let usageWrites = Promise.resolve()

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
  const pr = await run($, ['gh', 'pr', 'view', '--json', 'number,url,state'])
  if (pr?.exitCode !== 0) return { status: pr?.stderr.includes('no pull requests found') ? 'no-pr' : 'needs-gh' }
  try {
    // JSON.parse returns `any`; dropping these casts takes a runtime check of gh's output.
    const { number, url, state } = JSON.parse(pr.stdout) as { number: number; url: string; state?: string }
    const ran = await run($, [
      'gh', 'api', 'graphql', '-F', 'owner={owner}', '-F', 'name={repo}', '-F', `number=${number}`, '-f', `query=${THREADS_QUERY}`,
    ])
    if (ran?.exitCode !== 0) return { status: 'needs-gh' }
    const response = JSON.parse(ran.stdout) as ThreadsResponse
    // gh also finds a branch's merged or closed PR; anything else counts as open.
    const prState = state === 'MERGED' || state === 'CLOSED' ? state : 'OPEN'
    return { status: 'ready', pr: number, url, state: prState, threads: toThreads(response), ...summarize({ response }) }
  } catch {
    return { status: 'needs-gh' }
  }
}

// Opens the pane unasked when it has something to show, unless the person
// closed it. Unasked, a narrow terminal keeps it undrawn until it widens.
const autoOpen = async ($: EngineInterface) => {
  try {
    if (!(await read($, isDismissed))) await $.ui.open({ id: PANE, title: TITLE })
  } catch (error) {
    reportFailure($, { step: 'open', what: 'open the pane', error })
  }
}

let isThreadsRefreshing = false

const refreshThreads = async ($: EngineInterface): Promise<void> => {
  if (isThreadsRefreshing) return
  isThreadsRefreshing = true
  try {
    const next = await fetchThreads($)
    await update($, threads, () => next)
    // A write that lands while the pane is mid-draw, after it read `threads`,
    // doesn't draw it again by itself; without this it stays on "loading".
    $.ui.invalidate('ui.render')
    const done = await read($, handled)
    // A finished PR's leftover threads don't need you.
    if (next.status === 'ready' && next.state === 'OPEN' && next.threads.some(one => one.move === 'you' && !done.includes(one.id))) await autoOpen($)
  } finally {
    isThreadsRefreshing = false
  }
}

// Refreshes run in the background; one that fails leaves the last view up.
const refreshAll = async ($: EngineInterface, memory: Memory) => {
  await Promise.all([
    refreshStatus($, memory).catch(error => reportFailure($, { step: 'status', what: 'refresh the status line', error })),
    refreshThreadsReported($),
  ])
}

const refreshThreadsReported = ($: EngineInterface): Promise<void> =>
  refreshThreads($).catch(error => reportFailure($, { step: 'threads', what: 'refresh the PR’s threads', error }))

const elapsedSince = async ($: EngineInterface, startedAt: number) => {
  try {
    return (await $.clock.now()) - startedAt
  } catch (error) {
    reportFailure($, { step: 'elapsed', what: 'time an agent call', error })
    return undefined
  }
}

// Bookkeeping after a tool ran never throws: the hook's catch would run the tool again.
const setCall = async ($: EngineInterface, id: string, change: Partial<AgentCall>) => {
  try {
    await update($, agents, list => list.map(call => (call.id === id ? { ...call, ...change } : call)))
  } catch (error) {
    reportFailure($, { step: 'agent-row', what: 'update an agent row', error })
  }
}

// Skill runs

// What a skill run in flight was started by, so `skill.prompt` can tell who asked:
// the last slash command typed, and the Skill tool calls still running.
let typed: { command: string; args: string } | undefined
const calling: { skill: string; args?: string; isPrompted?: boolean }[] = []

// `source` is set when `skill.prompt` never fired for the run (a managed plugin above can skip it),
// naming the hook that recorded it instead.
const recordSkill = async ($: EngineInterface, { skill, source }: { skill: string; source?: SkillRun['source'] }): Promise<void> => {
  const byModel = calling.find(one => isSameSkill({ a: one.skill, b: skill }))
  const byYou = !byModel && typed && isSameSkill({ a: typed.command, b: skill }) ? typed : undefined
  if (byModel && !source) byModel.isPrompted = true
  if (byYou) typed = undefined
  const args = (byModel?.args ?? byYou?.args)?.trim() || undefined
  const at = await $.clock.now()
  const by = byModel ? 'model' : byYou ? 'you' : 'other'
  // Numbered from the last run kept, so a number stays put once older runs drop off.
  await update($, skills, list => [...list, { n: (list.at(-1)?.n ?? 0) + 1, skill, ...(args && { args }), by, ...(source && { source }), at } satisfies SkillRun].slice(-50))
  $.ui.invalidate('ui.render')
}

// Records the run in Activity and starts its Handoffs checklist: a cops skill with handoffs (EXPECTED_HANDOFFS)
// starts its own, any other skill clears it. Never throws, so the skill's prompt or call goes on untouched.
const startRun = async ($: EngineInterface, { skill, source }: { skill: string; source?: SkillRun['source'] }): Promise<void> => {
  try {
    await recordSkill($, { skill, source })
  } catch (error) {
    reportFailure($, { step: 'record', what: `record /${skill} in Activity`, error })
  }
  try {
    const handoffs = [skill, `cops:${skill}`].find(one => EXPECTED_HANDOFFS[one])
    await update($, checklist, () => (handoffs ? { skill: handoffs, ticked: [] } : null))
    $.ui.invalidate('ui.render')
  } catch (error) {
    reportFailure($, { step: 'checklist', what: `start the Handoffs checklist for /${skill}`, error })
  }
}

// Whether a typed command is a skill, by the skill listing the session gives the model.
// The `summary` breakdown is counted locally, with no request sent.
const isSkill = async ($: EngineInterface, { command }: { command: string }): Promise<boolean> => {
  const usage = await $.session.usage({ breakdown: 'summary' })
  return (usage.context.breakdown?.skills?.skillFrontmatter ?? []).some(one => isSameSkill({ a: one.name, b: command }))
}

// Each running cops agent's Bash commands this run, by its agentId, for the 4th-try check.
const commands = new Map<string, string[]>()

const clearHandled = async ($: EngineInterface) => {
  try {
    await update($, handled, () => [])
  } catch (error) {
    reportFailure($, { step: 'handled', what: 'clear the threads marked handled after a push', error })
  }
}

export const register: Register = (on, options) => {
  const memory: Memory = {
    path: typeof options.memory_path === 'string' ? options.memory_path : '',
    login: typeof options.memory_login === 'string' ? options.memory_login : '',
  }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // Immediate: opening the pane touches nothing the running turn holds.
    await $.command.register({ name: 'cops-hq', description: 'Show the PR’s open review threads, the next cops skill, and this session’s agent calls and skill runs', immediate: true })
    void refreshAll($, memory)
    $.clock.every(REFRESH_MS, () => refreshAll($, memory))
    return started
  })

  // Toasts if the memory repository has changes that aren't committed, while memory is on.
  on('session.end', async ($, e, next) => {
    try {
      const ran = await run($, ['bash', `${$.plugin.root}/hooks/memory-context.sh`, 'claude', memory.path, memory.login])
      const root = ran?.exitCode === 0 && ran.stdout.includes('COPS memory root:') ? /^COPS memory root: (.+)$/m.exec(ran.stdout)?.[1] : undefined
      const git = root ? await readMemoryGit($, { root }) : undefined
      if (git?.uncommitted) {
        $.ui.toast(`COPS memory: ${git.uncommitted} uncommitted change${git.uncommitted === 1 ? '' : 's'} in the memory repository; commit them or they stay local.`)
      }
    } catch (error) {
      reportFailure($, { step: 'memory-git', what: 'check the memory repository for uncommitted changes', error })
    }
    return next(e)
  })

  on('command.run', { command: 'cops-hq' }, async $ => {
    await update($, isDismissed, () => false)
    void refreshThreadsReported($)
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'Opened the COPS HQ pane.' : 'This surface doesn’t show panes.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') {
      await update($, isDismissed, () => true).catch(error => reportFailure($, { step: 'dismiss', what: 'remember the pane was closed', error }))
    }
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
    } catch (error) {
      reportFailure($, { step: 'rule-offer', what: 'offer to remember the rule you typed', error })
    }
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

  // A typed `/name args`; `skill.prompt` claims it when `name` turns out to be a skill.
  // Left unclaimed, as when a managed plugin above skips `skill.prompt`, a skill is recorded here.
  on('command.run', async ($, e, next) => {
    if (e.origin.kind === 'plugin') return next(e)
    const entry = { command: e.command, args: e.args }
    typed = entry
    const ran = await next(e)
    try {
      if (typed === entry && (await isSkill($, { command: e.command }))) await startRun($, { skill: e.command, source: 'typed' })
    } catch (error) {
      reportFailure($, { step: 'typed', what: `tell whether /${e.command} is a skill`, error })
    }
    return ran
  })

  // A Skill call `skill.prompt` didn't see, as when a managed plugin above skips it, is recorded here.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const entry: (typeof calling)[number] = { skill: e.skill, args: e.args }
    calling.push(entry)
    try {
      const ran = await next(e)
      if (!entry.isPrompted && ran.deny === undefined && ran.isError !== true) await startRun($, { skill: e.skill, source: 'tool.call' })
      return ran
    } finally {
      calling.splice(calling.indexOf(entry), 1)
    }
  })

  // Every skill reaches the model through here: typed, called by the model, or preloaded.
  on('skill.prompt', async ($, e, next) => {
    const expanded = await next(e)
    await startRun($, { skill: e.skill })
    return expanded
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (PUSH.test(e.command) && ran.deny === undefined && ran.isError !== true) await clearHandled($)
    if (BRANCH_COMMAND.test(e.command)) void refreshThreadsReported($)
    return ran
  }).catch(($, e, next) => next(e))

  // Every agent call gets a row; the pane opening by itself, the rule counts, deviations,
  // memory lines and rule usage are a cops agent's alone.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const agent = e.subagent_type || 'general-purpose'
    const isCops = agent.startsWith('cops:')
    let startedAt: number
    let call: AgentCall
    // A row that can't be added leaves the call to run untracked.
    try {
      startedAt = await $.clock.now()
      call = {
        id: e.tool_use_id, agent, startedAt, state: 'running', model: e.model, ...(isCops && describeCall({ agent, prompt: e.prompt })),
        mayRewrite: agent === 'cops:pr-sidekick' && /\brebase\b|\bforce[- ]push/i.test(e.prompt),
      }
      await update($, agents, list => [...list, call].slice(-50))
    } catch (error) {
      reportFailure($, { step: 'agent-add', what: `add a row for ${agent}`, error })
      return next(e)
    }
    if (isCops) void autoOpen($)
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
      await setCall($, call.id, { state: 'done', ...totals, ...(isCops && { deviations }), outcome: describeOutcome(ran.text ?? '') })
      if (!isCops) return ran
      // Adds a completed call's time and tokens to its mode's or job's usage, split by model.
      try {
        if ((agent === 'cops:pr-oracle' || agent === 'cops:pr-sidekick') && 'tokens' in totals) {
          const running = await read($, checklist)
          const job = running ? tickedBy({ skill: running.skill, agent, modes: [] })[0] : undefined
          const written = usageWrites.then(async () => {
            await $.store.set(USAGE, addUsage({
              usage: toUsage({ stored: await $.store.get(USAGE) }),
              key: keyCall({ agent, modes: call.modes, job }),
              model: e.model || 'inherit',
              durationMs: totals.durationMs,
              tokens: totals.tokens,
              now: await $.clock.now(),
            }))
          })
          usageWrites = written.catch(() => undefined)
          await written
          $.ui.invalidate('ui.render')
        }
      } catch (error) {
        reportFailure($, { step: 'usage', what: 'add the call to the usage stats', error })
      }
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
      } catch (error) {
        reportFailure($, { step: 'inbox', what: 'collect memory lines for the inbox', error })
      }
      // A learn-feedback call may have written memory, so the status line's git counts are read again.
      if (agent === 'cops:pr-oracle' && call.modes?.includes('learn-feedback')) {
        void refreshStatus($, memory).catch(error => reportFailure($, { step: 'status', what: 'refresh the status line', error }))
      }
      // Counts the remembered rules a plain brief-task or a sweep-diff reply cites, while memory is on.
      // A `for: pr-sidekick` brief lists every rule that could apply, so it doesn't show which rules fire.
      try {
        const isSidekickBrief = /^for:\s*pr-sidekick\b/mi.test(e.prompt)
        if (agent === 'cops:pr-oracle' && call.modes?.some(one => one === 'sweep-diff' || (one === 'brief-task' && !isSidekickBrief))) {
          const context = await run($, ['bash', `${$.plugin.root}/hooks/memory-context.sh`, 'claude', memory.path, memory.login])
          if (context?.exitCode === 0 && context.stdout.includes('COPS memory root:')) {
            const { rules } = await readMemory($, { context: context.stdout })
            const keys = matchEntries({ entries: rules.map(one => one.rule), cited: parseReply({ text: ran.text ?? '' }) }).map(rule => hashRule({ text: rule }))
            if (keys.length > 0) {
              await $.store.set(RULE_USAGE, countUses({ usage: toRuleUsage({ stored: await $.store.get(RULE_USAGE) }), keys, now: await $.clock.now() }))
              $.ui.invalidate('ui.render')
            }
          }
        }
      } catch (error) {
        reportFailure($, { step: 'rule-usage', what: 'count remembered rule usage', error })
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

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
    } catch (error) {
      reportFailure($, { step: 'handoff-tick', what: 'tick the Handoffs checklist', error })
    }
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
          const before = call.flags || []
          await setCall($, call.id, { flags: [...before, ...added] })
          $.ui.invalidate('ui.render')
          const name = call.agent === 'cops:pr-oracle' ? 'Oracle' : 'Sidekick'
          // A flag's rule is its text without the command or path; the pane row keeps the full flag:
          //   'ran a non-read command: git push'            → 'ran a non-read command'
          //   'wrote /repo/a.ts outside its memory tree'    → 'wrote outside its memory tree'
          const toasted = new Set<string>()
          for (const [i, flag] of [...before, ...added].entries()) {
            const rule = flag.replace(/^wrote \S+ /, 'wrote ').replace(/:.*$/s, '')
            if (i >= before.length && !toasted.has(rule)) $.ui.toast(`COPS rule check: ${name} ${rule}.`)
            toasted.add(rule)
          }
        }
      }
    } catch (error) {
      reportFailure($, { step: 'rule-check', what: 'check a cops agent’s tool call', error })
    }
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
    } catch (error) {
      reportFailure($, { step: 'loaded-check', what: 'check the oracle’s loaded: line', error })
    }
    return completed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const now = await $.clock.now()
    const view = await read($, threads)
    const done = await read($, handled)
    const calls = await read($, agents)
    const runs = await read($, skills)
    const hint = describeNext({ view, handled: done, ran: runs.map(one => one.skill) })
    const lastRun = hint && runs.findLast(one => isSameSkill({ a: one.skill, b: hint.skill }))
    const activity = groupActivity({ runs, calls })
    const running = await read($, checklist)
    // The skill run the handoff checklist belongs to: the latest run of the checklist's skill.
    const checklistRun = running && runs.findLast(one => isSameSkill({ a: one.skill, b: running.skill }))
    // An agent call's row, indented under the skill run it started in.
    const agentRow = (call: AgentCall, indent: string) => (
      <Box key={call.id} flexDirection="column">
        <Text color={call.state === 'failed' ? 'error' : undefined} wrap="truncate-end">{indent}{describeAgent({ call, now })}</Text>
        {call.isLeak && <Text color="error">{indent}  pr-sidekick was given memory-root; it must never read memory.</Text>}
        {call.flags?.map(flag => <Text key={`flag-${call.id}-${flag}`} color="error" wrap="truncate-end">{indent}  ⚑ {flag}</Text>)}
      </Box>
    )
    const isOn = await read($, isMemoryOn)
    // The Rules and Stats tabs show only while memory is on.
    const tab = isOn ? await read($, paneTab) : 'hq'
    // A store that can't be read hides the inbox, not the pane.
    // The inbox stays in the store while memory is off, and shows again once it's on.
    const stored = async (): Promise<InboxItem[]> => {
      try {
        return await readInbox($)
      } catch (error) {
        reportFailure($, { step: 'read-inbox', what: 'read the memory inbox', error })
        return []
      }
    }
    const inbox = isOn ? [...(await stored()), ...(await read($, openItems))] : []
    const sources = tab === 'rules' ? await read($, memoryRules) : []
    const rules = tab === 'rules'
      ? describeRules({ entries: sources.map(one => one.rule), usage: toRuleUsage({ stored: await $.store.get(RULE_USAGE).catch(() => undefined) }), now })
      : undefined
    const usage = tab === 'stats' ? toUsage({ stored: await $.store.get(USAGE).catch(() => undefined) }) : undefined

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

    // HQ | Rules | Stats, while memory is on; the tab shown is drawn as the primary button.
    const tabs = isOn && (
      <Box flexDirection="row" gap={1}>
        <Button key="tab-hq" label="HQ" variant={tab === 'hq' ? 'primary' : undefined} dimColor={tab !== 'hq'} onPress={() => update($, paneTab, () => 'hq')} />
        <Button key="tab-rules" label="Rules" variant={tab === 'rules' ? 'primary' : undefined} dimColor={tab !== 'rules'} onPress={() => update($, paneTab, () => 'rules')} />
        <Button key="tab-stats" label="Stats" variant={tab === 'stats' ? 'primary' : undefined} dimColor={tab !== 'stats'} onPress={() => update($, paneTab, () => 'stats')} />
      </Box>
    )

    if (tab === 'stats') {
      const usageRows = describeUsage({ usage })
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          <Box flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text bold>Usage</Text>
              <Button key="reset-usage" label="Reset" onPress={async () => {
                try {
                  const written = usageWrites.then(async () => {
                    await $.store.set(USAGE, { since: await $.clock.now(), keys: {} })
                  })
                  usageWrites = written.catch(() => undefined)
                  await written
                  $.ui.invalidate('ui.render')
                } catch (error) {
                  reportFailure($, { step: 'usage', what: 'reset the usage stats', error })
                }
              }} />
              {usage && <Text dimColor>since {new Date(usage.since).toISOString().slice(0, 10)}</Text>}
            </Box>
            <Text dimColor>Average time and tokens per call, by pr-oracle mode or pr-sidekick job.</Text>
            {usageRows.length === 0 ? <Text dimColor>none</Text> : usageRows.map(one => <Text key={`usage-${one.key}`} wrap="truncate-end">{one.text}</Text>)}
          </Box>
        </Box>
      )
    }

    if (rules) {
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          <Box flexDirection="column">
            <Text bold>Stale rules ({rules.stale.length})</Text>
            <Text dimColor>Not matched by a brief or sweep in 30 days, or ever.</Text>
            {rules.stale.length === 0 ? <Text dimColor>none</Text> : rules.stale.map((row, index) => (
              <Box key={`stale-${row.key}`} flexDirection="row" gap={1}>
                <Text wrap="truncate-end">{row.rule}<Text dimColor> · {describeUse({ use: row.use, now })}</Text></Text>
                <Button key={`prune-${index}`} label="Prune" onPress={() => $.prompt.fill({ text: `${sources.find(one => one.rule === row.rule)?.source === 'team' ? 'record-team: ' : ''}Use learn-feedback to prune this remembered rule: ${row.rule}` })} />
              </Box>
            ))}
          </Box>
          <Box flexDirection="column">
            <Text bold>Often fired ({rules.often.length})</Text>
            <Text dimColor>Matched 5+ times in 30 days: CLAUDE.md candidates.</Text>
            {rules.often.length === 0 ? <Text dimColor>none</Text> : rules.often.map(row => (
              <Text key={`often-${row.key}`} wrap="truncate-end">{row.rule}<Text dimColor> · {row.recentUses} in 30d · {describeUse({ use: row.use, now })}</Text></Text>
            ))}
          </Box>
        </Box>
      )
    }

    const skillRow = (run: typeof runs[number]) => {
      const { counter, command, args, detail } = describeSkill({ run, now })
      return <Text wrap="truncate-end">{counter} <Text bold>{command}</Text>{args ? ` ${args}` : ''} · {detail}</Text>
    }

    const nextRow = hint && (
      <Box flexDirection="row" gap={1}>
        <Text wrap="truncate-end">
          <Text bold>Next:</Text> /{hint.skill} · {hint.why}
          {lastRun && <Text dimColor> · ran as {lastRun.n}.</Text>}
        </Text>
        <Button key="next-skill" label="Use" onPress={async () => {
          if (!(await $.prompt.fill({ text: `/${hint.skill} ` })).isFilled) $.ui.toast(`Couldn't fill the prompt — type /${hint.skill}`)
        }} />
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        {tabs}
        {view.status === 'ready' ? (
          <Box flexDirection="column" gap={1}>
            <Text bold>Threads · <Link href={view.url}>{`PR #${view.pr}`}</Link>{view.state !== 'OPEN' && ` (${view.state.toLowerCase()})`}</Text>
            {nextRow}
            {group('Needs you', view.threads.filter(one => one.move === 'you'))}
            {group('Waiting on reviewer', view.threads.filter(one => one.move === 'reviewer'))}
          </Box>
        ) : (
          <Box flexDirection="column" gap={1}>
            <Text dimColor>{waiting[view.status]}</Text>
            {nextRow}
          </Box>
        )}
        <Text dimColor wrap="truncate-end">{'─'.repeat(80)}</Text>
        <Box flexDirection="column">
          <Text bold>{describeActivity({ runs: runs.length, calls: calls.length })}</Text>
          {activity.loose.map(call => agentRow(call, ''))}
          {activity.groups.map(({ run, calls: inRun }) => (
            <Box key={`skill-${run.n}`} flexDirection="column">
              {skillRow(run)}
              {inRun.map(call => agentRow(call, '   '))}
              {running && checklistRun === run && (
                <Box flexDirection="column">
                  <Text>   Handoffs · {running.skill.replace(/^cops:/, '')}</Text>
                  {(EXPECTED_HANDOFFS[running.skill] || []).map(handoff => (
                    <Text key={`handoff-${handoff.label}`} dimColor={!running.ticked.includes(handoff.label)}>
                      {'   '}{running.ticked.includes(handoff.label) ? '[x]' : '[ ]'} {handoff.label}
                    </Text>
                  ))}
                </Box>
              )}
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
