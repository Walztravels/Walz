'use client'

// useQuoteBuilderState — QUOTE BUILDER V1.2, step 1 (pure extraction).
//
// Every piece of Quote Builder BUSINESS state and logic that used to live
// directly inside CreateQuoteDrawer.tsx now lives here instead: manual line
// items, live Flight/Hotel/Activity/Transfer search, multi-city legs,
// airport selection, pending-offer pricing/revalidation, add-to-quote, and
// quote creation/finalize/send. This is a MECHANICAL, behavior-preserving
// extraction — no fetch payload, condition, function name, or state
// variable name changed. CreateQuoteDrawer.tsx keeps only the a11y/DOM-shell
// plumbing (focus trap, Escape/Tab handling, ActionDrawerShell wiring) and
// calls this hook for everything else, rendering the exact same JSX it
// always has.
//
// See CreateQuoteDrawer.tsx's own header comment for the full commercial-
// discipline description (SELECT -> PREPARE -> REVIEW -> GENERATED ->
// SHARE) — unchanged by this extraction.

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useComposerDraft } from '@/app/admin/inbox/ComposerDraftContext'
import { isValidAmountMajor } from '@/lib/action-centre/constants'
import type { ProfileField } from '@/lib/inbox/client-profile'
import { useClientContext } from '@/lib/inbox/useClientContext'
import type {
  NormalizedFlightOffer, NormalizedHotelOffer,
  NormalizedActivityOffer, NormalizedTransferOffer, AddToQuotePayload,
} from '@/lib/travel-search/types'
import { calculateBookingPrice, defaultMarkupPercent, type BookingProductType, type BookingSupplier } from '@/lib/pricing/booking-price'
import { UK_VISA_FEES } from '@/lib/config/visa-fees'
import { fetchAirportSuggestions, type ApiAirport } from '@/app/admin/inbox/components/AirportDropdown'

export interface QuoteListItem {
  id: string; reference: string; title: string; status: string
  totalMinor: number; currency: string; createdAt: string
}

export interface DraftLineItem {
  key: string; type: string; title: string; description: string; priceMajor: string
}

export const ITEM_TYPES = ['flight', 'hotel', 'activity', 'transfer', 'tour', 'package', 'visa_service', 'custom'] as const
export const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'NGN'] as const

const STATUS_GLYPH: Record<string, string> = {
  draft: 'Draft', sent: '⏳ Sent', viewed: '👁 Viewed', accepted: '✓ Accepted',
  declined: '✗ Declined', changes_requested: 'Changes requested', expired: 'Expired',
  converted: 'Converted', cancelled: 'Cancelled', archived: 'Archived',
}
export function statusLabel(s: string): string { return STATUS_GLYPH[s] ?? s }

// ── UX-4.2b live search & attach — types/helpers (module scope) ──────────
// Every search/attach call goes through the existing
// /api/admin/travel-search/* routes; nothing here talks to a supplier
// directly or re-derives offer storage.
export type LiveServiceType = 'flight' | 'hotel' | 'activity' | 'transfer'
// QUOTE BUILDER V1.2 — Services rail entries. The three beyond
// LiveServiceType (visa/walz_service/manual) all render the existing manual
// line-item form (addItem/removeItem/applyVisaPreset) — no new item type,
// no new pricing path; only the entry framing differs.
export type ServiceKey = LiveServiceType | 'visa' | 'walz_service' | 'manual'
export type NormalizedOffer =
  | NormalizedFlightOffer | NormalizedHotelOffer | NormalizedActivityOffer | NormalizedTransferOffer

export const LIVE_TABS: { id: LiveServiceType; label: string }[] = [
  { id: 'flight', label: 'Flight' },
  { id: 'hotel', label: 'Hotel' },
  { id: 'activity', label: 'Activity' },
  { id: 'transfer', label: 'Transfer' },
]

export interface AttachedLiveItem {
  key: string; type: LiveServiceType; title: string
  costMinor: number; markupMinor: number; serviceFeeMinor: number; sellingPriceMinor: number; currency: string
  // V1.3 — the server-assigned QuoteItem.id, captured from add-to-quote's
  // response (every branch returns `item: {...}` — see
  // app/api/admin/travel-search/add-to-quote/route.ts). Required for
  // Remove/Edit-pricing/Replace, which must reference a specific server row,
  // not just this client-side display list.
  itemId: string
}

// Multi-city leg — same shape/behavior as FlightSearchWidget.tsx's MCLeg
// (from/to display text + resolved IATA code, per-leg suggestion lists),
// adapted to this drawer's plain <input type="date"> string convention
// (flDepart/flReturn are already strings here, not Date objects).
export interface FlLeg {
  from: string; fromCode: string
  to: string;   toCode: string
  depart: string
  fromSug: ApiAirport[]; toSug: ApiAirport[]
}
export function emptyFlLeg(): FlLeg { return { from: '', fromCode: '', to: '', toCode: '', depart: '', fromSug: [], toSug: [] } }
// Same cap FlightSearchWidget.tsx's addMcLeg() enforces (mcLegs.length >= 5).
export const MC_MAX_LEGS = 5

export interface PendingOffer {
  token: number
  type: LiveServiceType
  offer: NormalizedOffer
  title: string
  supplierMinor: number
  offerCurrency: string
  supplier: BookingSupplier
  productType: BookingProductType
  extra?: { rateKey: string }
  markupPercent: number
  serviceFeeMajor: string
  // 'skip' — no revalidate route for this product (activity/transfer)
  revalidateState: 'skip' | 'checking' | 'ok' | 'stale' | 'error'
  revalidateMessage?: string
}

// Hotel price-change acceptance (Item E) — the shape add-to-quote's hotel
// branch returns at 409/PRICE_CHANGED_REQUIRES_ACCEPTANCE, plus the staff's
// original attempted price (for the "changed from X to Y" display) and the
// quote id the resubmit needs.
export interface PriceChangeOffer {
  qid: string
  oldSellingPriceMinor: number
  newNetMinor: number
  newMarkupMinor: number
  newServiceFeeMinor: number
  newSellingPriceMinor: number
  currency: string
}

export function fmtMinor(minor: number, curr: string): string {
  return `${curr} ${(minor / 100).toLocaleString()}`
}
function supplierFor(type: LiveServiceType, offer: NormalizedOffer): BookingSupplier {
  if (type === 'flight') return 'DUFFEL'
  if (type === 'hotel' || type === 'transfer') return 'HOTELBEDS'
  return (offer as NormalizedActivityOffer).provider === 'viator' ? 'VIATOR' : 'HOTELBEDS'
}
function productTypeFor(type: LiveServiceType): BookingProductType {
  return type === 'flight' ? 'FLIGHT' : type === 'hotel' ? 'HOTEL' : type === 'activity' ? 'ACTIVITY' : 'TRANSFER'
}

export interface GeneratedQuote {
  id: string; reference: string; link: string; status: string
}

export interface UseQuoteBuilderStateParams {
  open: boolean
  onClose: () => void
  conversationId: number
  onSendMessage: (text: string) => Promise<boolean>
  /** UX-4.1C invalidation signal, threaded through so the shared
   *  client-context cache refetches after a Find/Create link — same token
   *  page.tsx already passes to ClientInfo. */
  identityRefreshToken?: number
}

export function useQuoteBuilderState({ open, onClose, conversationId, onSendMessage, identityRefreshToken = 0 }: UseQuoteBuilderStateParams) {
  const router = useRouter()
  const { insertDraft } = useComposerDraft()

  // Phase 1 (Agent A — Inbox Performance): client-context now comes from the
  // shared cache/hook (deduped with the rail/overlay ClientInfo and the
  // sibling action drawers) instead of an independent fetch here.
  const { state: ctxState, retry: retryCtx } = useClientContext(open ? conversationId : null, identityRefreshToken)
  const ctx = ctxState.phase === 'ready' ? ctxState.context : null
  const ctxError = ctxState.phase === 'error'
  const [recent, setRecent] = useState<QuoteListItem[]>([])

  const [title, setTitle] = useState('')
  const [currency, setCurrency] = useState<typeof CURRENCIES[number]>('GBP')
  const [validDays, setValidDays] = useState('14')
  const [items, setItems] = useState<DraftLineItem[]>([])
  const [itemType, setItemType] = useState<typeof ITEM_TYPES[number]>('custom')
  const [itemTitle, setItemTitle] = useState('')
  const [itemDesc, setItemDesc] = useState('')
  const [itemPrice, setItemPrice] = useState('')

  // QUOTE BUILDER V1.2 — which service is the active center-workspace/mobile
  // screen. A superset of LiveServiceType (adds visa/walz_service/manual,
  // which all route to the existing manual-item form — no new pricing/
  // business path). Purely a UI-selection concern: it does not gate or
  // replace any existing liveTab-driven behavior, which stays untouched
  // below for the four live-search types.
  const [activeService, setActiveService] = useState<ServiceKey>('flight')
  // Selecting a service in the rail/mobile nav also syncs liveTab when the
  // service is one of the four live-search types, so the untouched
  // liveTab-driven search/results logic below stays in step with which
  // workspace is actually showing. Visa/walz_service/manual don't touch
  // liveTab at all (they route to the manual-item form, not live search).
  const selectService = useCallback((key: ServiceKey) => {
    setActiveService(key)
    if (key === 'flight' || key === 'hotel' || key === 'activity' || key === 'transfer') {
      setLiveTab(key)
    }
  }, [])

  // ── UX-4.2b live search & attach state ──────────────────────────────────
  const [liveTab, setLiveTab] = useState<LiveServiceType>('flight')
  const [attachedLive, setAttachedLive] = useState<AttachedLiveItem[]>([])
  const [pending, setPending] = useState<PendingOffer | null>(null)
  const pendingSeqRef = useRef(0)
  // V1.2.1 P1 fix — every live-search call and every add-to-quote attempt
  // (confirmAddPending/acceptPriceChange) shares this one counter. Each
  // bumps it and captures its own value before doing any async work; a
  // response is only allowed to write liveError/results/transferUnavailable
  // if its captured value still matches the current counter. Production
  // symptom this closes: staff got a PRICE_MISMATCH error from a slow
  // add-to-quote attempt, then ran a fresh successful hotel search — the
  // stale error response from the earlier attempt arrived afterward and
  // overwrote the now-correct, error-free state with its own leftover
  // message. A genuinely current search/attempt is never suppressed by
  // this — only a response that a newer action has already superseded.
  const liveOpSeqRef = useRef(0)
  const [liveBusy, setLiveBusy] = useState(false)
  const [liveSearching, setLiveSearching] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)

  // flFrom/flTo are RESOLVED IATA codes only — populated exclusively via an
  // AirportDropdown selection (Item B), never from raw keystrokes. The
  // display text the staff actually types lives in flFromQuery/flToQuery.
  const [flFromQuery, setFlFromQuery] = useState('')
  const [flFrom, setFlFrom] = useState('')
  const [flFromSug, setFlFromSug] = useState<ApiAirport[]>([])
  const [flToQuery, setFlToQuery] = useState('')
  const [flTo, setFlTo] = useState('')
  const [flToSug, setFlToSug] = useState<ApiAirport[]>([])
  const [flDepart, setFlDepart] = useState('')
  const [flReturn, setFlReturn] = useState('')
  const [flTrip, setFlTrip] = useState<'one-way' | 'round-trip' | 'multi-city'>('one-way')
  const [flCabin, setFlCabin] = useState('economy')
  const [flAdults, setFlAdults] = useState(1)
  const [flightResults, setFlightResults] = useState<NormalizedFlightOffer[]>([])
  // Multi-city legs (Item C) — mirrors FlightSearchWidget.tsx's mcLegs
  // pattern (min 2 legs, cap MC_MAX_LEGS, auto-fill next leg's origin from
  // the previous leg's destination).
  const [mcLegs, setMcLegs] = useState<FlLeg[]>([emptyFlLeg(), emptyFlLeg()])
  const flFromDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  const flToDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  const mcFromDebounceRef = useRef<(ReturnType<typeof setTimeout> | undefined)[]>([])
  const mcToDebounceRef = useRef<(ReturnType<typeof setTimeout> | undefined)[]>([])

  const [htDest, setHtDest] = useState('')
  const [htIn, setHtIn] = useState('')
  const [htOut, setHtOut] = useState('')
  const [htAdults, setHtAdults] = useState(2)
  const [htRooms, setHtRooms] = useState(1)
  const [hotelResults, setHotelResults] = useState<NormalizedHotelOffer[]>([])

  const [acDest, setAcDest] = useState('')
  const [acFrom, setAcFrom] = useState('')
  const [acTo, setAcTo] = useState('')
  const [acAdults, setAcAdults] = useState(2)
  const [activityResults, setActivityResults] = useState<NormalizedActivityOffer[]>([])

  const [trPickupType, setTrPickupType] = useState('IATA')
  const [trPickupCode, setTrPickupCode] = useState('')
  const [trDropType, setTrDropType] = useState('HOTEL')
  const [trDropCode, setTrDropCode] = useState('')
  const [trDate, setTrDate] = useState('')
  const [trAdults, setTrAdults] = useState(2)
  const [transferResults, setTransferResults] = useState<NormalizedTransferOffer[]>([])
  // Item D — a calmer, distinct message (not the generic red liveError) for
  // the known TRANSFER_UNAVAILABLE case, pointing staff at the existing
  // manual line-item form as the fallback.
  const [transferUnavailable, setTransferUnavailable] = useState<string | null>(null)

  // Item E — hotel price-change acceptance (add-to-quote 409/
  // PRICE_CHANGED_REQUIRES_ACCEPTANCE). Set alongside `pending` (never
  // replacing it — the resubmit needs the same offer/rate).
  const [priceChange, setPriceChange] = useState<PriceChangeOffer | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)  // latch — blocks a second POST
  // Server-detected duplicate (a matching draft already exists for this
  // conversation) — no reusable link exists for it (only a token HASH is
  // stored), so point staff to the existing draft rather than fabricating one.
  const [duplicateOf, setDuplicateOf] = useState<{ id: string; reference: string } | null>(null)
  // Profile Completeness gate (shared layer) — set on CLIENT_PROFILE_INCOMPLETE.
  // Distinct from an identity failure: the client IS VERIFIED/LINKED here.
  const [profileGate, setProfileGate] = useState<{
    missingFields: ProfileField[]; availableFields: Partial<Record<ProfileField, string>>
    crossRecordConflicts: ProfileField[]
  } | null>(null)
  const [quote, setQuote] = useState<GeneratedQuote | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const loadSeqRef = useRef(0)
  const loadRecent = useCallback(async () => {
    const seq = ++loadSeqRef.current
    try {
      const qRes = await fetch(`/api/admin/inbox/conversations/${conversationId}/quote`)
      if (seq !== loadSeqRef.current) return
      if (qRes.ok) {
        const qData = await qRes.json()
        if (seq !== loadSeqRef.current) return
        setRecent(Array.isArray(qData?.quotes) ? qData.quotes : [])
      }
    } catch { /* recent list is supplementary — silent failure, as before */ }
  }, [conversationId])

  // resetAndOpen — single source of truth for what "reset on open" means.
  // CreateQuoteDrawer.tsx's open-effect calls this; the DOM-focus/RAF/
  // restoreRef parts of that effect stay in the drawer itself.
  const resetAndOpen = useCallback(() => {
    setTitle(''); setItems([]); setItemTitle(''); setItemDesc(''); setItemPrice('')
    setSubmitError(null); setCreated(false); setQuote(null); setSent(false); setCopied(false); setDuplicateOf(null)
    setProfileGate(null)
    setRecent([])
    setActiveService('flight')
    // UX-4.2b live-search reset
    setLiveTab('flight'); setAttachedLive([]); setPending(null); setPriceChange(null)
    setLiveBusy(false); setLiveSearching(false); setLiveError(null)
    setFlFromQuery(''); setFlFrom(''); setFlFromSug([]); setFlToQuery(''); setFlTo(''); setFlToSug([])
    setFlDepart(''); setFlReturn(''); setFlTrip('one-way'); setFlCabin('economy'); setFlAdults(1); setFlightResults([])
    setMcLegs([emptyFlLeg(), emptyFlLeg()])
    setHtDest(''); setHtIn(''); setHtOut(''); setHtAdults(2); setHtRooms(1); setHotelResults([])
    setAcDest(''); setAcFrom(''); setAcTo(''); setAcAdults(2); setActivityResults([])
    setTrPickupType('IATA'); setTrPickupCode(''); setTrDropType('HOTEL'); setTrDropCode(''); setTrDate(''); setTrAdults(2); setTransferResults([]); setTransferUnavailable(null)
    void loadRecent()
  }, [loadRecent])

  const identityOk = ctx?.resolution === 'VERIFIED' || ctx?.resolution === 'LINKED'
  const estimatedTotal = items.reduce((sum, i) => sum + (Number(i.priceMajor) || 0), 0)

  function addItem() {
    if (!itemTitle.trim() || !isValidAmountMajor(Number(itemPrice))) return
    setItems(prev => [...prev, {
      key: crypto.randomUUID(), type: itemType, title: itemTitle.trim(),
      description: itemDesc.trim(), priceMajor: itemPrice,
    }])
    setItemTitle(''); setItemDesc(''); setItemPrice('')
  }
  function removeItem(key: string) {
    setItems(prev => prev.filter(i => i.key !== key))
  }

  function applyVisaPreset(key: keyof typeof UK_VISA_FEES) {
    const fee = UK_VISA_FEES[key]
    setItemType('visa_service')
    setItemTitle(key === 'priorityService' ? 'UK Priority Visa Service' : 'UK Super Priority Visa Service')
    setItemDesc(`${fee.turnaround} — verified ${fee.lastVerified}`)
    setItemPrice(String(fee.amount))
  }

  // ── UX-4.2b — live search (Flight/Hotel/Activity/Transfer) ──────────────
  // Every call below hits an existing /api/admin/travel-search/* route —
  // no supplier client code, no parallel normalization layer.
  // Item A — no structural change needed here: the backend
  // (app/api/admin/travel-search/flights/route.ts) now always returns a
  // real `error` message (422 duffel_error / 500 error), and this
  // `data?.error ?? 'Flight search failed.'` fallback already surfaces it
  // as-is via the existing liveError banner — it never discards a
  // server-supplied message.
  //
  // Item C — one-way/round-trip and multi-city share the SAME fetch/401/
  // !res.ok call site (only the request body differs), so this stays a
  // single call site rather than two — matching how every other live-search
  // function in this file makes exactly one fetch call.
  async function searchFlightsLive() {
    const opSeq = ++liveOpSeqRef.current
    let body: Record<string, unknown>
    if (flTrip === 'multi-city') {
      const incomplete = mcLegs.some(l => !l.fromCode || !l.toCode || !l.depart)
      if (incomplete) { setLiveError('Every leg needs an origin, destination and date.'); return }
      body = {
        trip: 'multi-city',
        segments: mcLegs.map(l => ({ from: l.fromCode, to: l.toCode, date: l.depart })),
        cabin: flCabin, adults: flAdults,
      }
    } else {
      if (!flFrom.trim() || !flTo.trim() || !flDepart) { setLiveError('Select an origin, destination and departure date.'); return }
      body = { from: flFrom, to: flTo, depart: flDepart, return: flReturn, trip: flTrip, cabin: flCabin, adults: flAdults }
    }
    setLiveSearching(true); setLiveError(null)
    try {
      const res = await fetch('/api/admin/travel-search/flights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      // 401 = session expired — send staff to login instead of an unwinnable
      // retry loop (incident 2026-09-18). Same branch as every other inbox
      // fetch path (see lib/inbox/useClientContext.ts).
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (opSeq !== liveOpSeqRef.current) return // superseded by a newer search/attempt
      if (!res.ok) { setLiveError(data?.error ?? 'Flight search failed.'); return }
      setFlightResults(Array.isArray(data.offers) ? data.offers : [])
    } catch { if (opSeq === liveOpSeqRef.current) setLiveError('Flight search failed.') } finally { setLiveSearching(false) }
  }

  async function searchHotelsLive() {
    const opSeq = ++liveOpSeqRef.current
    if (!htDest.trim() || !htIn || !htOut) { setLiveError('Destination, check-in and check-out are required.'); return }
    setLiveSearching(true); setLiveError(null)
    try {
      const res = await fetch('/api/admin/travel-search/hotels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: htDest, checkIn: htIn, checkOut: htOut, adults: htAdults, rooms: htRooms }),
      })
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (opSeq !== liveOpSeqRef.current) return // superseded by a newer search/attempt
      if (!res.ok) { setLiveError(data?.error ?? 'Hotel search failed.'); return }
      setHotelResults(Array.isArray(data.offers) ? data.offers : [])
    } catch { if (opSeq === liveOpSeqRef.current) setLiveError('Hotel search failed.') } finally { setLiveSearching(false) }
  }

  async function searchActivitiesLive() {
    const opSeq = ++liveOpSeqRef.current
    if (!acDest.trim()) { setLiveError('Destination is required.'); return }
    setLiveSearching(true); setLiveError(null)
    try {
      // QA closing fix: the quote's own currency must reach the search so
      // Viator (which honors ?currency=) returns offers already priced to
      // match the quote, instead of always defaulting to GBP regardless of
      // what currency this quote actually uses — the whole point of the
      // currency-plumbing fix in app/api/admin/travel-search/activities/
      // route.ts, which was otherwise unreachable from this drawer.
      const qs = new URLSearchParams({ destination: acDest, adults: String(acAdults), currency })
      if (acFrom) qs.set('dateFrom', acFrom)
      if (acTo) qs.set('dateTo', acTo)
      const res = await fetch(`/api/admin/travel-search/activities?${qs}`)
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (opSeq !== liveOpSeqRef.current) return // superseded by a newer search/attempt
      if (!res.ok) { setLiveError(data?.error ?? 'Activity search failed.'); return }
      setActivityResults(Array.isArray(data.offers) ? data.offers : [])
    } catch { if (opSeq === liveOpSeqRef.current) setLiveError('Activity search failed.') } finally { setLiveSearching(false) }
  }

  // Item D — the try/catch already prevents any crash on a transfer-search
  // failure (a network throw lands in the catch below, same as every other
  // live-search function here). The only change is distinguishing the
  // known TRANSFER_UNAVAILABLE case (503, Hotelbeds entitlement/quota) with
  // a calmer message that points staff at the existing manual line-item
  // form, instead of the generic red liveError used for every other
  // failure.
  async function searchTransfersLive() {
    const opSeq = ++liveOpSeqRef.current
    if (!trPickupCode.trim() || !trDropCode.trim() || !trDate) { setLiveError('Pickup, dropoff and date are required.'); return }
    setLiveSearching(true); setLiveError(null); setTransferUnavailable(null)
    try {
      const res = await fetch('/api/admin/travel-search/transfers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickupType: trPickupType, pickupCode: trPickupCode, dropoffType: trDropType, dropoffCode: trDropCode, transferDate: trDate, adults: trAdults }),
      })
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (opSeq !== liveOpSeqRef.current) return // superseded by a newer search/attempt
      if (!res.ok) {
        if (data?.code === 'TRANSFER_UNAVAILABLE') {
          setTransferUnavailable('Transfer search is temporarily unavailable. You can still add a transfer manually using the line item form above.')
          return
        }
        setLiveError(data?.error ?? 'Transfer search failed.')
        return
      }
      setTransferResults(Array.isArray(data.offers) ? data.offers : [])
    } catch { if (opSeq === liveOpSeqRef.current) setLiveError('Transfer search failed.') } finally { setLiveSearching(false) }
  }

  // ── Item B — airport/IATA selection (single from/to) ────────────────────
  // Same debounced-fetch-then-AirportDropdown pattern FlightSearchWidget.tsx
  // uses (fetchAirports/onSelect) — flFrom/flTo are only ever set by
  // selecting a suggestion, never from the raw input value.
  function onFlFromChange(v: string) {
    setFlFromQuery(v); setFlFrom('')
    clearTimeout(flFromDebounceRef.current)
    flFromDebounceRef.current = setTimeout(() => { void fetchAirportSuggestions(v).then(setFlFromSug) }, 200)
  }
  function onFlToChange(v: string) {
    setFlToQuery(v); setFlTo('')
    clearTimeout(flToDebounceRef.current)
    flToDebounceRef.current = setTimeout(() => { void fetchAirportSuggestions(v).then(setFlToSug) }, 200)
  }
  function selectFlFrom(a: ApiAirport) { setFlFromQuery(`${a.city} (${a.code})`); setFlFrom(a.code); setFlFromSug([]) }
  function selectFlTo(a: ApiAirport) { setFlToQuery(`${a.city} (${a.code})`); setFlTo(a.code); setFlToSug([]) }

  // ── Item C — multi-city legs ─────────────────────────────────────────────
  // Same add/remove/auto-fill behavior as FlightSearchWidget.tsx's
  // mcLegs/addMcLeg/removeMcLeg/updateMcLeg (min 2 legs, cap MC_MAX_LEGS,
  // next leg's origin auto-filled from the previous leg's destination).
  function updateMcLeg(i: number, patch: Partial<FlLeg>) {
    setMcLegs(prev => {
      const next = [...prev]
      next[i] = { ...next[i], ...patch }
      if (patch.toCode && i < prev.length - 1) {
        next[i + 1] = { ...next[i + 1], from: next[i].to, fromCode: patch.toCode }
      }
      return next
    })
  }
  function addMcLeg() {
    if (mcLegs.length >= MC_MAX_LEGS) return
    setMcLegs(prev => {
      const last = prev[prev.length - 1]
      return [...prev, { ...emptyFlLeg(), from: last.to, fromCode: last.toCode }]
    })
  }
  function removeMcLeg(i: number) {
    if (mcLegs.length <= 2) return
    setMcLegs(prev => prev.filter((_, idx) => idx !== i))
  }
  function onMcFromChange(i: number, v: string) {
    updateMcLeg(i, { from: v, fromCode: '' })
    clearTimeout(mcFromDebounceRef.current[i])
    mcFromDebounceRef.current[i] = setTimeout(() => { void fetchAirportSuggestions(v).then(fromSug => updateMcLeg(i, { fromSug })) }, 200)
  }
  function onMcToChange(i: number, v: string) {
    updateMcLeg(i, { to: v, toCode: '' })
    clearTimeout(mcToDebounceRef.current[i])
    mcToDebounceRef.current[i] = setTimeout(() => { void fetchAirportSuggestions(v).then(toSug => updateMcLeg(i, { toSug })) }, 200)
  }
  function selectMcFrom(i: number, a: ApiAirport) { updateMcLeg(i, { from: `${a.city} (${a.code})`, fromCode: a.code, fromSug: [] }) }
  function selectMcTo(i: number, a: ApiAirport) { updateMcLeg(i, { to: `${a.city} (${a.code})`, toCode: a.code, toSug: [] }) }

  // ── UX-4.2b — pending offer (pricing + revalidation) then attach ────────
  function openPending(type: LiveServiceType, offer: NormalizedOffer, title: string, supplierMinor: number, offerCurrency: string, extra?: { rateKey: string }) {
    const seq = ++pendingSeqRef.current
    const supplier = supplierFor(type, offer)
    const productType = productTypeFor(type)
    const needsRevalidation = type === 'flight' || type === 'hotel'
    setLiveError(null)
    setPriceChange(null)
    setPending({
      token: seq, type, offer, title, supplierMinor, offerCurrency, supplier, productType, extra,
      markupPercent: defaultMarkupPercent(productType, supplier),
      serviceFeeMajor: '0',
      revalidateState: needsRevalidation ? 'checking' : 'skip',
    })
    if (type === 'flight') void revalidateFlight(seq, (offer as NormalizedFlightOffer).providerOfferId)
    else if (type === 'hotel') void revalidateHotel(seq, extra?.rateKey ?? '')
  }

  async function revalidateFlight(seq: number, offerId: string) {
    try {
      const res = await fetch('/api/admin/travel-search/flights/revalidate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offerId }),
      })
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (seq !== pendingSeqRef.current) return
      if (!res.ok || data?.available === false) {
        setPending(prev => prev && prev.token === seq
          ? { ...prev, revalidateState: 'stale', revalidateMessage: data?.message ?? 'This fare has changed. Please re-search.' }
          : prev)
        return
      }
      setPending(prev => prev && prev.token === seq
        ? { ...prev, revalidateState: 'ok', supplierMinor: data?.totalAmountMinor ?? prev.supplierMinor }
        : prev)
    } catch {
      if (seq !== pendingSeqRef.current) return
      setPending(prev => prev && prev.token === seq ? { ...prev, revalidateState: 'error', revalidateMessage: 'Could not verify this fare. Try again.' } : prev)
    }
  }

  async function revalidateHotel(seq: number, rateKey: string) {
    if (!rateKey) {
      setPending(prev => prev && prev.token === seq ? { ...prev, revalidateState: 'error', revalidateMessage: 'No rate selected.' } : prev)
      return
    }
    try {
      const res = await fetch('/api/admin/travel-search/hotels/revalidate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rateKeys: [rateKey] }),
      })
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (seq !== pendingSeqRef.current) return
      const match = Array.isArray(data?.rates) ? data.rates.find((r: { rateKey: string }) => r.rateKey === rateKey) : null
      if (!res.ok || data?.available === false || !match) {
        setPending(prev => prev && prev.token === seq
          ? { ...prev, revalidateState: 'stale', revalidateMessage: data?.message ?? 'This rate has changed. Please re-search.' }
          : prev)
        return
      }
      setPending(prev => prev && prev.token === seq ? { ...prev, revalidateState: 'ok', supplierMinor: match.netMinor ?? prev.supplierMinor } : prev)
    } catch {
      if (seq !== pendingSeqRef.current) return
      setPending(prev => prev && prev.token === seq ? { ...prev, revalidateState: 'error', revalidateMessage: 'Could not verify this rate. Try again.' } : prev)
    }
  }

  function cancelPending() { setPending(null); setPriceChange(null) }

  function buildAttachPayload(qid: string, p: PendingOffer, costMinor: number, markupMinor: number, serviceFeeMinor: number, sellingPriceMinor: number): AddToQuotePayload {
    const base = { quoteId: qid, costMinor, markupMinor, serviceFeeMinor, sellingPriceMinor, currency }
    if (p.type === 'flight') return { type: 'flight', offer: p.offer as NormalizedFlightOffer, ...base }
    if (p.type === 'hotel') return { type: 'hotel', offer: p.offer as NormalizedHotelOffer, selectedRateKey: p.extra?.rateKey ?? '', ...base }
    if (p.type === 'activity') return { type: 'activity', offer: p.offer as NormalizedActivityOffer, ...base }
    return { type: 'transfer', offer: p.offer as NormalizedTransferOffer, ...base }
  }

  // Currency safety (client-side UX check — add-to-quote also enforces this
  // server-side as defense in depth): a Quote has one currency; an offer
  // priced differently must never be silently summed in.
  const pendingCurrencyMismatch = pending ? pending.offerCurrency.toUpperCase() !== currency.toUpperCase() : false

  // Item E — shared by confirmAddPending (first attempt) and
  // acceptPriceChange (the resubmit with staff-accepted new pricing) so
  // there is exactly ONE /add-to-quote fetch call site (and one 401 check)
  // in this file, not two.
  async function postAddToQuote(payload: AddToQuotePayload): Promise<{ res: Response; data: Record<string, unknown> } | undefined> {
    const res = await fetch('/api/admin/travel-search/add-to-quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.status === 401) { router.push('/admin/login'); return }
    const data = await res.json().catch(() => ({}))
    return { res, data }
  }

  // V1.3 — Remove / Edit-pricing for an already-attached live-search item.
  // Closes the known V1.1/V1.2 limitation (attachedLive items were
  // permanently read-only). Both call the new item-level endpoint
  // (app/api/admin/quotes/[id]/items/[itemId]/route.ts), reusing the exact
  // 401-redirect / liveBusy / liveError conventions every other live-search
  // function in this file already follows. `attachedLive.itemId` is the
  // server-assigned QuoteItem.id captured at attach time in
  // confirmAddPending/acceptPriceChange above.
  async function removeAttachedItem(key: string) {
    if (liveBusy || !quote) return
    const target = attachedLive.find(i => i.key === key)
    if (!target?.itemId) return
    setLiveBusy(true); setLiveError(null)
    try {
      const res = await fetch(`/api/admin/quotes/${quote.id}/items/${target.itemId}`, { method: 'DELETE' })
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLiveError(typeof data?.error === 'string' ? data.error : 'Could not remove this item.'); return }
      setAttachedLive(prev => prev.filter(i => i.key !== key))
    } catch {
      setLiveError('Could not remove this item.')
    } finally {
      setLiveBusy(false)
    }
  }

  async function updateAttachedItemPricing(key: string, markupMinor: number, serviceFeeMinor: number) {
    if (liveBusy || !quote) return
    const target = attachedLive.find(i => i.key === key)
    if (!target?.itemId) return
    setLiveBusy(true); setLiveError(null)
    try {
      const res = await fetch(`/api/admin/quotes/${quote.id}/items/${target.itemId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markupMinor, serviceFeeMinor }),
      })
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLiveError(typeof data?.error === 'string' ? data.error : 'Could not update this item\'s pricing.'); return }
      const updated = data?.item as { markupMinor?: number; serviceFeeMinor?: number; sellingPriceMinor?: number } | undefined
      setAttachedLive(prev => prev.map(i => i.key === key
        ? {
            ...i,
            markupMinor: updated?.markupMinor ?? markupMinor,
            serviceFeeMinor: updated?.serviceFeeMinor ?? serviceFeeMinor,
            sellingPriceMinor: updated?.sellingPriceMinor ?? i.sellingPriceMinor,
          }
        : i))
    } catch {
      setLiveError('Could not update this item\'s pricing.')
    } finally {
      setLiveBusy(false)
    }
  }

  // V1.3 — atomic draft currency recalculation. The ONLY sanctioned way to
  // change currency once items exist (the generic quote PATCH's currency-
  // integrity guard blocks that path outright). Calls the dedicated
  // recalculate endpoint, which converts every item server-side in one
  // transaction, then refreshes attachedLive from the response's
  // authoritative figures — matching each entry back to its server row by
  // itemId so client-side `key` identity (and therefore any expanded/
  // selected UI state keyed on it) survives the refresh.
  async function recalculateCurrency(targetCurrency: typeof CURRENCIES[number]) {
    if (!quote || liveBusy) return
    setLiveBusy(true); setLiveError(null)
    try {
      const res = await fetch(`/api/admin/quotes/${quote.id}/recalculate-currency`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCurrency }),
      })
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLiveError(typeof data?.error === 'string' ? data.error : 'Could not recalculate the quote currency.'); return }
      setCurrency(targetCurrency)
      if (Array.isArray(data.items)) {
        const byId = new Map((data.items as Array<Record<string, unknown>>).map(i => [String(i.id), i]))
        setAttachedLive(prev => prev.map(item => {
          const fresh = byId.get(item.itemId)
          if (!fresh) return item
          return {
            ...item,
            costMinor: Number(fresh.costMinor), markupMinor: Number(fresh.markupMinor),
            serviceFeeMinor: Number(fresh.serviceFeeMinor), sellingPriceMinor: Number(fresh.sellingPriceMinor),
            currency: String(fresh.currency),
          }
        }))
      }
    } catch {
      setLiveError('Could not recalculate the quote currency.')
    } finally {
      setLiveBusy(false)
    }
  }

  // V1.3 — Create Revision. A pure database operation (never sends
  // anything to the client) that returns the new revision's id/reference
  // on success. The Quote Builder's own state stays pointed at THIS quote —
  // matching the existing `duplicate` action's UI convention (quotes/[id]/
  // page.tsx's handleDuplicate opens the new quote in a separate tab/
  // window rather than hot-swapping the current editor's state), staff
  // review/continue the new revision by opening it, not by staying inside
  // this same drawer instance.
  async function createRevision(): Promise<{ id: string; reference: string } | null> {
    if (!quote || liveBusy) return null
    setLiveBusy(true); setLiveError(null)
    try {
      const res = await fetch(`/api/admin/quotes/${quote.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_revision' }),
      })
      if (res.status === 401) { router.push('/admin/login'); return null }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLiveError(typeof data?.error === 'string' ? data.error : 'Could not create a revision.'); return null }
      return (data?.quote as { id: string; reference: string } | undefined) ?? null
    } catch {
      setLiveError('Could not create a revision.')
      return null
    } finally {
      setLiveBusy(false)
    }
  }

  async function confirmAddPending() {
    if (!pending || liveBusy) return
    const opSeq = ++liveOpSeqRef.current
    if (pendingCurrencyMismatch) {
      setLiveError(`This offer is priced in ${pending.offerCurrency}; the quote is in ${currency}. Change the quote currency above or search again in ${currency}.`)
      return
    }
    if ((pending.type === 'flight' || pending.type === 'hotel') && pending.revalidateState !== 'ok') return
    if (!title.trim()) { setLiveError('Enter a quote title above before adding items.'); return }
    setLiveBusy(true); setLiveError(null)
    try {
      let qid = quote?.id ?? null
      if (!qid) {
        const createdQuote = await handleCreate({ allowEmptyItems: true })
        if (!createdQuote) return
        qid = createdQuote.id
      }
      const pricing = calculateBookingPrice({
        productType: pending.productType, supplier: pending.supplier,
        netAmount: pending.supplierMinor / 100, currency: pending.offerCurrency,
        markupPercent: pending.markupPercent, serviceFee: Number(pending.serviceFeeMajor) || 0,
      })
      const costMinor = Math.round(pricing.supplierCost * 100)
      const markupMinor = Math.round(pricing.markupAmount * 100)
      const serviceFeeMinor = Math.round(pricing.serviceFee * 100)
      const sellingPriceMinor = Math.round(pricing.sellingPrice * 100)
      const result = await postAddToQuote(buildAttachPayload(qid, pending, costMinor, markupMinor, serviceFeeMinor, sellingPriceMinor))
      if (!result) return
      const { res, data } = result
      if (!res.ok) {
        // Item E — a genuine hotel price change beyond the server's 1%
        // tolerance band (409) is not a flat rejection: hand staff the new
        // price and an explicit accept action rather than auto-accepting
        // (business requirement — a real price change always needs a human
        // click). `pending` is intentionally left set so the resubmit below
        // has the same offer/rate to attach.
        if (res.status === 409 && data?.code === 'PRICE_CHANGED_REQUIRES_ACCEPTANCE') {
          setPriceChange({
            qid, oldSellingPriceMinor: sellingPriceMinor,
            newNetMinor: Number(data.newNetMinor), newMarkupMinor: Number(data.newMarkupMinor),
            newServiceFeeMinor: Number(data.newServiceFeeMinor), newSellingPriceMinor: Number(data.newSellingPriceMinor),
            currency: typeof data.currency === 'string' ? data.currency : currency,
          })
          return
        }
        if (opSeq === liveOpSeqRef.current) {
          setLiveError(typeof data?.error === 'string' ? data.error : 'Could not add this item to the quote.')
        }
        return
      }
      setAttachedLive(prev => [...prev, {
        key: crypto.randomUUID(), type: pending.type, title: pending.title,
        costMinor, markupMinor, serviceFeeMinor, sellingPriceMinor, currency,
        itemId: String((data?.item as { id?: unknown } | undefined)?.id ?? ''),
      }])
      setPending(null)
    } catch {
      if (opSeq === liveOpSeqRef.current) setLiveError('Could not add this item to the quote.')
    } finally {
      setLiveBusy(false)
    }
  }

  function cancelPriceChange() { setPriceChange(null) }

  // Item E — explicit staff acceptance of a genuine price change. Resubmits
  // the SAME /add-to-quote payload (same offer/rate) but with
  // costMinor/markupMinor/serviceFeeMinor/sellingPriceMinor replaced by the
  // server's newNetMinor/newMarkupMinor/newServiceFeeMinor/
  // newSellingPriceMinor — this lands within tolerance of a fresh check and
  // succeeds normally. Never called automatically; only from the explicit
  // "Accept new price" button below.
  async function acceptPriceChange() {
    if (!priceChange || !pending || liveBusy) return
    const opSeq = ++liveOpSeqRef.current
    setLiveBusy(true); setLiveError(null)
    try {
      const { qid, newNetMinor, newMarkupMinor, newServiceFeeMinor, newSellingPriceMinor, currency: newCurrency } = priceChange
      const result = await postAddToQuote(buildAttachPayload(qid, pending, newNetMinor, newMarkupMinor, newServiceFeeMinor, newSellingPriceMinor))
      if (!result) return
      const { res, data } = result
      if (!res.ok) {
        if (opSeq === liveOpSeqRef.current) {
          setLiveError(typeof data?.error === 'string' ? data.error : 'Could not add this item to the quote.')
        }
        return
      }
      setAttachedLive(prev => [...prev, {
        key: crypto.randomUUID(), type: pending.type, title: pending.title,
        costMinor: newNetMinor, markupMinor: newMarkupMinor, serviceFeeMinor: newServiceFeeMinor,
        sellingPriceMinor: newSellingPriceMinor, currency: newCurrency,
        itemId: String((data?.item as { id?: unknown } | undefined)?.id ?? ''),
      }])
      setPending(null)
      setPriceChange(null)
    } catch {
      if (opSeq === liveOpSeqRef.current) setLiveError('Could not add this item to the quote.')
    } finally {
      setLiveBusy(false)
    }
  }

  async function handleCreate(opts?: { allowEmptyItems?: boolean }): Promise<GeneratedQuote | null> {
    if (submitting || created) return null
    if (!title.trim()) { setSubmitError('Enter a quote title.'); return null }
    if (items.length === 0 && !opts?.allowEmptyItems) { setSubmitError('Add at least one line item.'); return null }
    setSubmitting(true)
    setSubmitError(null)
    setProfileGate(null)
    try {
      const res = await fetch('/api/admin/quotes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId, source: 'inbox_action_centre',
          title: title.trim(), currency, validDays: Number(validDays) || 14,
          items: items.map((i, idx) => {
            const minor = Math.round(Number(i.priceMajor) * 100)
            return {
              type: i.type, title: i.title, description: i.description || null,
              sortOrder: idx, sourceType: 'manual',
              costMinor: minor, markupMinor: 0, serviceFeeMinor: 0, sellingPriceMinor: minor,
              currency, clientVisible: true, showPriceToClient: true, metadata: {},
            }
          }),
        }),
      })
      // 401 = session expired — send staff to login instead of an unwinnable
      // retry loop (incident 2026-09-18). Same branch as every other inbox
      // fetch path (see lib/inbox/useClientContext.ts).
      if (res.status === 401) { router.push('/admin/login'); return null }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.code === 'DUPLICATE_DRAFT' && data?.existing) {
          setDuplicateOf({ id: data.existing.id, reference: data.existing.reference })
          setCreated(true)   // still latch — this attempt is resolved, not retryable as-is
          return null
        }
        // Profile incomplete is not a retryable creation failure — show the
        // completion gate instead, preserving the draft (title/items/etc.)
        // already entered below.
        if (data?.code === 'CLIENT_PROFILE_INCOMPLETE') {
          setProfileGate({
            missingFields: Array.isArray(data?.missingFields) ? data.missingFields : [],
            availableFields: data?.availableFields ?? {},
            crossRecordConflicts: Array.isArray(data?.crossRecordConflicts)
              ? data.crossRecordConflicts.map((c: { field: ProfileField }) => c.field) : [],
          })
          return null
        }
        setSubmitError(data?.error ?? 'The quote could not be created. Retry.')
        return null
      }
      const createdQuote: GeneratedQuote = { id: data.quote.id, reference: data.quote.reference, link: data.quote.link, status: data.quote.status }
      setQuote(createdQuote)
      setCreated(true)
      return createdQuote
    } catch {
      setSubmitError('The quote could not be created. Retry.')
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFinalize() {
    if (!quote || finalizing) return
    setFinalizing(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/admin/quotes/${quote.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', suppressNotifications: true }),
      })
      // 401 = session expired — send staff to login instead of an unwinnable
      // retry loop (incident 2026-09-18). Same branch as every other inbox
      // fetch path (see lib/inbox/useClientContext.ts).
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(data?.error ?? 'Could not finalize the quote. Retry.')
        return
      }
      setQuote(prev => prev ? { ...prev, link: data.quote.link, status: data.quote.status } : prev)
    } catch {
      setSubmitError('Could not finalize the quote. Retry.')
    } finally {
      setFinalizing(false)
    }
  }

  function buildQuoteMessage(): string {
    return `Hello! Here is your travel quote — ${title || 'Walz Travels proposal'} (Ref: ${quote?.reference}):\n${quote?.link}\n\nPlease review at your convenience — happy to adjust anything.`
  }

  async function handleCopy() {
    if (!quote) return
    try { await navigator.clipboard.writeText(quote.link); setCopied(true) } catch { setCopied(false) }
  }
  function handleInsert() {
    if (!quote) return
    insertDraft(buildQuoteMessage())   // fills the composer — DOES NOT SEND
    onClose()
  }
  async function handleSendToClient() {
    if (!quote || sending || sent) return
    setSending(true)
    setSubmitError(null)
    try {
      const ok = await onSendMessage(buildQuoteMessage())
      if (ok) setSent(true)
      else setSubmitError('The message could not be sent. Try again.')
    } catch {
      setSubmitError('The message could not be sent. Try again.')
    } finally {
      setSending(false)
    }
  }

  const isFinalized = quote && quote.status !== 'draft'

  return {
    // client context
    ctx, ctxError, retryCtx, identityOk,
    // recent quotes
    recent, loadRecent,
    // manual line items
    title, setTitle, currency, setCurrency, validDays, setValidDays,
    items, itemType, setItemType, itemTitle, setItemTitle, itemDesc, setItemDesc, itemPrice, setItemPrice,
    estimatedTotal, addItem, removeItem, applyVisaPreset,
    // QUOTE BUILDER V1.2 — services rail / active workspace selection
    activeService, setActiveService, selectService,
    // UX-4.2b live search & attach
    liveTab, setLiveTab, attachedLive, pending, setPending, liveBusy, liveSearching, liveError,
    // flight
    flFromQuery, flFrom, flFromSug, flToQuery, flTo, flToSug,
    flDepart, setFlDepart, flReturn, setFlReturn, flTrip, setFlTrip, flCabin, setFlCabin, flAdults, setFlAdults,
    flightResults, mcLegs,
    onFlFromChange, onFlToChange, selectFlFrom, selectFlTo,
    updateMcLeg, addMcLeg, removeMcLeg, onMcFromChange, onMcToChange, selectMcFrom, selectMcTo,
    searchFlightsLive,
    // hotel
    htDest, setHtDest, htIn, setHtIn, htOut, setHtOut, htAdults, setHtAdults, htRooms, setHtRooms,
    hotelResults, searchHotelsLive,
    // activity
    acDest, setAcDest, acFrom, setAcFrom, acTo, setAcTo, acAdults, setAcAdults,
    activityResults, searchActivitiesLive,
    // transfer
    trPickupType, setTrPickupType, trPickupCode, setTrPickupCode, trDropType, setTrDropType, trDropCode, setTrDropCode,
    trDate, setTrDate, trAdults, setTrAdults, transferResults, searchTransfersLive, transferUnavailable, setTransferUnavailable,
    // pending offer pricing + revalidation + attach
    priceChange, openPending, revalidateFlight, revalidateHotel, cancelPending,
    buildAttachPayload, pendingCurrencyMismatch, postAddToQuote, confirmAddPending, cancelPriceChange, acceptPriceChange,
    removeAttachedItem, updateAttachedItemPricing, recalculateCurrency, createRevision,
    // quote creation / finalize / share
    submitting, submitError, created, duplicateOf, profileGate, setProfileGate, quote, finalizing, copied, sending, sent,
    handleCreate, handleFinalize, buildQuoteMessage, handleCopy, handleInsert, handleSendToClient,
    isFinalized,
    // reset — CreateQuoteDrawer.tsx's open-effect calls this
    resetAndOpen,
  }
}

// Shared prop type for every new QUOTE BUILDER V1.2 presentational
// component (desktop/tablet/mobile workspaces, result cards, select-&-price
// panel, quote summary/basket) — one hook call in CreateQuoteDrawer.tsx,
// its return threaded down as a single prop everywhere else.
export type QuoteBuilderState = ReturnType<typeof useQuoteBuilderState>

