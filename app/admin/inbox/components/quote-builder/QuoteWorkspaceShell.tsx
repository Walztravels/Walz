'use client'

// QuoteWorkspaceShell — QUOTE BUILDER V1.2 large-workspace dialog chrome.
//
// CreateQuoteDrawer.tsx's own replacement for ActionDrawerShell, which it
// intentionally no longer uses (see CreateQuoteDrawer.tsx's own header
// comment for why). ActionDrawerShell itself is UNTOUCHED and keeps
// serving PaymentRequestDrawer/VisaFormDrawer/ItineraryRequestDrawer
// exactly as before — those three keep their existing compact right-sheet
// workflow unchanged. This file is NOT a generalization of that shell — it
// is a deliberately separate, smaller component for the one drawer that
// needed a fundamentally different (large, responsive) shape, so the other
// three never risk drifting off their own simpler contract.
//
// Same dialog CONTRACT as ActionDrawerShell (fixed scrim, click-to-close,
// role="dialog" + aria-modal on the panel, panelRef as the Tab-trap
// boundary, a motion-safe transform transition gated on `entered`, and
// safe-area bottom padding on the panel), different SHAPE:
//   - mobile   -> full-bleed, edge-to-edge (`inset-0`, no margin/padding).
//     mobile/MobileWorkspace.tsx already builds its own complete header/
//     chrome/safe-area internally (it renders at z-[61], one above this
//     shell's own Z_INDEX.drawer scrim, by deliberate design — see that
//     file's own comment) — this shell must not double-wrap it in a second
//     header or a second layer of edge padding.
//   - tablet/desktop -> a large, comfortably-inset workspace panel
//     (`inset-x-[4%] inset-y-[3%]`, capped at 1400px and centered) — never
//     full-bleed, never the old `max-w-md` right-hand drawer.
//
// This component renders no header/title/close button of its own — every
// one of the three workspace trees (Desktop/Tablet/Mobile) already renders
// its own "Create Quote" header and its own close button; adding a second
// close affordance here would be redundant and confusing. Instead,
// CreateQuoteDrawer.tsx forwards its own `closeRef` straight to whichever
// workspace is mounted, via each workspace's own (new, optional, additive)
// `closeButtonRef` prop — see DesktopWorkspace.tsx / MobileWorkspace.tsx /
// TabletWorkspace.tsx for that one-line addition.

import type { CSSProperties, ReactNode, RefObject } from 'react'
import { Z_INDEX } from '@/lib/admin/chrome'
import type { Breakpoint } from './useBreakpoint'

export interface QuoteWorkspaceShellProps {
  panelRef: RefObject<HTMLDivElement>
  entered: boolean
  onClose: () => void
  /** Used only for the panel's aria-label — no visual header is rendered
   *  here (see file header comment). */
  title: string
  /** Explicit at the call site (not defaulted), matching ActionDrawerShell's
   *  own convention — a reviewer/audit looks for it there, not hidden as a
   *  default deep in this shared file. */
  role: string
  panelTransitionClassName: string
  panelSafeAreaStyle: CSSProperties
  breakpoint: Breakpoint
  children: ReactNode
}

export function QuoteWorkspaceShell({
  panelRef, entered, onClose, title, role, panelTransitionClassName, panelSafeAreaStyle, breakpoint, children,
}: QuoteWorkspaceShellProps) {
  const isMobile = breakpoint === 'mobile'

  return (
    <div className="fixed inset-0" style={{ zIndex: Z_INDEX.drawer }}>
      <div className="absolute inset-0 bg-walz-deep-navy/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={title}
        className={`absolute bg-white shadow-2xl flex flex-col overflow-hidden
          ${isMobile ? 'inset-0' : 'inset-x-[4%] inset-y-[3%] max-w-[1400px] mx-auto rounded-2xl'}
          ${panelTransitionClassName}
          ${isMobile
            ? (entered ? 'translate-y-0' : 'translate-y-full')
            : (entered ? 'scale-100' : 'scale-95')}`}
        style={panelSafeAreaStyle}
      >
        {children}
      </div>
    </div>
  )
}
