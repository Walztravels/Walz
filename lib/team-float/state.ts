/**
 * Floating Ask Team Workspace — pure state/geometry logic.
 *
 * Deliberately framework-free (no React, no DOM globals accessed directly
 * except via the caller-supplied `raw` string for persistence) so every
 * behavior the product spec cares about — CASE 1/2/3 resolution, viewport
 * clamping for drag/resize/restore, tab bookkeeping, and unread derivation
 * from the EXISTING `lastReadAt` semantics — is unit-testable without
 * mounting a component. `useFloatingTeamWorkspace.ts` is a thin React glue
 * layer over these functions.
 *
 * No DB model backs any of this — per spec, window position/size/open-tabs/
 * minimized/maximized/active-tab state is UI-only and lives in a single
 * namespaced localStorage key (STORAGE_KEY), following this codebase's
 * existing flat-key convention (Inbox's `walz_read_conv_ids`, Jade's
 * per-surface sessionKey, basket's localStorage draft). Tampering with
 * that key can only ever request a conversation id be RENDERED — it is
 * never treated as authorization; every read still goes through the same
 * server-side membership/Inbox-authz checks Team Hub already enforces
 * (see useSelectedConversation.ts's forbidden/notFound handling and the
 * new for-conversation lookup route's own header comment).
 */

export const STORAGE_KEY = 'walz_team_float_state'

export const DEFAULT_WIDTH = 420
export const DEFAULT_HEIGHT = 600
export const MIN_WIDTH = 340
export const MIN_HEIGHT = 400
export const MARGIN = 16

export interface FloatGeometry {
  x: number
  y: number
  width: number
  height: number
}

export interface FloatTab {
  /** TeamConversation.id — the real, reused Team Hub conversation. */
  id: string
  /** The Chatwoot/Inbox conversation this discussion is authoritatively linked to. */
  inboxConversationId: number
  /** Display-only snapshot captured when the tab was opened — never authorization. */
  clientName: string
  clientRef: string
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** The usable viewport for the floating workspace — excludes admin nav/header chrome. */
export interface Bounds {
  top: number
  left: number
  right: number
  bottom: number
}

export interface FloatState {
  tabs: FloatTab[]
  activeTabId: string | null
  minimized: boolean
  maximized: boolean
  /** The floating (non-maximized) geometry — remembered across maximize/restore. */
  geometry: FloatGeometry
}

export function isOpen(state: Pick<FloatState, 'tabs'>): boolean {
  return state.tabs.length > 0
}

// ─── Geometry ────────────────────────────────────────────────────────────────

export function boundsWidth(b: Bounds): number {
  return Math.max(0, b.right - b.left)
}
export function boundsHeight(b: Bounds): number {
  return Math.max(0, b.bottom - b.top)
}

export function defaultGeometry(bounds: Bounds): FloatGeometry {
  const width = Math.min(DEFAULT_WIDTH, Math.max(MIN_WIDTH, boundsWidth(bounds) - MARGIN * 2))
  const height = Math.min(DEFAULT_HEIGHT, Math.max(MIN_HEIGHT, boundsHeight(bounds) - MARGIN * 2))
  // Right side of the workspace, safe margin, not covering the composer by
  // default when there is room — top-anchored so a tall Inbox viewport
  // leaves the reply composer visible below.
  const x = Math.max(bounds.left + MARGIN, bounds.right - width - MARGIN)
  const y = bounds.top + MARGIN
  return { x, y, width, height }
}

/**
 * Fully contains the window within `bounds` — a strictly stronger guarantee
 * than "not fully off-screen" (the header, being part of the window, is
 * therefore always reachable). Width/height are clamped to fit before x/y
 * are clamped, so a window can never end up larger than the usable
 * viewport (e.g. restoring a size saved on a bigger monitor).
 */
export function clampGeometry(g: FloatGeometry, bounds: Bounds): FloatGeometry {
  const maxW = Math.max(MIN_WIDTH, boundsWidth(bounds))
  const maxH = Math.max(MIN_HEIGHT, boundsHeight(bounds))
  const width = clamp(g.width, MIN_WIDTH, maxW)
  const height = clamp(g.height, MIN_HEIGHT, maxH)
  const maxX = Math.max(bounds.left, bounds.right - width)
  const maxY = Math.max(bounds.top, bounds.bottom - height)
  const x = clamp(g.x, bounds.left, maxX)
  const y = clamp(g.y, bounds.top, maxY)
  return { x, y, width, height }
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.min(Math.max(v, min), Math.max(min, max))
}

/** Pure drag: translate by (dx, dy) from a starting geometry, then clamp. */
export function dragBy(start: FloatGeometry, dx: number, dy: number, bounds: Bounds): FloatGeometry {
  return clampGeometry({ ...start, x: start.x + dx, y: start.y + dy }, bounds)
}

/**
 * Pure resize: grow/shrink from a starting geometry by (dx, dy) applied at
 * `handle`, keeping the OPPOSITE edge/corner anchored, then clamp to
 * min/max and to the viewport.
 */
export function resizeBy(start: FloatGeometry, handle: ResizeHandle, dx: number, dy: number, bounds: Bounds): FloatGeometry {
  let width = start.width
  let height = start.height
  if (handle.includes('e')) width = start.width + dx
  if (handle.includes('w')) width = start.width - dx
  if (handle.includes('s')) height = start.height + dy
  if (handle.includes('n')) height = start.height - dy

  const maxW = Math.max(MIN_WIDTH, boundsWidth(bounds))
  const maxH = Math.max(MIN_HEIGHT, boundsHeight(bounds))
  width = clamp(width, MIN_WIDTH, maxW)
  height = clamp(height, MIN_HEIGHT, maxH)

  let x = start.x
  let y = start.y
  if (handle.includes('w')) x = start.x + (start.width - width)
  if (handle.includes('n')) y = start.y + (start.height - height)

  return clampGeometry({ x, y, width, height }, bounds)
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

export function findOpenTabForInbox(tabs: FloatTab[], inboxConversationId: number): FloatTab | null {
  return tabs.find(t => t.inboxConversationId === inboxConversationId) ?? null
}

export function findTabById(tabs: FloatTab[], tabId: string): FloatTab | null {
  return tabs.find(t => t.id === tabId) ?? null
}

export function upsertTab(tabs: FloatTab[], tab: FloatTab): FloatTab[] {
  const idx = tabs.findIndex(t => t.id === tab.id)
  if (idx === -1) return [...tabs, tab]
  const next = tabs.slice()
  next[idx] = tab
  return next
}

export function removeTab(tabs: FloatTab[], tabId: string): FloatTab[] {
  return tabs.filter(t => t.id !== tabId)
}

/** After closing `closedId`: keep the current active tab unless it WAS the one closed, in which case fall back to the most recently opened remaining tab (or null). */
export function nextActiveAfterClose(tabs: FloatTab[], closedId: string, activeId: string | null): string | null {
  if (activeId !== closedId) return activeId
  const remaining = removeTab(tabs, closedId)
  return remaining.length ? remaining[remaining.length - 1].id : null
}

// ─── CASE 1 / 2 / 3 resolution ──────────────────────────────────────────────

export type AskTeamResolution =
  | { case: 1; tab: FloatTab }
  | { case: 2; teamConversationId: string }
  | { case: 3 }

/**
 * The exact three-case decision from the product spec. Pure — the caller
 * supplies what's already open locally (`openTabs`) and, if it bothered to
 * ask, what the server's for-conversation lookup returned
 * (`existingLinkTeamConversationId`, or null if none/not-yet-checked-but-
 * treated-as-none). Never infers linkage from "whichever Inbox conversation
 * happens to be visible" — both inputs are keyed by inboxConversationId
 * explicitly.
 */
export function resolveAskTeamCase(
  openTabs: FloatTab[],
  inboxConversationId: number,
  existingLinkTeamConversationId: string | null,
): AskTeamResolution {
  const openTab = findOpenTabForInbox(openTabs, inboxConversationId)
  if (openTab) return { case: 1, tab: openTab }
  if (existingLinkTeamConversationId) return { case: 2, teamConversationId: existingLinkTeamConversationId }
  return { case: 3 }
}

// ─── Prepare Client Reply safety ────────────────────────────────────────────

/**
 * RELEASE-BLOCKING SAFETY GATE. A "Prepare Client Reply" completion may
 * only ever be presented as directly actionable in the CURRENT Inbox
 * composer when the floating tab's own linked inbox conversation is
 * EXACTLY the Inbox conversation currently visible on screen. Any other
 * combination (including both being null) must render the
 * Go-to-client/Copy-only UI, never an "insert into current reply" option.
 */
export function isReplySafeForCurrentComposer(
  activeInboxConversationId: number | null,
  viewingInboxConversationId: number | null,
): boolean {
  return (
    activeInboxConversationId != null &&
    viewingInboxConversationId != null &&
    activeInboxConversationId === viewingInboxConversationId
  )
}

// ─── Unread (derived from the EXISTING lastReadAt source of truth) ─────────

export interface UnreadCountInputs {
  messages: Array<{ authorId: string; createdAt: string }>
  lastReadAt: string | null
  currentStaffId: string | null
}

/**
 * Never a new source of truth: purely a client-side derivation from the
 * same TeamConversationMember.lastReadAt semantics the rest of Team Hub
 * already uses (see TeamWorkspaceShell/`.../read` route) plus the message
 * timestamps the floating tab already fetched for its own message list —
 * no new endpoint, no new persisted "unread" state.
 */
export function computeUnreadCount({ messages, lastReadAt, currentStaffId }: UnreadCountInputs): number {
  const lastRead = lastReadAt ? new Date(lastReadAt).getTime() : null
  return messages.filter(m => {
    if (m.authorId === currentStaffId) return false
    if (lastRead == null) return true
    const created = new Date(m.createdAt).getTime()
    return Number.isFinite(created) && created > lastRead
  }).length
}

export function aggregateUnread(perTabUnread: Record<string, number>): number {
  return Object.values(perTabUnread).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0)
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export interface PersistedFloatState {
  tabs: FloatTab[]
  activeTabId: string | null
  minimized: boolean
  maximized: boolean
  geometry: FloatGeometry
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isValidGeometry(g: unknown): g is FloatGeometry {
  if (!g || typeof g !== 'object') return false
  const geo = g as Record<string, unknown>
  return isFiniteNumber(geo.x) && isFiniteNumber(geo.y) && isFiniteNumber(geo.width) && isFiniteNumber(geo.height)
}

function isValidTab(t: unknown): t is FloatTab {
  if (!t || typeof t !== 'object') return false
  const tab = t as Record<string, unknown>
  return (
    typeof tab.id === 'string' && tab.id.length > 0 &&
    Number.isSafeInteger(tab.inboxConversationId) && (tab.inboxConversationId as number) > 0 &&
    typeof tab.clientName === 'string' &&
    typeof tab.clientRef === 'string'
  )
}

/**
 * Parses a raw localStorage value. Any malformed/tampered shape is dropped
 * rather than trusted — but note this is a SHAPE check only, not an
 * authorization check: a syntactically valid-looking tab for a conversation
 * the current staff member cannot access is deliberately still accepted
 * here and only rejected later, server-side, when the floating workspace
 * actually tries to load it (see the file header comment).
 */
export function parseFloatState(raw: string | null): PersistedFloatState | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    if (!data || typeof data !== 'object') return null
    if (!isValidGeometry(data.geometry)) return null
    const tabs = Array.isArray(data.tabs) ? data.tabs.filter(isValidTab) : []
    const activeTabId =
      typeof data.activeTabId === 'string' && tabs.some(t => t.id === data.activeTabId)
        ? data.activeTabId
        : (tabs[tabs.length - 1]?.id ?? null)
    return {
      tabs,
      activeTabId,
      minimized: data.minimized === true,
      maximized: data.maximized === true,
      geometry: data.geometry,
    }
  } catch {
    return null
  }
}

export function serializeFloatState(state: PersistedFloatState): string {
  return JSON.stringify(state)
}

/** Restore + clamp in one step — coordinates from a bigger/smaller monitor never restore off-screen. */
export function restoreClamped(raw: string | null, bounds: Bounds): PersistedFloatState | null {
  const parsed = parseFloatState(raw)
  if (!parsed) return null
  return { ...parsed, geometry: clampGeometry(parsed.geometry, bounds) }
}
