/**
 * INBOX Phase 3 (Agent D — Client Action Centre UX), items A + B.
 *
 * Item A — ActionDrawerShell + drawerFocusTrap: PaymentRequestDrawer,
 * VisaFormDrawer, and ItineraryRequestDrawer share ONE dialog-chrome
 * component and ONE Tab-cycle/focus-restore helper module instead of
 * hand-rolled copies. The existing a11y source-pin suites
 * (inbox-ux41b/42/43/44) already prove each drawer's OWN pinned literals
 * (role="dialog", Escape/Tab handling, safe-area, motion-safe) survived
 * the refactor unmodified; this file additionally proves:
 *   (1) the shared modules exist and are what these three drawers import —
 *       i.e. the duplication was actually removed, not just left in place
 *       alongside a new unused file;
 *   (2) ActionDrawerShell's own markup is the exact same contract the old
 *       inline JSX rendered (role/aria-modal wiring, Z_INDEX.drawer, the
 *       header title+close button, the scrollable body wrapper);
 *   (3) the shared Tab-cycle/focus-restore functions behave identically to
 *       the inline logic they replaced (real function calls, not string
 *       pins) — DetailsDrawer.tsx is DELIBERATELY untouched (see the
 *       judgment-call comment in ActionDrawerShell.tsx) since its own a11y
 *       tests pin literals from its own, more granular Tab-cycle
 *       implementation that the four action drawers' tests don't require.
 *
 * QUOTE BUILDER V1.2 (Agent C — State/Integration): CreateQuoteDrawer no
 * longer uses ActionDrawerShell at all — the whole point of V1.2 is that
 * Create Quote becomes a large responsive workspace (full-bleed on mobile,
 * a large comfortably-inset panel on tablet/desktop), not the shared
 * `max-w-md` right-hand sheet the other three drawers still use. This is
 * intentional, permanent, and by design — not a regression to relocate
 * around. It is now covered by its OWN describe block below, asserting the
 * new QuoteWorkspaceShell.tsx's actual a11y contract (dialog role,
 * aria-modal, the same shared Tab-trap/focus-restore helpers, safe-area
 * padding, its own scrim) instead of the ActionDrawerShell-specific checks
 * that no longer apply to it.
 *
 * Item B — mutual exclusivity: opening any one of the five Client Action
 * Centre overlays (Payment/Quote/Visa Form/Itinerary Request/Identity)
 * closes whichever other was already open.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const shell   = read('app/admin/inbox/components/ActionDrawerShell.tsx')
const trap    = read('app/admin/inbox/components/drawerFocusTrap.ts')
const payment = read('app/admin/inbox/components/PaymentRequestDrawer.tsx')
const quote   = read('app/admin/inbox/components/CreateQuoteDrawer.tsx')
const quoteShell = read('app/admin/inbox/components/quote-builder/QuoteWorkspaceShell.tsx')
const visa    = read('app/admin/inbox/components/VisaFormDrawer.tsx')
const itin    = read('app/admin/inbox/components/ItineraryRequestDrawer.tsx')
const details = read('app/admin/inbox/components/DetailsDrawer.tsx')
const page    = read('app/admin/inbox/page.tsx')

// QUOTE BUILDER V1.2 — CreateQuoteDrawer deliberately removed from this
// group (see file header comment); it keeps the SAME a11y source-pin
// literals (role="dialog", motion-safe transition, safe-area) at its own
// call site, and keeps using the shared drawerFocusTrap.ts helpers, but no
// longer renders through ActionDrawerShell — it has its own
// QuoteWorkspaceShell instead, covered by its own describe block below.
const ACTION_DRAWERS = { PaymentRequestDrawer: payment, VisaFormDrawer: visa, ItineraryRequestDrawer: itin }
// Used only for the checks that still hold true for all four drawers
// (shared focus-trap helper usage, and the literal role/transition/
// safe-area pins at each drawer's own call site) — NOT for the
// ActionDrawerShell-specific checks (import/render/no-hand-rolled-scrim),
// which are now false by design for CreateQuoteDrawer.
const ALL_FOUR_DRAWERS = { ...ACTION_DRAWERS, CreateQuoteDrawer: quote }

// ── Item A: shared chrome actually adopted by three of the four ─────────────

describe('ActionDrawerShell — adopted by PaymentRequestDrawer/VisaFormDrawer/ItineraryRequestDrawer', () => {
  it('each of these three drawers imports the shared shell and the shared focus-trap helpers', () => {
    for (const [name, src] of Object.entries(ACTION_DRAWERS)) {
      expect(src).toContain("import { ActionDrawerShell } from '@/app/admin/inbox/components/ActionDrawerShell'")
      expect(src).toContain('cycleTabFocus')
      expect(src).toContain('captureFocusRestoreTarget')
      expect(src).toContain('queryDrawerFocusables')
      // Renders through the shell, not a hand-rolled scrim div anymore.
      expect(src).toContain('<ActionDrawerShell')
      expect(src).not.toContain('bg-walz-deep-navy/40')
      void name
    }
  })

  it('CreateQuoteDrawer still imports the shared focus-trap helpers (drawerFocusTrap.ts is NOT ActionDrawerShell-specific) but no longer imports or renders ActionDrawerShell itself, and owns its own scrim — a deliberate, permanent V1.2 divergence, not a gap', () => {
    expect(quote).toContain('cycleTabFocus')
    expect(quote).toContain('captureFocusRestoreTarget')
    expect(quote).toContain('queryDrawerFocusables')
    expect(quote).not.toContain("import { ActionDrawerShell } from '@/app/admin/inbox/components/ActionDrawerShell'")
    expect(quote).not.toContain('<ActionDrawerShell')
    // Its own shell (QuoteWorkspaceShell), not ActionDrawerShell, owns the
    // hand-rolled scrim now — checked directly on that file below.
    expect(quoteShell).toContain('bg-walz-deep-navy/40')
  })

  it('each of all four drawers still declares its own role/transition/safe-area literals at the call site (why: see ActionDrawerShell.tsx header comment — the existing a11y source-pin tests read literals from EACH drawer\'s own file) — true for CreateQuoteDrawer too, even though it now passes them to QuoteWorkspaceShell instead of ActionDrawerShell', () => {
    for (const src of Object.values(ALL_FOUR_DRAWERS)) {
      expect(src).toContain('role="dialog"')
      expect(src).toContain("panelTransitionClassName=\"motion-safe:transition-transform motion-safe:duration-200\"")
      expect(src).toContain("paddingBottom: 'env(safe-area-inset-bottom)'")
    }
  })

  it('QuoteWorkspaceShell (CreateQuoteDrawer\'s own shell) renders the same underlying dialog contract as ActionDrawerShell — scrim with click-to-close, aria-modal, Z_INDEX.drawer, panelRef as the Tab-trap boundary — just a different shape (large workspace, not a right-hand sheet)', () => {
    expect(quoteShell).toContain('aria-modal="true"')
    expect(quoteShell).toContain('Z_INDEX.drawer')
    expect(quoteShell).toContain('absolute inset-0 bg-walz-deep-navy/40')
    expect(quoteShell).toContain('onClick={onClose}')
    expect(quoteShell).toContain('ref={panelRef}')
    // Explicit, non-defaulted role/transition/safe-area props, same
    // convention as ActionDrawerShell (forced to the literal call site in
    // CreateQuoteDrawer.tsx, not hidden here).
    expect(quoteShell).toContain('role: string')
    expect(quoteShell).toContain('panelTransitionClassName: string')
    expect(quoteShell).toContain('panelSafeAreaStyle: CSSProperties')
    // Renders no header/close button of its own — each workspace tree
    // (Desktop/Tablet/Mobile) renders its own; a second one here would be
    // redundant (see file header comment).
    expect(quoteShell).not.toContain('aria-label="Close"')
  })

  it('the shell renders the exact same dialog contract the old inline markup did: aria-modal, Z_INDEX.drawer, header (title + Close button), scrollable body', () => {
    expect(shell).toContain('aria-modal="true"')
    expect(shell).toContain('Z_INDEX.drawer')
    expect(shell).toContain('aria-label="Close"')
    expect(shell).toContain('flex-1 min-h-0 overflow-y-auto p-4 space-y-4')
    expect(shell).toContain('absolute inset-0 bg-walz-deep-navy/40')
    // role/transition/safe-area are explicit REQUIRED props (no default),
    // forced to the literal call site in each drawer — not hidden here.
    expect(shell).toContain('role: string')
    expect(shell).toContain('panelTransitionClassName: string')
    expect(shell).toContain('panelSafeAreaStyle: CSSProperties')
  })

  it('DetailsDrawer is deliberately left independent (documented judgment call), not forced through the shell', () => {
    expect(details).not.toContain('ActionDrawerShell')
    // ...and its own, more granular Tab-cycle pins (checked by
    // inbox-ux4-screens.test.ts) are untouched by this refactor.
    expect(details).toContain('panel.contains(active)')
    expect(details).toContain('e.shiftKey && active === first')
  })
})

// ── Item A: shared focus-trap helpers behave correctly (real calls) ─────────
//
// This repo's Jest config runs testEnvironment 'node' (no jsdom) — the DOM
// globals these two functions read (`document`, `HTMLElement`) are shimmed
// here with the minimum needed to exercise the real logic, rather than
// re-asserting it as a string pin.

interface FakeElement { focus: jest.Mock }
function fakeElement(): FakeElement {
  const el = Object.create((global as unknown as { HTMLElement: { prototype: object } }).HTMLElement.prototype)
  el.focus = jest.fn()
  return el
}
function fakeEvent(opts: { key?: string; shiftKey?: boolean } = {}) {
  return { key: opts.key ?? 'Tab', shiftKey: !!opts.shiftKey, preventDefault: jest.fn() } as unknown as KeyboardEvent
}

beforeAll(() => {
  class FakeHTMLElement {}
  ;(global as unknown as { HTMLElement: unknown }).HTMLElement = FakeHTMLElement
  ;(global as unknown as { document: unknown }).document = { activeElement: null, body: {} }
})

// Import AFTER the shim is installed — the module only touches `document`/
// `HTMLElement` inside function bodies (at call time), never at module
// evaluation time, but importing after the shim keeps this file order-safe
// regardless.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cycleTabFocus, captureFocusRestoreTarget, queryDrawerFocusables } = require('@/app/admin/inbox/components/drawerFocusTrap')

describe('cycleTabFocus (shared Tab-cycle logic)', () => {
  it('no focusables: preventDefault only, no focus calls', () => {
    const panel = { contains: jest.fn() }
    const e = fakeEvent()
    cycleTabFocus(e, [], panel)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(panel.contains).not.toHaveBeenCalled()
  })

  it('active element outside the panel: pulls focus back to the first focusable', () => {
    const first = fakeElement(); const last = fakeElement()
    const outside = fakeElement()
    ;(global as unknown as { document: { activeElement: unknown } }).document.activeElement = outside
    const panel = { contains: jest.fn(() => false) }
    const e = fakeEvent()
    cycleTabFocus(e, [first, last], panel)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(first.focus).toHaveBeenCalled()
    expect(last.focus).not.toHaveBeenCalled()
  })

  it('Shift+Tab on the first focusable wraps to the last', () => {
    const first = fakeElement(); const middle = fakeElement(); const last = fakeElement()
    ;(global as unknown as { document: { activeElement: unknown } }).document.activeElement = first
    const panel = { contains: jest.fn(() => true) }
    const e = fakeEvent({ shiftKey: true })
    cycleTabFocus(e, [first, middle, last], panel)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(last.focus).toHaveBeenCalled()
    expect(first.focus).not.toHaveBeenCalled()
  })

  it('Tab on the last focusable wraps to the first', () => {
    const first = fakeElement(); const last = fakeElement()
    ;(global as unknown as { document: { activeElement: unknown } }).document.activeElement = last
    const panel = { contains: jest.fn(() => true) }
    const e = fakeEvent({ shiftKey: false })
    cycleTabFocus(e, [first, last], panel)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(first.focus).toHaveBeenCalled()
  })

  it('Tab in the middle of the panel: never forces focus (browser default tabbing applies)', () => {
    const first = fakeElement(); const middle = fakeElement(); const last = fakeElement()
    ;(global as unknown as { document: { activeElement: unknown } }).document.activeElement = middle
    const panel = { contains: jest.fn(() => true) }
    const e = fakeEvent({ shiftKey: false })
    cycleTabFocus(e, [first, middle, last], panel)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(first.focus).not.toHaveBeenCalled()
    expect(last.focus).not.toHaveBeenCalled()
  })
})

describe('captureFocusRestoreTarget (shared focus-restore capture)', () => {
  it('captures a real focused element', () => {
    const el = fakeElement()
    ;(global as unknown as { document: { activeElement: unknown } }).document.activeElement = el
    expect(captureFocusRestoreTarget()).toBe(el)
  })

  it('never captures <body> — matches DetailsDrawer\'s documented rule', () => {
    const doc = (global as unknown as { document: { activeElement: unknown; body: unknown } }).document
    doc.activeElement = doc.body
    expect(captureFocusRestoreTarget()).toBeNull()
  })

  it('returns null when nothing is focused', () => {
    ;(global as unknown as { document: { activeElement: unknown } }).document.activeElement = null
    expect(captureFocusRestoreTarget()).toBeNull()
  })
})

describe('queryDrawerFocusables', () => {
  it('queries the panel with the same focusable selector every drawer used inline', () => {
    const found = [fakeElement()]
    const panel = { querySelectorAll: jest.fn(() => found) }
    const result = queryDrawerFocusables(panel)
    expect(panel.querySelectorAll).toHaveBeenCalledWith(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    expect(result).toEqual(found)
  })
})

// ── Item B: mutual exclusivity ───────────────────────────────────────────────

describe('mutual exclusivity — opening one Client Action Centre overlay closes the others', () => {
  it('page.tsx defines a single closeOtherActionOverlays helper covering all five overlays', () => {
    const fn = page.slice(page.indexOf('function closeOtherActionOverlays'), page.indexOf('function openPaymentRequest'))
    expect(fn).toContain("if (except !== 'payment') setPaymentOpen(false)")
    expect(fn).toContain("if (except !== 'quote') setQuoteOpen(false)")
    expect(fn).toContain("if (except !== 'visaForm') setVisaFormOpen(false)")
    expect(fn).toContain("if (except !== 'itineraryRequest') setItineraryRequestOpen(false)")
    expect(fn).toContain("if (except !== 'identity') setIdentityDrawer(null)")
  })

  it('every one of the five open-handlers routes through the guard before setting itself open', () => {
    expect(page).toContain("function openPaymentRequest() { closeOtherActionOverlays('payment'); setPaymentOpen(true) }")
    expect(page).toContain("function openCreateQuote() { closeOtherActionOverlays('quote'); setQuoteOpen(true) }")
    expect(page).toContain("function openVisaForm() { closeOtherActionOverlays('visaForm'); setVisaFormOpen(true) }")
    expect(page).toContain("function openItineraryRequest() { closeOtherActionOverlays('itineraryRequest'); setItineraryRequestOpen(true) }")
    expect(page).toContain("function openClientIdentity(mode: 'find' | 'create') { closeOtherActionOverlays('identity'); setIdentityDrawer({ mode }) }")
  })

  it('the desktop rail wires all five triggers through the guarded open-handlers, not the raw setters', () => {
    const railBlock = page.slice(page.indexOf('{selected && !copilotOpen && ('), page.indexOf('{/* Staff Jade copilot'))
    expect(railBlock).toContain('onOpenPaymentRequest={openPaymentRequest}')
    expect(railBlock).toContain('onOpenVisaForm={openVisaForm}')
    expect(railBlock).toContain('onOpenItineraryRequest={openItineraryRequest}')
    expect(railBlock).toContain('onOpenCreateQuote={openCreateQuote}')
    expect(railBlock).toContain('onOpenClientIdentity={openClientIdentity}')
  })

  it('the mobile/tablet Client Details overlay wires all five triggers through the SAME guarded handlers', () => {
    const overlayBlock = page.slice(page.indexOf('<DetailsDrawer open'), page.indexOf('</DetailsDrawer>'))
    expect(overlayBlock).toContain('openPaymentRequest()')
    expect(overlayBlock).toContain('openVisaForm()')
    expect(overlayBlock).toContain('openItineraryRequest()')
    expect(overlayBlock).toContain('openCreateQuote()')
    expect(overlayBlock).toContain('openClientIdentity(mode)')
    // Still closes Client Details first — unrelated to the five-overlay guard.
    expect(overlayBlock).toContain('screens.closeDetails()')
  })

  it('a raw setXOpen(true) call — bypassing the guard — appears nowhere outside the five open-handler definitions and the existing "close all on conversation switch / screen change" resets', () => {
    // Every remaining `setPaymentOpen(true)` etc. in the file must be the
    // ONE inside its own open-handler — never a second, ungated call site
    // that would silently skip the mutual-exclusion guard.
    const setters: [string, string][] = [
      ['setPaymentOpen(true)', 'openPaymentRequest'],
      ['setQuoteOpen(true)', 'openCreateQuote'],
      ['setVisaFormOpen(true)', 'openVisaForm'],
      ['setItineraryRequestOpen(true)', 'openItineraryRequest'],
    ]
    for (const [setterCall, ownerFn] of setters) {
      const count = page.split(setterCall).length - 1
      expect(count).toBe(1)
      expect(page).toContain(`function ${ownerFn}() { closeOtherActionOverlays`)
      void ownerFn
    }
  })
})
