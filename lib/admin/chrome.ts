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
 *   nav (30) < fab (40) < drawer (60) < modal (70) < toast (80)
 *
 * - nav:    MobileNav bottom tab bar (z-30)
 * - fab:    floating action buttons — Twilio phone, Jade bubble (z-40)
 * - drawer: slide-over panels — Jade chat panel, lookup drawers (z-[60])
 * - modal:  blocking dialogs (z-[70])
 * - toast:  transient notifications — always on top (z-[80])
 *
 * Note: components/admin/ApplicationLookupDrawer.tsx still carries a legacy
 * z value — align it with this scale in UX-2 when the lookup moves into
 * ConversationHeader.
 */
export const Z_INDEX = {
  nav: 30,
  fab: 40,
  drawer: 60,
  modal: 70,
  toast: 80,
} as const

export type ChromeLayer = keyof typeof Z_INDEX
