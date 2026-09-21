/**
 * Admin-wide Floating Team Hub — pure window-state transitions, extracted
 * out of FloatingTeamHubContext.tsx so the open/minimize/close/maximize
 * state machine itself is directly unit-testable (scenarios 4, 5, 9)
 * without mounting any React component.
 */

export type FloatingWindowState = 'closed' | 'open' | 'minimized'

export interface FloatingHubState {
  windowState: FloatingWindowState
  isMaximized: boolean
}

export function openOrRestoreState(state: FloatingHubState): FloatingHubState {
  return { ...state, windowState: 'open' }
}

export function minimizeState(state: FloatingHubState): FloatingHubState {
  return { ...state, windowState: 'minimized' }
}

/** Closing always drops back to normal (non-maximized) mode — a reopened
 * window should never surprise the staff member by coming back maximized
 * from a session they don't remember maximizing (scenario 4's "restores
 * the same position/size" means the NORMAL geometry). */
export function closeState(state: FloatingHubState): FloatingHubState {
  return { windowState: 'closed', isMaximized: false }
}

export function toggleMaximizeState(state: FloatingHubState): FloatingHubState {
  return { ...state, isMaximized: !state.isMaximized }
}
