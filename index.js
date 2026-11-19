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
import { anySchema, emptyState, fold, NUDGE_AT, unfinished } from './lib/fold.js'

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
 * Register the freshness projection and the mid-turn nudge.
 * @param ctx - registrant context carrying the projection and event registries.
 * @param config - deployment config; `nudge: false` keeps the projection and
 * drops the reminder.
 * @returns when the projection is installed.
 */
export async function apply(ctx, config) {
  const handle = await ctx.sessionProjections.register({
    key: 'todoFreshness',
    stateSchema: anySchema,
    init: () => emptyState(),
    apply: fold,
    wire: { viewSchema: anySchema, view: state => state, summary: false },
    stateVersion: 1,
  })

  if (config?.nudge === false) return

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
    if (!NUDGE_AT.includes(at) || nudged.get(agent) === at) return decision
    nudged.set(agent, at)
    return {
      ...decision,
      additionalContexts: [...(decision.additionalContexts ?? []), nudgeMessage()],
    }
  })
}
