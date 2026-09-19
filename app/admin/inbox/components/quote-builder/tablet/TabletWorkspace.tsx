'use client'

// QUOTE BUILDER V1.2 (Agent B — Mobile/Tablet) — the tablet (768–1023px)
// adaptive two-pane workspace: neither a shrunk desktop three-column
// layout nor the mobile single-column forward-navigating flow.
//
//   left pane  — a compact horizontal service-tab-strip (7 tabs, icon +
//                count, wraps on narrower tablet widths) with the active
//                service's search form AND results stacked below it
//                (both visible at once — tablet width doesn't need the
//                mobile search/results screen split).
//   right pane — a persistent summary sidebar. Reuses
//                mobile/QuoteBasketSheet.tsx UNMODIFIED rather than a
//                fresh implementation: it already carries the exact
//                button-mapping resolution (Create Quote -> Preview/
//                Finalize -> Copy/Insert/Send/Open-in-editor) this brief
//                requires to stay consistent with the mobile tree, and
//                duplicating that state machine a second time would risk
//                the two trees drifting out of sync. `onAddAnother` is
//                omitted here (undefined) since QuoteBasketSheet only
//                renders that affordance when a callback is supplied —
//                tablet has nothing to "go back" to, both panes are
//                always visible together.
//
// Reuses mobile/panels/* directly (encouraged by the brief for the tablet
// tree specifically) — each panel's `screen` prop is rendered TWICE here
// ('search' then, when there's something to show, 'results') instead of
// mobile's single current-screen swap, since tablet has room to show the
// form and its results at the same time. onSearched/onEditSearch are
// no-ops here — there is no screen to navigate between.
//
// Select-&-price choice: reuses mobile/SelectPricePanel.tsx as a bottom
// sheet rather than building a third, tablet-specific side-panel
// implementation. At 768–1023px a bottom sheet still reads comfortably
// (it's simply narrower than the full viewport width would suggest), and
// reusing it outright removes any risk of the tablet and mobile pricing
// UIs drifting apart on business rules (revalidation states, the price-
// change acceptance flow, the disabled conditions on "Add to quote").
import type { RefObject } from 'react'
import {
  Plane, Hotel, Activity, Car, Stamp, Sparkles, ClipboardList, CheckCircle2, X, ExternalLink,
} from 'lucide-react'
import { CompleteClientProfile } from '@/app/admin/inbox/components/CompleteClientProfile'
import type { QuoteBuilderState, ServiceKey } from '../useQuoteBuilderState'
import { QuoteBasketSheet } from '../mobile/QuoteBasketSheet'
import { SelectPricePanel } from '../mobile/SelectPricePanel'
import { FlightPanel } from '../mobile/panels/FlightPanel'
import { HotelPanel } from '../mobile/panels/HotelPanel'
import { ActivityPanel } from '../mobile/panels/ActivityPanel'
import { TransferPanel } from '../mobile/panels/TransferPanel'
import { ManualItemPanel } from '../mobile/panels/ManualItemPanel'

export interface TabletWorkspaceProps {
  state: QuoteBuilderState
  onClose: () => void
  /** See mobile/MobileWorkspace.tsx's identical prop comment — required by
   *  CompleteClientProfile, not exposed on QuoteBuilderState itself. */
  conversationId: number
  /** QUOTE BUILDER V1.2 integration pass (optional, additive, backward-
   *  compatible) — see mobile/MobileWorkspace.tsx's identical prop
   *  comment. */
  closeButtonRef?: RefObject<HTMLButtonElement>
}

const SERVICE_TABS: { key: ServiceKey; label: string; Icon: typeof Plane }[] = [
  { key: 'flight', label: 'Flights', Icon: Plane },
  { key: 'hotel', label: 'Hotels', Icon: Hotel },
  { key: 'activity', label: 'Activities', Icon: Activity },
  { key: 'transfer', label: 'Transfer', Icon: Car },
  { key: 'visa', label: 'Visa', Icon: Stamp },
  { key: 'walz_service', label: 'Walz Service', Icon: Sparkles },
  { key: 'manual', label: 'Custom Item', Icon: ClipboardList },
]

// Identical resolution to mobile/MobileWorkspace.tsx's countFor — kept as
// its own small copy rather than a shared import, per the brief's "small
// presentational duplication ... is expected and fine" allowance; this one
// genuinely is presentational (a count badge), not a business rule.
function countFor(state: QuoteBuilderState, key: ServiceKey): number {
  if (key === 'flight' || key === 'hotel' || key === 'activity' || key === 'transfer') {
    return state.attachedLive.filter(i => i.type === key).length
  }
  if (key === 'visa') return state.items.filter(i => i.type === 'visa_service').length
  if (key === 'walz_service') return state.items.filter(i => i.type === 'custom').length
  return state.items.filter(i => i.type !== 'visa_service' && i.type !== 'custom').length
}

const noop = () => {}

export function TabletWorkspace({ state, onClose, conversationId, closeButtonRef }: TabletWorkspaceProps) {
  const gated =
    state.ctxError || !state.ctx || !state.identityOk || state.duplicateOf || state.profileGate

  return (
    <div className="relative h-full w-full bg-white flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-walz-border flex-shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-walz-deep-navy">Create Quote</p>
          <p className="text-xs text-walz-muted-strong truncate flex items-center gap-1.5">
            <span className="truncate">{state.ctx?.contact?.name ?? 'Client on file'}</span>
            {state.identityOk && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-green-700 flex-shrink-0">
                <CheckCircle2 className="w-3 h-3" /> Linked
              </span>
            )}
          </p>
        </div>
        <button ref={closeButtonRef} onClick={onClose} aria-label="Close" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-walz-muted-strong hover:text-walz-deep-navy">
          <X className="w-5 h-5" />
        </button>
      </div>

      {state.ctxError ? (
        <div role="alert" className="p-6 space-y-2 max-w-md">
          <p className="text-sm text-walz-muted-strong">Could not load client context.</p>
          <button
            onClick={() => { state.retryCtx(); void state.loadRecent() }}
            className="min-h-[44px] px-4 rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : !state.ctx ? (
        <div className="p-6 space-y-2">
          <span className="sr-only" role="status">Loading client</span>
          <div className="space-y-2 motion-safe:animate-pulse" aria-hidden="true">
            <div className="h-4 w-40 rounded bg-walz-navy/10" />
            <div className="h-3 w-28 rounded bg-walz-navy/10" />
          </div>
        </div>
      ) : !state.identityOk ? (
        <div className="p-6 max-w-md">
          <div role="alert" className="rounded-xl border border-walz-border bg-walz-off-white p-4">
            <p className="text-sm font-bold text-walz-deep-navy">Client identity required</p>
            <p className="text-sm text-walz-muted-strong mt-1">
              Verify the client through the Application Lookup before creating a quote.
            </p>
          </div>
        </div>
      ) : state.duplicateOf ? (
        <div className="p-6 space-y-3 max-w-md">
          <div className="rounded-xl border border-walz-border bg-walz-off-white p-4">
            <p className="text-sm font-bold text-walz-deep-navy">A matching draft already exists</p>
            <p className="text-sm text-walz-muted-strong mt-1">
              {state.duplicateOf.reference} was created moments ago for this conversation with the same title.
            </p>
          </div>
          <a
            href={`/admin/quotes/${state.duplicateOf.id}`} target="_blank" rel="noreferrer"
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
          >
            Open in quote editor <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      ) : state.profileGate ? (
        <div className="p-6 max-w-md">
          <CompleteClientProfile
            conversationId={conversationId}
            missingFields={state.profileGate.missingFields}
            availableFields={state.profileGate.availableFields}
            crossRecordConflicts={state.profileGate.crossRecordConflicts}
            onComplete={() => { state.setProfileGate(null); state.retryCtx(); void state.loadRecent() }}
          />
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0 overflow-y-auto border-r border-walz-border">
            <div className="flex flex-wrap gap-1 p-3 border-b border-walz-border">
              {SERVICE_TABS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => state.selectService(key)}
                  className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5
                    ${state.activeService === key ? 'bg-walz-navy text-white border-walz-navy' : 'bg-white text-walz-navy border-walz-border hover:bg-walz-navy/5'}`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label} · {countFor(state, key)}
                </button>
              ))}
            </div>

            {state.activeService === 'flight' && (
              <>
                <FlightPanel state={state} screen="search" onSearched={noop} onEditSearch={noop} />
                {(state.flightResults.length > 0 || state.liveSearching || state.liveError) && (
                  <FlightPanel state={state} screen="results" onSearched={noop} onEditSearch={noop} showEditSearch={false} />
                )}
              </>
            )}
            {state.activeService === 'hotel' && (
              <>
                <HotelPanel state={state} screen="search" onSearched={noop} onEditSearch={noop} />
                {(state.hotelResults.length > 0 || state.liveSearching || state.liveError) && (
                  <HotelPanel state={state} screen="results" onSearched={noop} onEditSearch={noop} showEditSearch={false} />
                )}
              </>
            )}
            {state.activeService === 'activity' && (
              <>
                <ActivityPanel state={state} screen="search" onSearched={noop} onEditSearch={noop} />
                {(state.activityResults.length > 0 || state.liveSearching || state.liveError) && (
                  <ActivityPanel state={state} screen="results" onSearched={noop} onEditSearch={noop} showEditSearch={false} />
                )}
              </>
            )}
            {state.activeService === 'transfer' && (
              <>
                <TransferPanel state={state} screen="search" onSearched={noop} onEditSearch={noop} />
                {(state.transferResults.length > 0 || state.liveSearching || state.liveError || state.transferUnavailable) && (
                  <TransferPanel state={state} screen="results" onSearched={noop} onEditSearch={noop} showEditSearch={false} />
                )}
              </>
            )}
            {state.activeService === 'visa' && <ManualItemPanel state={state} variant="visa" />}
            {state.activeService === 'walz_service' && <ManualItemPanel state={state} variant="walz_service" />}
            {state.activeService === 'manual' && <ManualItemPanel state={state} variant="manual" />}
          </div>

          <aside className="w-[360px] flex-shrink-0 overflow-y-auto">
            <QuoteBasketSheet state={state} />
          </aside>
        </div>
      )}

      {!gated && <SelectPricePanel state={state} />}
    </div>
  )
}
