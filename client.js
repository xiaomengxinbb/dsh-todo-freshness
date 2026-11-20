window.__ModuleLoader__.load({
  id: 'dsh-todo-freshness',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Inline styles inherit the host theme; no stylesheet is injected into the page. */
    const styles = {
      root: {
        boxSizing: 'border-box',
        flex: 'none',
        overflow: 'hidden',
        margin: '0 auto',
        width: 'calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance)'
          + ' - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset)'
          + ' - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset))',
        maxWidth: 'calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset)'
          + ' - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset)'
          + ' - var(--dsh-composer-dock-inset))',
        border: '0',
        borderRadius: 'var(--dsw-radius-lg)',
        background: 'var(--dsw-specific-menu)',
        backdropFilter: 'var(--dsw-menu-backdrop-filter)',
        boxShadow: 'var(--dsw-elevation-panel)',
      },
      body: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 12px',
      },
      glyph: {
        display: 'grid',
        flex: 'none',
        placeItems: 'center',
        width: '16px',
        height: '16px',
        color: 'var(--dsw-alias-state-warn-label)',
      },
      text: {
        flex: '1 1 auto',
        minWidth: '0',
        overflow: 'hidden',
        fontSize: '13px',
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-secondary)',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      count: {
        flex: 'none',
        fontSize: '13px',
        lineHeight: '20px',
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--dsw-alias-label-tertiary)',
      },
    }

    /** A hollow clock: the list is old, not wrong. */
    function Glyph() {
      return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true },
        h('circle', { cx: 8, cy: 8, r: 5.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', {
          d: 'M8 4.8v3.6l2.2 1.6',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }))
    }

    /**
     * The staleness note. Renders nothing while the list still matches the work,
     * and one line when the built-in card describes a moment that has passed.
     * `todoFreshness` is this bundle's own projection; `todos` is the built-in one.
     *
     * The line reports what was measured — how long ago the list was written and
     * how many edits landed since — rather than asserting that work "is done".
     * The plugin cannot know which item finished; it can only know that the tree
     * moved while the list stood still, and that is what it says.
     */
    function FreshnessNote({ useProjection, t }) {
      const freshness = useProjection('todoFreshness')
      const todos = useProjection('todos')
      if (!freshness || !Array.isArray(todos) || todos.length === 0) return null
      const unfinished = (freshness.active ?? 0) + (freshness.pending ?? 0)
      if (unfinished === 0) return null
      const closed = (freshness.closedWithUnfinished ?? 0) > 0
      if (!freshness.stale && !closed) return null
      const edits = freshness.mutationsSinceWrite ?? 0
      const written = freshness.writeTime ?? 0
      const minutes = written > 0 ? Math.max(1, Math.round((Date.now() - written) / 60000)) : 0
      // A quiet list is not evidence of anything, so the note only claims what
      // the counters support; with no edits to point at it falls back to the age.
      const text = closed
        ? t('note.closed')
        : edits > 0 && minutes > 0
          ? t('note.stale', { edits, minutes })
          : minutes > 0 ? t('note.age', { minutes }) : t('note.plain')
      const threshold = freshness.staleCalls
      return h('section', {
        style: styles.root,
        'data-todo-freshness': closed ? 'closed' : 'stale',
        // The threshold is configurable per profile, so it is worth naming on
        // hover: the note otherwise looks arbitrary to anyone who did not pick it.
        title: Number.isInteger(threshold) ? t('note.hint', { threshold }) : undefined,
        role: 'status',
      },
      h('div', { style: styles.body },
        h('span', { style: styles.glyph }, h(Glyph)),
        h('span', { style: styles.text }, text),
        h('span', { style: styles.count }, t('note.count', { unfinished }))))
    }

    const dictionaries = {
      zh: {
        'note.stale': '清单 {minutes} 分钟前写下，之后有 {edits} 次文件改动',
        'note.age': '清单已经 {minutes} 分钟没有回写',
        'note.plain': '这份清单可能已经落后于进度',
        'note.closed': '这一轮已经结束，清单停在旧状态',
        'note.count': '还有 {unfinished} 项没有结论',
        'note.hint': '连续 {threshold} 次文件改动没有回写时提示',
      },
      en: {
        'note.stale': 'List written {minutes}m ago, {edits} file edits since',
        'note.age': 'List not rewritten for {minutes} minutes',
        'note.plain': 'This list may be behind the work',
        'note.closed': 'This turn ended and the list still shows old statuses',
        'note.count': '{unfinished} without a verdict',
        'note.hint': 'shown after {threshold} file edits without a rewrite',
      },
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('todo-freshness', dictionaries), 'todo-freshness: dictionaries')
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'todo-freshness',
          order: 1,
          locale: 'todo-freshness',
        }, FreshnessNote))
      },
    }
  },
})
