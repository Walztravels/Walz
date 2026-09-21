/**
 * Floating Ask Team Workspace — pure state/geometry logic (lib/team-float/state.ts).
 * No React/DOM — see that file's header for why these are deliberately
 * framework-free and exhaustively unit-tested here.
 */
import {
  DEFAULT_WIDTH, DEFAULT_HEIGHT, MIN_WIDTH, MIN_HEIGHT, MARGIN, STORAGE_KEY,
  defaultGeometry, clampGeometry, dragBy, resizeBy,
  findOpenTabForInbox, findTabById, upsertTab, removeTab, nextActiveAfterClose,
  resolveAskTeamCase, isReplySafeForCurrentComposer,
  computeUnreadCount, aggregateUnread,
  parseFloatState, serializeFloatState, restoreClamped, isOpen,
  type FloatTab, type Bounds, type FloatGeometry,
} from '@/lib/team-float/state'

const BOUNDS: Bounds = { top: 0, left: 0, right: 1440, bottom: 900 }
const SMALL_BOUNDS: Bounds = { top: 60, left: 0, right: 500, bottom: 500 }

function tab(overrides: Partial<FloatTab> = {}): FloatTab {
  return { id: 'team-1', inboxConversationId: 1, clientName: 'Oyinda', clientRef: '#1', ...overrides }
}

describe('geometry', () => {
  it('defaultGeometry places the window on the right with a safe margin, top-anchored', () => {
    const g = defaultGeometry(BOUNDS)
    expect(g.width).toBe(DEFAULT_WIDTH)
    expect(g.height).toBe(DEFAULT_HEIGHT)
    expect(g.x).toBe(BOUNDS.right - DEFAULT_WIDTH - MARGIN)
    expect(g.y).toBe(BOUNDS.top + MARGIN)
  })

  it('defaultGeometry shrinks to fit a small viewport rather than overflowing it', () => {
    const g = defaultGeometry(SMALL_BOUNDS)
    expect(g.width).toBeLessThanOrEqual(SMALL_BOUNDS.right - SMALL_BOUNDS.left)
    expect(g.height).toBeLessThanOrEqual(SMALL_BOUNDS.bottom - SMALL_BOUNDS.top)
    expect(g.width).toBeGreaterThanOrEqual(MIN_WIDTH)
  })

  it('clampGeometry keeps a window fully inside bounds — never draggable fully off-screen', () => {
    const g: FloatGeometry = { x: -9999, y: -9999, width: 420, height: 600 }
    const c = clampGeometry(g, BOUNDS)
    expect(c.x).toBeGreaterThanOrEqual(BOUNDS.left)
    expect(c.y).toBeGreaterThanOrEqual(BOUNDS.top)
    expect(c.x + c.width).toBeLessThanOrEqual(BOUNDS.right)
    expect(c.y + c.height).toBeLessThanOrEqual(BOUNDS.bottom)
  })

  it('clampGeometry also clamps an over-large window (e.g. restored from a bigger monitor)', () => {
    const g: FloatGeometry = { x: 100, y: 100, width: 5000, height: 5000 }
    const c = clampGeometry(g, SMALL_BOUNDS)
    expect(c.width).toBeLessThanOrEqual(SMALL_BOUNDS.right - SMALL_BOUNDS.left)
    expect(c.height).toBeLessThanOrEqual(SMALL_BOUNDS.bottom - SMALL_BOUNDS.top)
    expect(c.x + c.width).toBeLessThanOrEqual(SMALL_BOUNDS.right)
    expect(c.y + c.height).toBeLessThanOrEqual(SMALL_BOUNDS.bottom)
  })

  it('clampGeometry never lets width/height fall below the minimum', () => {
    const c = clampGeometry({ x: 0, y: 0, width: 10, height: 10 }, BOUNDS)
    expect(c.width).toBeGreaterThanOrEqual(MIN_WIDTH)
    expect(c.height).toBeGreaterThanOrEqual(MIN_HEIGHT)
  })

  it('dragBy translates then clamps — dragging far past the edge stops at the edge, window stays fully visible', () => {
    const start: FloatGeometry = defaultGeometry(BOUNDS)
    const dragged = dragBy(start, 100000, 100000, BOUNDS)
    expect(dragged.x + dragged.width).toBeLessThanOrEqual(BOUNDS.right)
    expect(dragged.y + dragged.height).toBeLessThanOrEqual(BOUNDS.bottom)
    const draggedNeg = dragBy(start, -100000, -100000, BOUNDS)
    expect(draggedNeg.x).toBeGreaterThanOrEqual(BOUNDS.left)
    expect(draggedNeg.y).toBeGreaterThanOrEqual(BOUNDS.top)
  })

  it('dragBy moves by exactly the delta when the result stays in-bounds', () => {
    const start: FloatGeometry = { x: 100, y: 100, width: 420, height: 600 }
    const dragged = dragBy(start, 20, -10, BOUNDS)
    expect(dragged).toEqual({ x: 120, y: 90, width: 420, height: 600 })
  })

  it('resizeBy "se" grows width/height without moving the top-left corner', () => {
    const start: FloatGeometry = { x: 200, y: 200, width: 420, height: 600 }
    const r = resizeBy(start, 'se', 50, 30, BOUNDS)
    expect(r.x).toBe(200)
    expect(r.y).toBe(200)
    expect(r.width).toBe(470)
    expect(r.height).toBe(630)
  })

  it('resizeBy "nw" shrinks and moves the anchor to keep the opposite (bottom-right) corner fixed', () => {
    const start: FloatGeometry = { x: 200, y: 200, width: 420, height: 600 }
    const r = resizeBy(start, 'nw', 20, 20, BOUNDS) // dragging nw handle right/down shrinks
    expect(r.width).toBe(400)
    expect(r.height).toBe(580)
    expect(r.x).toBe(220)
    expect(r.y).toBe(220)
  })

  it('resizeBy respects the minimum — cannot shrink below MIN_WIDTH/MIN_HEIGHT', () => {
    const start: FloatGeometry = { x: 200, y: 200, width: 420, height: 600 }
    const r = resizeBy(start, 'se', -1000, -1000, BOUNDS)
    expect(r.width).toBe(MIN_WIDTH)
    expect(r.height).toBe(MIN_HEIGHT)
  })

  it('resizeBy respects the maximum — cannot grow past the usable viewport', () => {
    const start: FloatGeometry = { x: 0, y: 0, width: 420, height: 600 }
    const r = resizeBy(start, 'se', 100000, 100000, SMALL_BOUNDS)
    expect(r.width).toBeLessThanOrEqual(SMALL_BOUNDS.right - SMALL_BOUNDS.left)
    expect(r.height).toBeLessThanOrEqual(SMALL_BOUNDS.bottom - SMALL_BOUNDS.top)
  })
})

describe('tabs', () => {
  it('findOpenTabForInbox matches by inboxConversationId, not tab id', () => {
    const tabs = [tab({ id: 't1', inboxConversationId: 1 }), tab({ id: 't2', inboxConversationId: 2 })]
    expect(findOpenTabForInbox(tabs, 2)?.id).toBe('t2')
    expect(findOpenTabForInbox(tabs, 999)).toBeNull()
  })

  it('upsertTab adds a new tab or replaces an existing one by id, preserving order otherwise', () => {
    const tabs = [tab({ id: 't1', clientName: 'Oyinda' })]
    const added = upsertTab(tabs, tab({ id: 't2', clientName: 'David' }))
    expect(added.map(t => t.id)).toEqual(['t1', 't2'])
    const replaced = upsertTab(added, tab({ id: 't1', clientName: 'Oyinda Updated' }))
    expect(replaced.map(t => t.id)).toEqual(['t1', 't2'])
    expect(replaced[0].clientName).toBe('Oyinda Updated')
  })

  it('removeTab drops exactly the named tab', () => {
    const tabs = [tab({ id: 't1' }), tab({ id: 't2' })]
    expect(removeTab(tabs, 't1').map(t => t.id)).toEqual(['t2'])
  })

  it('nextActiveAfterClose keeps the active tab if a DIFFERENT tab was closed', () => {
    const tabs = [tab({ id: 't1' }), tab({ id: 't2' })]
    expect(nextActiveAfterClose(tabs, 't2', 't1')).toBe('t1')
  })

  it('nextActiveAfterClose falls back to the most recently opened remaining tab when the ACTIVE tab is closed', () => {
    const tabs = [tab({ id: 't1' }), tab({ id: 't2' }), tab({ id: 't3' })]
    expect(nextActiveAfterClose(tabs, 't2', 't2')).toBe('t3')
  })

  it('nextActiveAfterClose returns null when closing the last remaining tab', () => {
    const tabs = [tab({ id: 't1' })]
    expect(nextActiveAfterClose(tabs, 't1', 't1')).toBeNull()
  })

  it('findTabById / isOpen', () => {
    expect(findTabById([tab({ id: 't1' })], 't1')?.id).toBe('t1')
    expect(findTabById([], 't1')).toBeNull()
    expect(isOpen({ tabs: [] })).toBe(false)
    expect(isOpen({ tabs: [tab()] })).toBe(true)
  })
})

describe('CASE 1 / 2 / 3 resolution — "Ask Team" behavior', () => {
  it('CASE 1: a linked discussion is already open as a floating tab -> focus it', () => {
    const openTabs = [tab({ id: 'teamA', inboxConversationId: 42 })]
    const r = resolveAskTeamCase(openTabs, 42, null)
    expect(r).toEqual({ case: 1, tab: openTabs[0] })
  })

  it('CASE 1 wins even if the server also happens to report an existing link — never opens a second tab for the same conversation', () => {
    const openTabs = [tab({ id: 'teamA', inboxConversationId: 42 })]
    const r = resolveAskTeamCase(openTabs, 42, 'teamA')
    expect(r.case).toBe(1)
  })

  it('CASE 2: no open tab, but a non-resolved link exists on the server -> use it, no new TeamConversation', () => {
    const r = resolveAskTeamCase([], 42, 'team-existing')
    expect(r).toEqual({ case: 2, teamConversationId: 'team-existing' })
  })

  it('CASE 3: nothing open, nothing linked -> fall through to the existing create flow', () => {
    const r = resolveAskTeamCase([], 42, null)
    expect(r).toEqual({ case: 3 })
  })

  it('never confuses a DIFFERENT inbox conversation\'s open tab for a match', () => {
    const openTabs = [tab({ id: 'teamA', inboxConversationId: 1 })]
    const r = resolveAskTeamCase(openTabs, 2, null)
    expect(r).toEqual({ case: 3 })
  })
})

describe('Prepare Client Reply safety gate', () => {
  it('is safe ONLY when the linked and currently-viewed inbox conversation ids are exactly equal', () => {
    expect(isReplySafeForCurrentComposer(1, 1)).toBe(true)
  })
  it('is unsafe when the floating tab is linked to A but B is currently visible (the release-blocking scenario)', () => {
    expect(isReplySafeForCurrentComposer(1, 2)).toBe(false)
  })
  it('is unsafe when either side is null/unknown — never defaults to permissive', () => {
    expect(isReplySafeForCurrentComposer(null, 1)).toBe(false)
    expect(isReplySafeForCurrentComposer(1, null)).toBe(false)
    expect(isReplySafeForCurrentComposer(null, null)).toBe(false)
  })
})

describe('unread — derived from lastReadAt, never a new source of truth', () => {
  it('counts only messages from OTHERS after lastReadAt', () => {
    const n = computeUnreadCount({
      messages: [
        { authorId: 'me', createdAt: '2026-01-01T00:10:00Z' },
        { authorId: 'other', createdAt: '2026-01-01T00:05:00Z' }, // before lastRead
        { authorId: 'other', createdAt: '2026-01-01T00:15:00Z' }, // after lastRead
      ],
      lastReadAt: '2026-01-01T00:10:00Z',
      currentStaffId: 'me',
    })
    expect(n).toBe(1)
  })

  it('with lastReadAt null, every message from someone else counts as unread', () => {
    const n = computeUnreadCount({
      messages: [{ authorId: 'other', createdAt: '2026-01-01T00:00:00Z' }],
      lastReadAt: null,
      currentStaffId: 'me',
    })
    expect(n).toBe(1)
  })

  it('never counts my own messages as unread', () => {
    const n = computeUnreadCount({
      messages: [{ authorId: 'me', createdAt: '2026-01-01T00:00:00Z' }],
      lastReadAt: null,
      currentStaffId: 'me',
    })
    expect(n).toBe(0)
  })

  it('aggregateUnread sums per-tab counts', () => {
    expect(aggregateUnread({ t1: 2, t2: 0, t3: 3 })).toBe(5)
  })
})

describe('persistence — parse/clamp on restore', () => {
  const validGeometry: FloatGeometry = { x: 10, y: 20, width: 420, height: 600 }

  it('round-trips a valid state', () => {
    const state = { tabs: [tab()], activeTabId: 'team-1', minimized: false, maximized: false, geometry: validGeometry }
    const parsed = parseFloatState(serializeFloatState(state))
    expect(parsed).toEqual(state)
  })

  it('returns null for missing/empty input', () => {
    expect(parseFloatState(null)).toBeNull()
    expect(parseFloatState('')).toBeNull()
  })

  it('returns null for malformed JSON without throwing', () => {
    expect(() => parseFloatState('not json')).not.toThrow()
    expect(parseFloatState('not json')).toBeNull()
  })

  it('drops a malformed/tampered tab entry but keeps the rest (shape check, not authorization — see file header)', () => {
    const raw = JSON.stringify({
      tabs: [tab({ id: 'good' }), { id: 'bad-missing-fields' }, { id: 'bad-neg', inboxConversationId: -5, clientName: 'x', clientRef: 'y' }],
      activeTabId: 'good',
      minimized: false,
      maximized: false,
      geometry: validGeometry,
    })
    const parsed = parseFloatState(raw)
    expect(parsed?.tabs.map(t => t.id)).toEqual(['good'])
  })

  it('falls back activeTabId to the last tab when the stored active id no longer exists among the (possibly filtered) tabs', () => {
    const raw = JSON.stringify({
      tabs: [tab({ id: 't1' }), tab({ id: 't2' })],
      activeTabId: 'gone',
      minimized: false,
      maximized: false,
      geometry: validGeometry,
    })
    expect(parseFloatState(raw)?.activeTabId).toBe('t2')
  })

  it('rejects a state with no valid geometry at all', () => {
    const raw = JSON.stringify({ tabs: [], activeTabId: null, minimized: false, maximized: false })
    expect(parseFloatState(raw)).toBeNull()
  })

  it('restoreClamped clamps a saved geometry from a bigger monitor into the current viewport', () => {
    const raw = JSON.stringify({
      tabs: [], activeTabId: null, minimized: false, maximized: false,
      geometry: { x: 3000, y: 3000, width: 420, height: 600 },
    })
    const restored = restoreClamped(raw, SMALL_BOUNDS)
    expect(restored?.geometry.x).toBeLessThanOrEqual(SMALL_BOUNDS.right - restored!.geometry.width)
    expect(restored?.geometry.y).toBeLessThanOrEqual(SMALL_BOUNDS.bottom - restored!.geometry.height)
  })

  it('STORAGE_KEY is a stable, namespaced flat key (no DB model backs this)', () => {
    expect(STORAGE_KEY).toBe('walz_team_float_state')
  })
})
