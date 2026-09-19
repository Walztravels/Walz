'use client'

// QUOTE BUILDER V1.2 (Agent B — Mobile/Tablet) — the mobile (<768px)
// dedicated workflow: Services grid -> Search -> Results -> pricing sheet
// -> back to Results/Services, with a persistent basket bar whenever any
// item exists. NOT a shrunk desktop layout — a full-screen, single-column,
// forward-navigating flow per the V1.2 brief's mobile mockup.
//
// `screen` below is the ONLY local component state in this whole tree —
// pure navigation UI, never a place business data could get lost. Every
// item ever added lives on `state` (state.items / state.attachedLive),
// which this component only ever reads and calls functions on; nothing
// here can lose a previously-added item by navigating backward.
import { useState, type ReactNode, type RefObject } from 'react'
import {
  Plane, Hotel, Activity, Car, Stamp, Sparkles, ClipboardList,
  ArrowLeft, X, CheckCircle2, ExternalLink,
} from 'lucide-react'
import { CompleteClientProfile } from '@/app/admin/inbox/components/CompleteClientProfile'
import type { QuoteBuilderState, ServiceKey } from '../useQuoteBuilderState'
import { QuoteBasketBar } from './QuoteBasketBar'
import { QuoteBasketSheet } from './QuoteBasketSheet'
import { SelectPricePanel } from './SelectPricePanel'
import { FlightPanel } from './panels/FlightPanel'
import { HotelPanel } from './panels/HotelPanel'
import { ActivityPanel } from './panels/ActivityPanel'
import { TransferPanel } from './panels/TransferPanel'
import { ManualItemPanel } from './panels/ManualItemPanel'

export interface MobileWorkspaceProps {
  state: QuoteBuilderState
  onClose: () => void
  /** Not part of QuoteBuilderState's return (useQuoteBuilderState only
   *  ACCEPTS conversationId as a hook param — it never re-exposes it on
   *  the returned object) but CompleteClientProfile requires it to POST
   *  the client-profile save. Since useQuoteBuilderState.ts is off-limits
   *  to modify, the caller (the later integration pass, which already has
   *  conversationId in scope from CreateQuoteDrawerProps) passes it
   *  through directly. The tablet tree takes the same extra prop for the
   *  same reason. */
  conversationId: number
  /** QUOTE BUILDER V1.2 integration pass (optional, additive, backward-
   *  compatible) — lets CreateQuoteDrawer.tsx attach its own `closeRef`
   *  (the a11y focus-in-on-open / Tab-trap boundary target every sibling
   *  Action Centre drawer already relies on) directly to this workspace's
   *  own close button. Omitting the prop changes nothing. */
  closeButtonRef?: RefObject<HTMLButtonElement>
}

type MobileScreen = 'services' | 'search' | 'results' | 'basket'

const SERVICE_TILES: { key: ServiceKey; label: string; Icon: typeof Plane }[] = [
  { key: 'flight', label: 'Flights', Icon: Plane },
  { key: 'hotel', label: 'Hotels', Icon: Hotel },
  { key: 'activity', label: 'Activities', Icon: Activity },
  { key: 'transfer', label: 'Transfer', Icon: Car },
  { key: 'visa', label: 'Visa', Icon: Stamp },
  { key: 'walz_service', label: 'Walz Service', Icon: Sparkles },
  { key: 'manual', label: 'Other / Manual', Icon: ClipboardList },
]

// QUOTE BUILDER V1.2 scope decision (documented in the release report,
// identical resolution used by ManualItemPanel.tsx and the tablet tree) —
// visa counts state.items typed 'visa_service' (already what
// state.applyVisaPreset sets); walz_service counts state.items typed
// 'custom' (the generic/catch-all Quote item type — matches desktop's
// ServicesRail.tsx exactly); manual counts everything else in state.items.
// The four live-search types count state.attachedLive by type.
function countFor(state: QuoteBuilderState, key: ServiceKey): number {
  if (key === 'flight' || key === 'hotel' || key === 'activity' || key === 'transfer') {
    return state.attachedLive.filter(i => i.type === key).length
  }
  if (key === 'visa') return state.items.filter(i => i.type === 'visa_service').length
  if (key === 'walz_service') return state.items.filter(i => i.type === 'custom').length
  return state.items.filter(i => i.type !== 'visa_service' && i.type !== 'custom').length
}

export function MobileWorkspace({ state, onClose, conversationId, closeButtonRef }: MobileWorkspaceProps) {
  const [screen, setScreen] = useState<MobileScreen>('services')

  // QUOTE BUILDER V1.2 closing fix (security review finding #1) — identical
  // gating to tablet/TabletWorkspace.tsx's own `gated` computation. This is
  // an additional UI guard on top of the existing server-side
  // re-verification in add-to-quote/route.ts: it stops SelectPricePanel from
  // staying mounted/interactive once identity/profile gating has taken over
  // (e.g. a duplicate-draft or profile-completeness gate appears while a
  // pricing sheet is already open).
  const gated =
    state.ctxError || !state.ctx || !state.identityOk || state.duplicateOf || state.profileGate

  const totalCount = state.items.length + state.attachedLive.length
  const showBasketBar = totalCount > 0 && screen !== 'basket'

  function selectTile(key: ServiceKey) {
    state.selectService(key)
    setScreen('search')
  }

  let body: ReactNode
  let showHeaderBack = false

  if (state.ctxError) {
    body = (
      <div role="alert" className="p-4 space-y-2">
        <p className="text-sm text-walz-muted-strong">Could not load client context.</p>
        <button
          onClick={() => { state.retryCtx(); void state.loadRecent() }}
          className="min-h-[48px] px-4 rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  } else if (!state.ctx) {
    body = (
      <div className="p-4 space-y-2">
        <span className="sr-only" role="status">Loading client</span>
        <div className="space-y-2 motion-safe:animate-pulse" aria-hidden="true">
          <div className="h-4 w-40 rounded bg-walz-navy/10" />
          <div className="h-3 w-28 rounded bg-walz-navy/10" />
        </div>
      </div>
    )
  } else if (!state.identityOk) {
    body = (
      <div className="p-4">
        <div role="alert" className="rounded-xl border border-walz-border bg-walz-off-white p-4">
          <p className="text-sm font-bold text-walz-deep-navy">Client identity required</p>
          <p className="text-sm text-walz-muted-strong mt-1">
            Verify the client through the Application Lookup before creating a quote.
          </p>
        </div>
      </div>
    )
  } else if (state.duplicateOf) {
    body = (
      <div className="p-4 space-y-3">
        <div className="rounded-xl border border-walz-border bg-walz-off-white p-4">
          <p className="text-sm font-bold text-walz-deep-navy">A matching draft already exists</p>
          <p className="text-sm text-walz-muted-strong mt-1">
            {state.duplicateOf.reference} was created moments ago for this conversation with the same title.
          </p>
        </div>
        <a
          href={`/admin/quotes/${state.duplicateOf.id}`} target="_blank" rel="noreferrer"
          className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors"
        >
          Open in quote editor <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    )
  } else if (state.profileGate) {
    const gate = state.profileGate
    body = (
      <div className="p-4">
        <CompleteClientProfile
          conversationId={conversationId}
          missingFields={gate.missingFields}
          availableFields={gate.availableFields}
          crossRecordConflicts={gate.crossRecordConflicts}
          onComplete={() => { state.setProfileGate(null); state.retryCtx(); void state.loadRecent() }}
        />
      </div>
    )
  } else if (screen === 'services') {
    body = (
      <div className="grid grid-cols-2 gap-3 p-4">
        {SERVICE_TILES.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => selectTile(key)}
            className="min-h-[88px] rounded-xl border border-walz-border bg-white p-3 flex flex-col items-start justify-between hover:bg-walz-off-white transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
          >
            <Icon className="w-5 h-5 text-walz-navy" />
            <span className="text-sm font-semibold text-walz-deep-navy">{label}</span>
            <span className="text-xs text-walz-muted-strong">{countFor(state, key)} added</span>
          </button>
        ))}
      </div>
    )
  } else if (screen === 'basket') {
    body = <QuoteBasketSheet state={state} onAddAnother={() => setScreen('services')} />
  } else {
    showHeaderBack = true
    const onSearched = () => setScreen('results')
    const onEditSearch = () => setScreen('search')
    switch (state.activeService) {
      case 'flight':
        body = <FlightPanel state={state} screen={screen} onSearched={onSearched} onEditSearch={onEditSearch} />
        break
      case 'hotel':
        body = <HotelPanel state={state} screen={screen} onSearched={onSearched} onEditSearch={onEditSearch} />
        break
      case 'activity':
        body = <ActivityPanel state={state} screen={screen} onSearched={onSearched} onEditSearch={onEditSearch} />
        break
      case 'transfer':
        body = <TransferPanel state={state} screen={screen} onSearched={onSearched} onEditSearch={onEditSearch} />
        break
      case 'visa':
        body = <ManualItemPanel state={state} variant="visa" />
        break
      case 'walz_service':
        body = <ManualItemPanel state={state} variant="walz_service" />
        break
      default:
        body = <ManualItemPanel state={state} variant="manual" />
    }
  }

  // QUOTE BUILDER V1.2 root z-index choice — this workspace mounts as a
  // full-screen takeover (per the brief: "NOT a shrunk desktop layout"),
  // so its root needs to sit above CreateQuoteDrawer.tsx's own scrim
  // (lib/admin/chrome.ts Z_INDEX.drawer = 60) in case the later
  // integration pass mounts it alongside rather than fully replacing that
  // drawer's panel content. z-[61] — one above the drawer, comfortably
  // below Z_INDEX.modal (70) since this is page-local, not a global
  // blocking dialog. Being `fixed` + z-indexed, this root also creates a
  // fresh stacking context, so QuoteBasketBar (z-20) and SelectPricePanel
  // (z-30) below only ever need to out-rank THEIR OWN siblings inside it.
  return (
    <div className="fixed inset-0 z-[61] bg-white flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-walz-border flex-shrink-0">
        {showHeaderBack && (
          <button
            onClick={() => setScreen('services')}
            aria-label="Back to services"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-walz-navy -ml-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
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

      <div className="flex-1 overflow-y-auto" style={showBasketBar ? { paddingBottom: 72 } : undefined}>
        {body}
      </div>

      {showBasketBar && <QuoteBasketBar state={state} onView={() => setScreen('basket')} />}

      {!gated && <SelectPricePanel state={state} />}
    </div>
  )
}
