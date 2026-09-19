'use client'

// ActionDrawerShell — INBOX Phase 3 (Agent D — Client Action Centre UX).
//
// Shared scrim + role="dialog" panel + header chrome for the four Client
// Action Centre drawers: PaymentRequestDrawer, CreateQuoteDrawer,
// VisaFormDrawer, ItineraryRequestDrawer. Before this component each of
// the four hand-rolled an identical ~25-line block (scrim div, panel
// wrapper, header with title + close button, scrollable body wrapper) —
// this is now the ONE place that markup lives.
//
// NOTE — DetailsDrawer.tsx (the Client Details mobile/tablet overlay) is
// DELIBERATELY NOT migrated to this shell. Its existing a11y tests
// (__tests__/inbox-ux4-screens.test.ts) pin literal substrings from its own
// Tab-cycle implementation (`panel.contains(active)`,
// `e.shiftKey && active === first`) that these four drawers' tests do not
// require — forcing DetailsDrawer through this shell would either break
// those pins or turn the shell into a leaky, over-parameterized abstraction
// for a single caller. DetailsDrawer already independently implements the
// identical CONTRACT correctly; only its markup is not deduplicated here.
// See lib/inbox/... — no, see app/admin/inbox/components/drawerFocusTrap.ts
// for the Tab-cycle/focus-restore helpers the four drawers below now share.
//
// NOTE — the Esc/Tab keydown handler and the open-lifecycle focus effect
// (focus in on open, restore on close) stay in EACH drawer's own file
// rather than moving in here too. That is a deliberate, test-driven
// judgment call: the existing per-drawer a11y tests
// (__tests__/inbox-ux41b/42/43/44-*.test.ts) are literal source-string pins
// against each drawer's OWN file (e.g. `expect(drawerSrc).toContain("e.key
// === 'Escape'")`) — moving that logic into a shared hook would silently
// remove those substrings from each file and fail those suites. The
// TAB-CYCLE COMPUTATION (which isn't pinned) is still shared via
// drawerFocusTrap.ts; only the handful of literal, pinned lines remain
// duplicated, on purpose.

import type { CSSProperties, ReactNode, RefObject } from 'react'
import { X } from 'lucide-react'
import { Z_INDEX } from '@/lib/admin/chrome'

export interface ActionDrawerShellProps {
  panelRef: RefObject<HTMLDivElement>
  closeRef: RefObject<HTMLButtonElement>
  entered: boolean
  onClose: () => void
  title: string
  /** Explicit at each call site (not defaulted) — the drawer's own
   *  accessibility role, stated where a reviewer/audit will actually look
   *  for it rather than hidden as a default deep in this shared file. */
  role: string
  /** Same reasoning as `role` — explicit per call site. */
  panelTransitionClassName: string
  panelSafeAreaStyle: CSSProperties
  children: ReactNode
}

/** Shared right-side sheet chrome for the four Client Action Centre
 *  drawers — scrim, dialog panel, header (title + close), scrollable body.
 *  Always mounted at every breakpoint (unlike DetailsDrawer, which is
 *  lg:hidden) — these actions have no desktop-rail equivalent. */
export function ActionDrawerShell({
  panelRef, closeRef, entered, onClose, title, role, panelTransitionClassName, panelSafeAreaStyle, children,
}: ActionDrawerShellProps) {
  return (
    <div className="fixed inset-0" style={{ zIndex: Z_INDEX.drawer }}>
      <div className="absolute inset-0 bg-walz-deep-navy/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-y-0 right-0 w-full sm:max-w-md bg-white shadow-2xl flex flex-col
          ${panelTransitionClassName}
          ${entered ? 'translate-x-0' : 'translate-x-full'}`}
        style={panelSafeAreaStyle}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-walz-border">
          <p className="text-sm font-bold text-walz-deep-navy">{title}</p>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] -m-1.5 flex items-center justify-center rounded-lg text-walz-navy/60 hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {children}
        </div>
      </div>
    </div>
  )
}
