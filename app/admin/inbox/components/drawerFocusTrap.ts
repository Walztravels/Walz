// drawerFocusTrap — INBOX Phase 3 (Agent D — Client Action Centre UX).
//
// Shared Tab-cycle and focus-restore-target helpers for the four Client
// Action Centre drawers (PaymentRequestDrawer, CreateQuoteDrawer,
// VisaFormDrawer, ItineraryRequestDrawer). Each drawer keeps its OWN
// keydown handler and open-lifecycle effect (see ActionDrawerShell.tsx for
// why — the existing per-drawer a11y tests pin literal lines from those
// handlers), but the tail of the Tab-cycle logic — compute first/last
// focusable, and move focus when Tab/Shift+Tab would leave the panel — is
// identical across all four and not itself pinned by any test, so it lives
// here once instead of four times.

/** The exact query + :disabled-aware filter every action drawer already
 *  used inline (kept here so callers don't also have to duplicate the
 *  querySelectorAll string) — see the drawer's own `!el.matches(':disabled')`
 *  line, which stays inline in each file for the a11y source pins. */
export function queryDrawerFocusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  ))
}

/** Given the panel's already-filtered focusable elements, move focus so Tab
 *  never leaves the dialog — mirrors the identical tail every one of the
 *  four drawers implemented inline before this extraction. */
export function cycleTabFocus(e: KeyboardEvent, focusables: HTMLElement[], panel: HTMLElement): void {
  if (focusables.length === 0) { e.preventDefault(); return }
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (active == null || !panel.contains(active)) { e.preventDefault(); first.focus(); return }
  if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
}

/** The restore-on-close target captured when a drawer opens — never <body>,
 *  matching DetailsDrawer's own documented rule (a menu that closed itself
 *  in the same batch can leave focus there; better to restore nothing). */
export function captureFocusRestoreTarget(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement
    : null
}
