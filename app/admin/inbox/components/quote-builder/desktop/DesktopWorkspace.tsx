'use client'

// QUOTE BUILDER V1.2 — Desktop workspace shell (>=1024px).
//
// Header + 3-column grid: Trip Services rail / active service workspace /
// sticky Quote Summary. Mounted client-side only at lg: and up by a later
// integration pass — this file only needs to look right at a comfortable
// desktop viewport, not handle responsive hiding itself.
//
// Deviation from the brief's literal `{ state, onClose }` signature: the
// profile-completeness gate (state.profileGate) must render the existing
// <CompleteClientProfile> component, which HARD-REQUIRES a `conversationId`
// prop (it POSTs to /api/admin/inbox/conversations/${conversationId}/
// client-profile) — and conversationId is not exposed on QuoteBuilderState
// (useQuoteBuilderState.ts's return object omits it; only the hook's own
// closure has it, from its own params). Rather than invent a client-profile
// endpoint shape that doesn't need it, or silently fail to render the gate,
// this component takes one additional required prop, `conversationId`,
// which the integration pass (which already has it — CreateQuoteDrawer
// receives it today) can pass straight through.
//
// Gate precedence (identity -> duplicate -> profile -> normal workspace)
// matches CreateQuoteDrawer.tsx's existing behavior exactly; each gate here
// takes over the FULL workspace (not just the summary column) so it's an
// unmissable full-panel state per the brief's identity-gate guidance, and
// so duplicateOf/profileGate never have to coexist with a half-usable
// 3-column grid behind them.
//
// QUOTE BUILDER V1.2 integration pass — `closeButtonRef` (optional,
// additive, backward-compatible) lets CreateQuoteDrawer.tsx attach its own
// `closeRef` (the a11y focus-in-on-open / Tab-trap boundary target every
// sibling Action Centre drawer already relies on) directly to this
// workspace's own close button, instead of this file needing to know
// anything about the drawer's shell. Omitting the prop changes nothing.

import { ExternalLink, X } from 'lucide-react'
import type { RefObject } from 'react'
import { CompleteClientProfile } from '@/app/admin/inbox/components/CompleteClientProfile'
import type { QuoteBuilderState } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { ServicesRail } from './ServicesRail'
import { QuoteSummaryPanel } from './QuoteSummaryPanel'
import { SelectPricePanel } from './SelectPricePanel'
import { FlightPanel } from './panels/FlightPanel'
import { HotelPanel } from './panels/HotelPanel'
import { ActivityPanel } from './panels/ActivityPanel'
import { TransferPanel } from './panels/TransferPanel'
import { ManualItemPanel } from './panels/ManualItemPanel'

export interface DesktopWorkspaceProps {
  state: QuoteBuilderState
  onClose: () => void
  /** See file header comment — required by CompleteClientProfile, not
   *  exposed on QuoteBuilderState itself. */
  conversationId: number
  /** See file header comment — optional, additive; QUOTE BUILDER V1.2
   *  integration pass. */
  closeButtonRef?: RefObject<HTMLButtonElement>
}

export function DesktopWorkspace({ state, onClose, conversationId, closeButtonRef }: DesktopWorkspaceProps) {
  const clientName = state.ctx?.contact?.name ?? null

  // Scope guardrail: there is no trip-destination/dates/traveller-count
  // field anywhere in the Quote/state data model. Rather than invent new
  // state for the mockup's subtitle line, derive a best-effort one
  // opportunistically from whatever the in-progress flight search fields
  // already hold, and omit entirely otherwise — never fabricated, never
  // blocking.
  const tripSummary = state.flFrom && state.flTo ? `${state.flFrom} → ${state.flTo}` : null

  return (
    <div className="flex flex-col h-full min-h-0 bg-walz-off-white">
      <header className="flex-shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-b border-walz-border bg-white">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-bold text-walz-deep-navy truncate">
              Create Quote{clientName ? ` — ${clientName}` : ''}
            </h1>
            {state.ctx && (
              <span
                className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full
                  ${state.identityOk ? 'bg-green-100 text-green-800' : 'bg-walz-off-white text-walz-muted-strong border border-walz-border'}`}
              >
                {state.identityOk ? 'Linked ✓' : 'Unverified'}
              </span>
            )}
          </div>
          {tripSummary && <p className="text-xs text-walz-muted-strong mt-1">{tripSummary}</p>}
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close create quote workspace"
          className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-walz-muted-strong hover:bg-walz-navy/5 hover:text-walz-deep-navy transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 min-h-0">
        {state.ctxError ? (
          <div className="h-full flex items-center justify-center p-8">
            <div role="alert" className="max-w-sm text-center space-y-3">
              <p className="text-sm text-walz-muted-strong">Could not load client context.</p>
              <button
                type="button"
                onClick={() => { state.retryCtx(); void state.loadRecent() }}
                className="min-h-[44px] px-4 rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
              >
                Retry
              </button>
            </div>
          </div>
        ) : !state.ctx ? (
          <div className="h-full flex items-center justify-center p-8">
            <span className="sr-only" role="status">Loading client</span>
            <div className="w-full max-w-md space-y-3 motion-safe:animate-pulse" aria-hidden="true">
              <div className="h-5 w-56 rounded bg-walz-navy/10" />
              <div className="h-4 w-40 rounded bg-walz-navy/10" />
              <div className="h-40 w-full rounded-xl bg-walz-navy/5" />
            </div>
          </div>
        ) : !state.identityOk ? (
          <div className="h-full flex items-center justify-center p-8">
            <div role="alert" className="max-w-md w-full rounded-xl border border-walz-border bg-white p-6 text-center space-y-2">
              <p className="text-sm font-bold text-walz-deep-navy">Client identity required</p>
              <p className="text-xs text-walz-muted-strong">
                Verify the client through the Application Lookup before creating a quote.
              </p>
            </div>
          </div>
        ) : state.duplicateOf ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-md w-full space-y-3">
              <div className="rounded-xl border border-walz-border bg-white p-4">
                <p className="text-sm font-bold text-walz-deep-navy">A matching draft already exists</p>
                <p className="text-xs text-walz-muted-strong mt-1">
                  {state.duplicateOf.reference} was created moments ago for this conversation with the same title.
                </p>
              </div>
              <a
                href={`/admin/quotes/${state.duplicateOf.id}`} target="_blank" rel="noreferrer"
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
              >
                Open in quote editor <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        ) : state.profileGate ? (
          <div className="h-full overflow-y-auto p-8 flex items-start justify-center">
            <div className="max-w-md w-full">
              <CompleteClientProfile
                conversationId={conversationId}
                missingFields={state.profileGate.missingFields}
                availableFields={state.profileGate.availableFields}
                crossRecordConflicts={state.profileGate.crossRecordConflicts}
                onComplete={() => { state.setProfileGate(null); state.retryCtx(); void state.loadRecent() }}
              />
            </div>
          </div>
        ) : (
          <div className="h-full min-h-0 grid grid-cols-[19%_54%_27%]">
            <div className="min-h-0 overflow-y-auto border-r border-walz-border bg-white">
              <ServicesRail state={state} />
            </div>
            <div className="min-h-0 overflow-y-auto p-5 relative">
              {state.activeService === 'flight' && <FlightPanel state={state} />}
              {state.activeService === 'hotel' && <HotelPanel state={state} />}
              {state.activeService === 'activity' && <ActivityPanel state={state} />}
              {state.activeService === 'transfer' && <TransferPanel state={state} />}
              {state.activeService === 'visa' && <ManualItemPanel state={state} variant="visa" />}
              {state.activeService === 'walz_service' && <ManualItemPanel state={state} variant="walz_service" />}
              {state.activeService === 'manual' && <ManualItemPanel state={state} variant="manual" />}
              {state.pending && <SelectPricePanel state={state} />}
            </div>
            <div className="min-h-0 overflow-y-auto border-l border-walz-border bg-white">
              <QuoteSummaryPanel state={state} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
