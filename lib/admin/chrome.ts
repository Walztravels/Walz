/**
 * Admin chrome — single source of truth for the admin shell's fixed-chrome
 * metrics and stacking order (INBOX UX-1).
 *
 * The matching CSS custom properties are declared in app/globals.css
 * (":root" — "Admin chrome tokens") and consumed by:
 *   - components/admin/MobileNav.tsx  (nav height + safe-area padding)
 *   - the inbox fullbleed reservation ("Inbox viewport ownership" rules)
 *
 * Keep BOTTOM_NAV_HEIGHT_PX in sync with --walz-bottom-nav-h in globals.css.
 */

/** Mobile bottom-nav content height in px — excludes env(safe-area-inset-bottom). */
export const BOTTOM_NAV_HEIGHT_PX = 64

/** CSS custom property carrying the bottom-nav content height. */
export const BOTTOM_NAV_HEIGHT_VAR = '--walz-bottom-nav-h'

/**
 * CSS custom property for the full reserved space at the bottom of the mobile
 * viewport: calc(var(--walz-bottom-nav-h) + env(safe-area-inset-bottom)).
 */
export const BOTTOM_NAV_SAFE_VAR = '--walz-bottom-nav-safe'

/**
 * Z-index scale for fixed admin chrome. Stacking order (low → high):
 *
 *   nav (30) < fab (40) < floatingPanel (50) < drawer (60) < inboxFloatingPanel (62) < modal (70) < toast (80)
 *
 * - nav:           MobileNav bottom tab bar (z-30)
 * - fab:           floating action buttons — Twilio phone, Jade bubble (z-40)
 * - floatingPanel: persistent floating windows — the Admin-wide Floating
 *                  Team Hub (z-50). Deliberately BELOW drawer/modal/toast:
 *                  a security/confirmation modal or a toast must never be
 *                  visually buried under a staff messaging window.
 * - drawer:        slide-over panels — Jade chat panel, lookup drawers,
 *                  Team Hub's own Overlay.tsx (ThreadPanel/StaffDirectory/
 *                  CreateConversation/MemberManagement — those render at a
 *                  fixed z-[65], between drawer and modal) (z-[60])
 * - inboxFloatingPanel: the Inbox's own client-linked Floating Ask Team
 *                  workspace (app/admin/inbox/team-float) (z-62). One step
 *                  above drawer/floatingPanel so it stays on top of the
 *                  admin-wide Floating Team Hub when a staff member has
 *                  BOTH open at once on /admin/inbox (they are independent
 *                  features that can coexist — see useTeamCallDevice.ts's
 *                  header comment on the shared calling Device singleton
 *                  those two floating windows both rely on), while still
 *                  sitting below a true blocking modal (70) or toast (80).
 * - modal:         blocking dialogs (z-[70])
 * - toast:         transient notifications — always on top (z-[80])
 *
 * Note: components/admin/ApplicationLookupDrawer.tsx still carries a legacy
 * z value — align it with this scale in UX-2 when the lookup moves into
 * ConversationHeader.
 */
export const Z_INDEX = {
  nav: 30,
  fab: 40,
  floatingPanel: 50,
  drawer: 60,
  inboxFloatingPanel: 62,
  modal: 70,
  toast: 80,
} as const

export type ChromeLayer = keyof typeof Z_INDEX
