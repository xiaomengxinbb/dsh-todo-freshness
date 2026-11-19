/**
 * Pure fold behind the `todoFreshness` projection: no imports, no I/O, so it can
 * be unit-tested outside DSH. The projection registry calls {@link fold} on every
 * committed session event and publishes the result to the Client.
 *
 * @module dsh-todo-freshness/fold
 */

/** Default tool calls without a `todo/write` after which the list counts as stale. */
export const STALE_CALLS = 6

/** Default tool-call counts, measured from the last write, that each earn one nudge. */
export const NUDGE_AT = [6, 14]

/**
 * The nudge schedule that follows a given staleness threshold: the flip point
 * itself, then roughly twice as far out for a list that stalled again after
 * being rewritten. `defaultNudgeAt(6)` returns {@link NUDGE_AT}.
 * @param staleCalls - the configured staleness threshold.
 * @returns ascending tool-call counts, each earning one reminder.
 */
export function defaultNudgeAt(staleCalls) {
  return [staleCalls, staleCalls * 2 + 2]
}

/**
 * State before the session's first list write.
 * @param turn - the turn being opened, or 0 before any.
 * @returns a fresh state object.
 */
export function emptyState(turn = 0) {
  return {
    list: false,
    turn,
    turnOpen: turn > 0,
    step: 0,
    done: 0,
    active: 0,
    pending: 0,
    writeSeq: -1,
    callsSinceWrite: 0,
    stepsSinceWrite: 0,
    closedWithUnfinished: 0,
    stale: false,
  }
}

/** How many items the list still claims are not done. */
export function unfinished(state) {
  return state.active + state.pending
}

/**
 * Recompute the derived `stale` flag. Returns a new object only when the flag
 * actually moves, so an unchanged list does not republish.
 * @param state - state carrying the latest counters.
 * @param staleCalls - tool calls without a write that make the list stale.
 * @returns the state with a correct `stale` flag.
 */
export function settled(state, staleCalls = STALE_CALLS) {
  const stale = state.list && unfinished(state) > 0 && state.turnOpen
    && state.callsSinceWrite >= staleCalls
  if (stale === state.stale) return state
  return { ...state, stale }
}

/**
 * Build a fold bound to one staleness threshold. The threshold is a deployment
 * choice, not session data, so it stays in this closure instead of the published
 * state: the wire shape is the same whichever value a profile configures.
 * @param staleCalls - tool calls without a write that make the list stale.
 * @returns the fold for that threshold.
 */
export function createFold(staleCalls = STALE_CALLS) {
  /**
   * One session's freshness fold. An event it does not care about returns the
   * same reference, so an idle session publishes nothing and stores nothing.
   * @param state - previous projection state.
   * @param event - the next committed session event.
   * @returns the next state.
   */
  return function fold(state, event) {
    switch (event.type) {
      case 'turn/start':
        return emptyState(event.data.turn)
      case 'turn/end': {
        if (!state.turnOpen && state.turn === event.data.turn) return state
        return {
          ...state,
          turnOpen: false,
          stale: false,
          closedWithUnfinished: state.list ? unfinished(state) : 0,
        }
      }
      case 'step/start':
        if (!state.list) return state
        return settled({
          ...state,
          step: event.data.step,
          stepsSinceWrite: state.stepsSinceWrite + 1,
        }, staleCalls)
      case 'tool/call':
        if (!state.list) return state
        return settled({ ...state, callsSinceWrite: state.callsSinceWrite + 1 }, staleCalls)
      case 'todo/write': {
        const todos = Array.isArray(event.data?.todos) ? event.data.todos : []
        const count = status => todos.filter(todo => todo.status === status).length
        return settled({
          ...state,
          list: todos.length > 0,
          done: count('completed'),
          active: count('in_progress'),
          pending: count('pending'),
          writeSeq: event.seq ?? -1,
          callsSinceWrite: 0,
          stepsSinceWrite: 0,
          closedWithUnfinished: 0,
          stale: false,
        }, staleCalls)
      }
      default:
        return state
    }
  }
}

/** The fold at the default threshold, for callers that configure nothing. */
export const fold = createFold()

/**
 * Accepts any persisted payload. The state is plain data whose shape only ever
 * grows, so a stale checkpoint row cannot mislead the fold; `stateVersion` is
 * bumped whenever a field's meaning changes.
 */
export const anySchema = { parse: value => value }
