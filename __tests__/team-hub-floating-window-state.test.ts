/**
 * Admin-wide Floating Team Hub — lib/team-hub-floating/windowState.ts,
 * the pure open/minimize/close/maximize state machine backing
 * FloatingTeamHubContext.tsx. Covers scenarios (4) close then reopen,
 * (5) minimize collapses/restores, and (9) maximize/restore — at the
 * state-machine level (the corresponding geometry-preservation half of
 * these scenarios is covered separately in
 * __tests__/team-hub-floating-geometry.test.ts and
 * __tests__/team-hub-floating-persistence.test.ts, since geometry is
 * deliberately untouched by any of these transitions).
 */
import {
  openOrRestoreState, minimizeState, closeState, toggleMaximizeState,
  type FloatingHubState,
} from '@/lib/team-hub-floating/windowState'

const CLOSED: FloatingHubState = { windowState: 'closed', isMaximized: false }

describe('openOrRestoreState', () => {
  it('opens from closed', () => {
    expect(openOrRestoreState(CLOSED)).toEqual({ windowState: 'open', isMaximized: false })
  })
  it('(5) restores from minimized back to open, preserving isMaximized', () => {
    expect(openOrRestoreState({ windowState: 'minimized', isMaximized: true })).toEqual({ windowState: 'open', isMaximized: true })
  })
})

describe('minimizeState', () => {
  it('(5) collapses an open window to minimized', () => {
    expect(minimizeState({ windowState: 'open', isMaximized: false })).toEqual({ windowState: 'minimized', isMaximized: false })
  })
  it('preserves isMaximized while minimized, so restoring returns to the same maximize state', () => {
    expect(minimizeState({ windowState: 'open', isMaximized: true })).toEqual({ windowState: 'minimized', isMaximized: true })
  })
})

describe('closeState', () => {
  it('(4) closes from open', () => {
    expect(closeState({ windowState: 'open', isMaximized: false })).toEqual({ windowState: 'closed', isMaximized: false })
  })
  it('closing also drops maximize — reopening later never surprises the staff member by coming back maximized', () => {
    expect(closeState({ windowState: 'open', isMaximized: true })).toEqual({ windowState: 'closed', isMaximized: false })
  })
})

describe('toggleMaximizeState — scenario (9)', () => {
  it('maximizes an open normal window', () => {
    expect(toggleMaximizeState({ windowState: 'open', isMaximized: false })).toEqual({ windowState: 'open', isMaximized: true })
  })
  it('restores (un-maximizes) back to normal — windowState itself is untouched by maximize/restore', () => {
    expect(toggleMaximizeState({ windowState: 'open', isMaximized: true })).toEqual({ windowState: 'open', isMaximized: false })
  })
})

describe('a full open -> minimize -> restore -> maximize -> restore -> close sequence', () => {
  it('ends up exactly where each step implies, step by step', () => {
    let s = CLOSED
    s = openOrRestoreState(s)
    expect(s).toEqual({ windowState: 'open', isMaximized: false })

    s = minimizeState(s)
    expect(s).toEqual({ windowState: 'minimized', isMaximized: false })

    s = openOrRestoreState(s) // restore
    expect(s).toEqual({ windowState: 'open', isMaximized: false })

    s = toggleMaximizeState(s) // maximize
    expect(s).toEqual({ windowState: 'open', isMaximized: true })

    s = toggleMaximizeState(s) // restore from maximize — exact prior normal state
    expect(s).toEqual({ windowState: 'open', isMaximized: false })

    s = closeState(s)
    expect(s).toEqual({ windowState: 'closed', isMaximized: false })
  })
})
