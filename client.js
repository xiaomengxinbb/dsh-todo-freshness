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
     */
    function FreshnessNote({ useProjection, t }) {
      const freshness = useProjection('todoFreshness')
      const todos = useProjection('todos')
      if (!freshness || !Array.isArray(todos) || todos.length === 0) return null
      const unfinished = (freshness.active ?? 0) + (freshness.pending ?? 0)
      if (unfinished === 0) return null
      const closed = (freshness.closedWithUnfinished ?? 0) > 0
      if (!freshness.stale && !closed) return null
      return h('section', {
        style: styles.root,
        'data-todo-freshness': closed ? 'closed' : 'stale',
        role: 'status',
      },
      h('div', { style: styles.body },
        h('span', { style: styles.glyph }, h(Glyph)),
        h('span', { style: styles.text }, closed ? t('note.closed') : t('note.stale')),
        h('span', { style: styles.count }, t('note.count', { unfinished }))))
    }

    const dictionaries = {
      zh: {
        'note.stale': '这份清单还没跟上已经做完的工作',
        'note.closed': '这一轮已经结束，清单停在旧状态',
        'note.count': '还有 {unfinished} 项没有结论',
      },
      en: {
        'note.stale': 'This list has not caught up with the work already done',
        'note.closed': 'This turn ended and the list still shows old statuses',
        'note.count': '{unfinished} without a verdict',
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
