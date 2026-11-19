/**
 * Host half of `dsh-todo-freshness`.
 *
 * The built-in todo card renders the last `todo/write` snapshot verbatim and has
 * no notion of whether that snapshot still describes the work in progress. This
 * plugin contributes that notion as a separate session projection,
 * `todoFreshness`, and nudges the model to write the list back mid-turn once it
 * has clearly stopped doing so.
 *
 * It never fabricates completion: an unfinished item stays unfinished, and the
 * projection only reports how far the list has drifted from the work.
 *
 * @module dsh-todo-freshness
 */

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  anySchema,
  createFold,
  defaultNudgeAt,
  emptyState,
  STALE_CALLS,
  unfinished,
} from './lib/fold.js'

/**
 * The reminder both thresholds send: state the drift, ask for a truthful
 * rewrite, and forbid the shortcut that would silence it.
 */
const NUDGE_TEXT = 'Your todo list has not been updated for a while and no longer reflects what you have '
  + 'done. Call `todo_write` with the COMPLETE list and the true status of every item before continuing. '
  + 'Do not mark unfinished work `completed` just to clear the panel.'

/**
 * The advisory nudge, stamped with a producer source so history shows it as
 * injected context rather than as something the user said.
 * @returns a frozen user message carrying one notice.
 */
function nudgeMessage() {
  return createUserMessage({
    content: [{ type: 'text', text: NUDGE_TEXT }],
    source: { kind: 'todo-freshness', form: 'notice', summary: 'todo list out of date' },
  })
}

/** Cordis row name, as the bundle patch inserts it. */
export const name = 'todo-freshness'

/**
 * Services this plugin reads. `sessionProjections` is the obvious one; the
 * `tools/post-execute` hook lives on the root event bus and needs no service,
 * so it is deliberately absent (declaring an unneeded service only widens the
 * activation gate).
 */
export const inject = ['sessionProjections']

/**
 * A whole number of tool calls, or `undefined` when the value is unusable. A
 * profile config is hand-written YAML, so a string, a fraction, or a negative
 * number is a typo rather than an instruction; falling back to the default
 * keeps a bad value from turning the reminder into something that fires on
 * every single call.
 * @param value - candidate value from the deployment config.
 * @param min - smallest accepted value.
 * @returns the normalized integer, or `undefined`.
 */
function wholeNumber(value, min) {
  const number = typeof value === 'string' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isFinite(number)) return undefined
  const whole = Math.floor(number)
  return whole >= min ? whole : undefined
}

/**
 * Read the deployment config. Every key is optional so the defaults described in
 * the README hold when a profile says nothing.
 * @param config - raw Cordis row config.
 * @returns normalized settings.
 */
export function settings(config) {
  const staleCalls = wholeNumber(config?.staleCalls, 1) ?? STALE_CALLS

  // An explicit list wins; otherwise the schedule follows the threshold, so
  // widening `staleCalls` does not silently leave the reminders at the old,
  // now-unreachable counts.
  const declared = Array.isArray(config?.nudgeAt) ? config.nudgeAt : undefined
  const parsed = declared === undefined
    ? undefined
    : declared.map(value => wholeNumber(value, 1)).filter(value => value !== undefined)
  const nudgeAt = parsed !== undefined && parsed.length > 0
    ? [...new Set(parsed)].sort((left, right) => left - right)
    : declared === undefined ? defaultNudgeAt(staleCalls) : []

  return {
    staleCalls,
    nudgeAt,
    nudge: config?.nudge !== false,
    // Names of the config keys that were present but unusable. Reported once at
    // activation so a typo is visible instead of silently ignored.
    ignored: [
      ...(config?.staleCalls !== undefined && wholeNumber(config.staleCalls, 1) === undefined ? ['staleCalls'] : []),
      ...(declared !== undefined && nudgeAt.length === 0 ? ['nudgeAt'] : []),
    ],
  }
}

/**
 * Register the freshness projection and the mid-turn nudge.
 * @param ctx - registrant context carrying the projection and event registries.
 * @param config - deployment config: `staleCalls`, `nudgeAt`, `nudge`.
 * @returns when the projection is installed.
 */
export async function apply(ctx, config) {
  const chosen = settings(config)
  if (chosen.ignored.length > 0) {
    ctx.logger?.warn?.(`${name}: ignoring ${chosen.ignored.join(', ')} (expected a whole number >= 1); `
      + `using staleCalls=${chosen.staleCalls}${chosen.nudgeAt.length > 0 ? `, nudgeAt=${chosen.nudgeAt.join(',')}` : ''}`)
  }

  const handle = await ctx.sessionProjections.register({
    key: 'todoFreshness',
    stateSchema: anySchema,
    init: () => emptyState(),
    apply: createFold(chosen.staleCalls),
    // The threshold is a deployment choice, so it rides the published view
    // rather than the stored state: every session uses the same value, and a
    // profile change should not require rewriting checkpoints.
    wire: {
      viewSchema: anySchema,
      view: state => ({ ...state, staleCalls: chosen.staleCalls }),
      summary: false,
    },
    stateVersion: 1,
  })

  if (!chosen.nudge || chosen.nudgeAt.length === 0) return

  // Process-local dedup: the tool-call count already reminded at, per live
  // Agent. The projection is a pure fold and must not record that a nudge went
  // out, or the note would change shape depending on who read it.
  const nudged = new WeakMap()

  // The reminder rides the model-facing surface as injected context, which lands
  // in the next-step inbox and buys exactly one more model step. That is the
  // case the built-in card cannot cover: work finished on the last tool call, so
  // no `todo_write` ever followed it.
  ctx.on('tools/post-execute', async (exec, _result, next) => {
    const decision = await next()
    const agent = exec.agent
    if (agent === undefined) return decision
    const state = handle.stateOf(agent.session)
    if (!state.list || unfinished(state) === 0) return decision
    const at = state.callsSinceWrite
    if (!chosen.nudgeAt.includes(at) || nudged.get(agent) === at) return decision
    nudged.set(agent, at)
    return {
      ...decision,
      additionalContexts: [...(decision.additionalContexts ?? []), nudgeMessage()],
    }
  })
}
