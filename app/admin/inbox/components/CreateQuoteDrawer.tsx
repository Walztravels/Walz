'use client'

// CreateQuoteDrawer — INBOX UX-4.2 (Client Action Centre).
//
// QUOTE BUILDER V1.2, step 3 (Agent C — State/Integration): this file now
// holds ONLY the a11y/DOM-shell plumbing (focus trap, Escape/Tab handling,
// breakpoint routing) — every piece of Quote Builder business state/logic
// lives in useQuoteBuilderState() (./quote-builder/useQuoteBuilderState.ts,
// V1.2 step 1, untouched here) and every piece of workspace JSX lives in
// the desktop/tablet/mobile trees under ./quote-builder/ (V1.2 step 2,
// untouched here except one small additive `closeButtonRef` prop on each
// workspace's own close button — see each workspace file's own comment).
//
// This drawer deliberately no longer renders through ActionDrawerShell —
// the whole point of V1.2 is that Create Quote becomes a large responsive
// workspace (full-bleed on mobile, a large comfortably-inset panel on
// tablet/desktop), not the shared `max-w-md` right-hand sheet the other
// three Client Action Centre drawers still use. ActionDrawerShell itself
// is UNTOUCHED and keeps serving PaymentRequestDrawer/VisaFormDrawer/
// ItineraryRequestDrawer exactly as before. See QuoteWorkspaceShell.tsx's
// own header comment for the replacement shell's contract.
//
// What is intentionally UNCHANGED from before this pass, because several
// existing tests pin its literal presence in this file's own source and
// because it is the exact same a11y mechanics the other three drawers
// still rely on: the panelRef/closeRef/restoreRef/entered refs, the
// open/reset effect (focus-capture on open, RAF-gated `entered`, restore
// on close), and the Escape/Tab keydown effect (`e.key === 'Escape'`, the
// Tab-trap call via drawerFocusTrap.ts). Only the JSX return changed.
//
// Commercial discipline mirrors Request Payment exactly (unchanged,
// enforced entirely inside useQuoteBuilderState.ts):
//  - creation is SELECT -> PREPARE -> REVIEW -> GENERATED (draft) -> SHARE;
//  - 'Create quote' NEVER sends anything — it creates a draft only;
//  - 'Finalize for client' mints the real share token (PATCH action:'send',
//    suppressNotifications:true) — still does not message the client;
//  - Copy link / Insert into Reply (no send) / Send to client (explicit,
//    existing composer path) only after finalizing;
//  - one submission latch — a second click after success can never re-POST.
//
// Known, deliberate V1.2 limitation (unchanged by this integration pass,
// not worked around here): there is no existing API to remove or edit a
// live-search-attached item once it has been added to a quote —
// state.attachedLive items render read-only "Added" in every workspace
// tree; only manual state.items support removeItem pre-creation. This is a
// pre-existing V1.1 backend gap, not something this pass fakes client-side.

import { useEffect, useRef, useState } from 'react'
import { cycleTabFocus, captureFocusRestoreTarget, queryDrawerFocusables } from '@/app/admin/inbox/components/drawerFocusTrap'
import { useQuoteBuilderState } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { useBreakpoint } from '@/app/admin/inbox/components/quote-builder/useBreakpoint'
import { QuoteWorkspaceShell } from '@/app/admin/inbox/components/quote-builder/QuoteWorkspaceShell'
import { DesktopWorkspace } from '@/app/admin/inbox/components/quote-builder/desktop/DesktopWorkspace'
import { TabletWorkspace } from '@/app/admin/inbox/components/quote-builder/tablet/TabletWorkspace'
import { MobileWorkspace } from '@/app/admin/inbox/components/quote-builder/mobile/MobileWorkspace'

export interface CreateQuoteDrawerProps {
  open: boolean
  onClose: () => void
  conversationId: number
  onSendMessage: (text: string) => Promise<boolean>
  /** UX-4.1C invalidation signal, threaded through so the shared
   *  client-context cache refetches after a Find/Create link — same token
   *  page.tsx already passes to ClientInfo. */
  identityRefreshToken?: number
}

export function CreateQuoteDrawer({ open, onClose, conversationId, onSendMessage, identityRefreshToken = 0 }: CreateQuoteDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [entered, setEntered] = useState(false)

  // Every piece of Quote Builder business state/logic lives in this one
  // hook call — the desktop/tablet/mobile workspace trees below each take
  // the whole returned object as a single `state` prop (see
  // useQuoteBuilderState.ts's own QuoteBuilderState export), so this file
  // no longer needs to destructure individual fields out of it itself.
  const state = useQuoteBuilderState({ open, onClose, conversationId, onSendMessage, identityRefreshToken })
  const { resetAndOpen } = state
  const bp = useBreakpoint(open)

  useEffect(() => {
    if (!open) { setEntered(false); return }
    resetAndOpen()
    restoreRef.current = captureFocusRestoreTarget()
    closeRef.current?.focus()
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => {
      cancelAnimationFrame(raf)
      restoreRef.current?.focus()
    }
  }, [open, resetAndOpen])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = queryDrawerFocusables(panel).filter(el => !el.matches(':disabled') && el.offsetParent !== null)
      cycleTabFocus(e, focusables, panel)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <QuoteWorkspaceShell
      panelRef={panelRef}
      entered={entered}
      onClose={onClose}
      title="Create quote"
      role="dialog"
      panelTransitionClassName="motion-safe:transition-transform motion-safe:duration-200"
      panelSafeAreaStyle={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      breakpoint={bp}
    >
      {bp === 'desktop' ? (
        <DesktopWorkspace state={state} onClose={onClose} conversationId={conversationId} closeButtonRef={closeRef} />
      ) : bp === 'tablet' ? (
        <TabletWorkspace state={state} onClose={onClose} conversationId={conversationId} closeButtonRef={closeRef} />
      ) : (
        <MobileWorkspace state={state} onClose={onClose} conversationId={conversationId} closeButtonRef={closeRef} />
      )}
    </QuoteWorkspaceShell>
  )
}
