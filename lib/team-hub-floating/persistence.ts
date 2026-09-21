/**
 * Admin-wide Floating Team Hub — UI-only localStorage persistence for the
 * floating window's geometry (position/size). No DB migration: this
 * follows the codebase's existing ad hoc per-feature localStorage key
 * convention (e.g. components/admin/AdminSidebar.tsx's `walz_logo_url`)
 * rather than a shared UIPreference model.
 *
 * SECURITY / PRIVACY — deliberately narrow persisted shape:
 *   - ONLY window geometry (x/y/width/height) is ever written here.
 *   - Never message content, never unread counts (those must always come
 *     from live server state — see hooks/useTeamHubUnreadCount.ts), and
 *     never anything that would let a tampered localStorage value grant
 *     access to anything: the selected-conversation id itself is NOT
 *     persisted to localStorage at all (it lives in React context only,
 *     see FloatingTeamHubContext.tsx), and even so, every read of a
 *     conversation is independently re-authorized server-side
 *     (checkConversationMembership in lib/team/authz.ts) regardless of
 *     what a client claims — see __tests__/team-hub-floating-tamper.test.ts.
 */
import type { Geometry } from './geometry'

export const FLOATING_LAYOUT_STORAGE_KEY = 'walz_team_hub_floating_layout_v1'

export interface PersistedFloatingLayout {
  geometry: Geometry
  /** Last NORMAL (non-maximized) geometry, kept so "restore" from maximize
   * returns to the exact prior position/size even across a reload. */
  lastNormalGeometry: Geometry
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isValidGeometry(g: unknown): g is Geometry {
  if (!g || typeof g !== 'object') return false
  const c = g as Record<string, unknown>
  return isFiniteNumber(c.x) && isFiniteNumber(c.y) && isFiniteNumber(c.width) && isFiniteNumber(c.height)
}

/** Reads and validates the persisted layout. Returns null on anything
 * unexpected (missing, corrupt JSON, wrong shape, private-mode storage
 * exceptions) rather than throwing — a floating window with no persisted
 * layout falls back to the computed default, it never breaks the page. */
export function loadPersistedLayout(): PersistedFloatingLayout | null {
  try {
    const raw = localStorage.getItem(FLOATING_LAYOUT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    const c = parsed as Record<string, unknown>
    if (!isValidGeometry(c?.geometry) || !isValidGeometry(c?.lastNormalGeometry)) return null
    return { geometry: c.geometry as Geometry, lastNormalGeometry: c.lastNormalGeometry as Geometry }
  } catch {
    return null
  }
}

export function savePersistedLayout(layout: PersistedFloatingLayout): void {
  try {
    localStorage.setItem(FLOATING_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Best-effort only — private browsing / quota exceeded must never break the UI.
  }
}

/** Backs the "Reset Window Position"/"Reset Window Size" affordance's
 * underlying storage clear when a caller wants a full reset rather than a
 * recomputed default overwrite. */
export function resetPersistedLayout(): void {
  try {
    localStorage.removeItem(FLOATING_LAYOUT_STORAGE_KEY)
  } catch {
    // Best-effort only.
  }
}
