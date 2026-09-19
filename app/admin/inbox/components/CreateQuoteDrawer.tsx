'use client'

// CreateQuoteDrawer — INBOX UX-4.2 (Client Action Centre).
//
// Same interaction language as PaymentRequestDrawer: right sheet, scrim +
// Esc close, focus in on open / restore on close, Tab trapped inside
// (:disabled-aware — fieldset-inherited disabling is filtered correctly),
// safe-area padding, motion-safe slide, stale-response guard on load.
//
// SCOPE (Phase 2 / UX-4.2b — Quote/Supplier Integration): manual line
// items PLUS live Flight/Hotel/Activity/Transfer search, reusing the
// existing /api/admin/travel-search/* infrastructure end to end (search,
// revalidate, add-to-quote) — the same routes the full /admin/travel-search
// builder page already uses. No new supplier calls or pricing engines are
// introduced here. A draft Quote is created on the FIRST item added (manual
// or live-search) so live-search offers — which need an existing quoteId —
// can be attached incrementally via add-to-quote, matching how the full
// builder page stages a quote. Complex quotes still go through the full
// /admin/quotes/new wizard or the quote editor — this drawer's "Open in
// quote editor" link hands off there for anything beyond initial staging.
//
// Commercial discipline mirrors Request Payment exactly:
//  - creation is SELECT -> PREPARE -> REVIEW -> GENERATED (draft) -> SHARE;
//  - 'Create quote' NEVER sends anything — it creates a draft only;
//  - 'Finalize for client' mints the real share token (PATCH action:'send',
//    suppressNotifications:true) — still does not message the client;
//  - Copy link / Insert into Reply (no send) / Send to client (explicit,
//    existing composer path) only after finalizing;
//  - one submission latch — a second click after success can never re-POST.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Copy, MessageSquarePlus, Send, RefreshCw, Trash2, ExternalLink,
  Plane, Hotel, Activity, Car, AlertTriangle,
} from 'lucide-react'
import { useComposerDraft } from '@/app/admin/inbox/ComposerDraftContext'
import { isValidAmountMajor } from '@/lib/action-centre/constants'
import type { ProfileField } from '@/lib/inbox/client-profile'
import { CompleteClientProfile } from '@/app/admin/inbox/components/CompleteClientProfile'
import { useClientContext } from '@/lib/inbox/useClientContext'
import { ActionDrawerShell } from '@/app/admin/inbox/components/ActionDrawerShell'
import { cycleTabFocus, captureFocusRestoreTarget, queryDrawerFocusables } from '@/app/admin/inbox/components/drawerFocusTrap'
import type {
  NormalizedFlightOffer, NormalizedHotelOffer,
  NormalizedActivityOffer, NormalizedTransferOffer, AddToQuotePayload,
} from '@/lib/travel-search/types'
import { calculateBookingPrice, defaultMarkupPercent, type BookingProductType, type BookingSupplier } from '@/lib/pricing/booking-price'
import { UK_VISA_FEES } from '@/lib/config/visa-fees'

interface QuoteListItem {
  id: string; reference: string; title: string; status: string
  totalMinor: number; currency: string; createdAt: string
}

interface DraftLineItem {
  key: string; type: string; title: string; description: string; priceMajor: string
}

const ITEM_TYPES = ['flight', 'hotel', 'activity', 'transfer', 'tour', 'package', 'visa_service', 'custom'] as const
const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'NGN'] as const

const STATUS_GLYPH: Record<string, string> = {
  draft: 'Draft', sent: '⏳ Sent', viewed: '👁 Viewed', accepted: '✓ Accepted',
  declined: '✗ Declined', changes_requested: 'Changes requested', expired: 'Expired',
  converted: 'Converted', cancelled: 'Cancelled', archived: 'Archived',
}
function statusLabel(s: string): string { return STATUS_GLYPH[s] ?? s }

// ── UX-4.2b live search & attach — types/helpers (module scope) ──────────
// Every search/attach call goes through the existing
// /api/admin/travel-search/* routes; nothing here talks to a supplier
// directly or re-derives offer storage.
type LiveServiceType = 'flight' | 'hotel' | 'activity' | 'transfer'
type NormalizedOffer =
  | NormalizedFlightOffer | NormalizedHotelOffer | NormalizedActivityOffer | NormalizedTransferOffer

const LIVE_TABS: { id: LiveServiceType; label: string }[] = [
  { id: 'flight', label: 'Flight' },
  { id: 'hotel', label: 'Hotel' },
  { id: 'activity', label: 'Activity' },
  { id: 'transfer', label: 'Transfer' },
]

interface AttachedLiveItem {
  key: string; type: LiveServiceType; title: string
  costMinor: number; markupMinor: number; serviceFeeMinor: number; sellingPriceMinor: number; currency: string
}

interface PendingOffer {
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

function fmtMinor(minor: number, curr: string): string {
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

interface GeneratedQuote {
  id: string; reference: string; link: string; status: string
}

export function CreateQuoteDrawer({ open, onClose, conversationId, onSendMessage, identityRefreshToken = 0 }: CreateQuoteDrawerProps) {
  const router = useRouter()
  const { insertDraft } = useComposerDraft()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [entered, setEntered] = useState(false)

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

  // ── UX-4.2b live search & attach state ──────────────────────────────────
  const [liveTab, setLiveTab] = useState<LiveServiceType>('flight')
  const [attachedLive, setAttachedLive] = useState<AttachedLiveItem[]>([])
  const [pending, setPending] = useState<PendingOffer | null>(null)
  const pendingSeqRef = useRef(0)
  const [liveBusy, setLiveBusy] = useState(false)
  const [liveSearching, setLiveSearching] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)

  const [flFrom, setFlFrom] = useState('')
  const [flTo, setFlTo] = useState('')
  const [flDepart, setFlDepart] = useState('')
  const [flReturn, setFlReturn] = useState('')
  const [flTrip, setFlTrip] = useState<'one-way' | 'round-trip'>('one-way')
  const [flCabin, setFlCabin] = useState('economy')
  const [flAdults, setFlAdults] = useState(1)
  const [flightResults, setFlightResults] = useState<NormalizedFlightOffer[]>([])

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

  useEffect(() => {
    if (!open) { setEntered(false); return }
    setTitle(''); setItems([]); setItemTitle(''); setItemDesc(''); setItemPrice('')
    setSubmitError(null); setCreated(false); setQuote(null); setSent(false); setCopied(false); setDuplicateOf(null)
    setProfileGate(null)
    setRecent([])
    // UX-4.2b live-search reset
    setLiveTab('flight'); setAttachedLive([]); setPending(null)
    setLiveBusy(false); setLiveSearching(false); setLiveError(null)
    setFlFrom(''); setFlTo(''); setFlDepart(''); setFlReturn(''); setFlTrip('one-way'); setFlCabin('economy'); setFlAdults(1); setFlightResults([])
    setHtDest(''); setHtIn(''); setHtOut(''); setHtAdults(2); setHtRooms(1); setHotelResults([])
    setAcDest(''); setAcFrom(''); setAcTo(''); setAcAdults(2); setActivityResults([])
    setTrPickupType('IATA'); setTrPickupCode(''); setTrDropType('HOTEL'); setTrDropCode(''); setTrDate(''); setTrAdults(2); setTransferResults([])
    void loadRecent()
    restoreRef.current = captureFocusRestoreTarget()
    closeRef.current?.focus()
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => {
      cancelAnimationFrame(raf)
      restoreRef.current?.focus()
    }
  }, [open, loadRecent])

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
  async function searchFlightsLive() {
    if (!flFrom.trim() || !flTo.trim() || !flDepart) { setLiveError('Origin, destination and departure date are required.'); return }
    setLiveSearching(true); setLiveError(null)
    try {
      const res = await fetch('/api/admin/travel-search/flights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: flFrom, to: flTo, depart: flDepart, return: flReturn, trip: flTrip, cabin: flCabin, adults: flAdults }),
      })
      // 401 = session expired — send staff to login instead of an unwinnable
      // retry loop (incident 2026-09-18). Same branch as every other inbox
      // fetch path (see lib/inbox/useClientContext.ts).
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLiveError(data?.error ?? 'Flight search failed.'); return }
      setFlightResults(Array.isArray(data.offers) ? data.offers : [])
    } catch { setLiveError('Flight search failed.') } finally { setLiveSearching(false) }
  }

  async function searchHotelsLive() {
    if (!htDest.trim() || !htIn || !htOut) { setLiveError('Destination, check-in and check-out are required.'); return }
    setLiveSearching(true); setLiveError(null)
    try {
      const res = await fetch('/api/admin/travel-search/hotels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: htDest, checkIn: htIn, checkOut: htOut, adults: htAdults, rooms: htRooms }),
      })
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLiveError(data?.error ?? 'Hotel search failed.'); return }
      setHotelResults(Array.isArray(data.offers) ? data.offers : [])
    } catch { setLiveError('Hotel search failed.') } finally { setLiveSearching(false) }
  }

  async function searchActivitiesLive() {
    if (!acDest.trim()) { setLiveError('Destination is required.'); return }
    setLiveSearching(true); setLiveError(null)
    try {
      const qs = new URLSearchParams({ destination: acDest, adults: String(acAdults) })
      if (acFrom) qs.set('dateFrom', acFrom)
      if (acTo) qs.set('dateTo', acTo)
      const res = await fetch(`/api/admin/travel-search/activities?${qs}`)
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLiveError(data?.error ?? 'Activity search failed.'); return }
      setActivityResults(Array.isArray(data.offers) ? data.offers : [])
    } catch { setLiveError('Activity search failed.') } finally { setLiveSearching(false) }
  }

  async function searchTransfersLive() {
    if (!trPickupCode.trim() || !trDropCode.trim() || !trDate) { setLiveError('Pickup, dropoff and date are required.'); return }
    setLiveSearching(true); setLiveError(null)
    try {
      const res = await fetch('/api/admin/travel-search/transfers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickupType: trPickupType, pickupCode: trPickupCode, dropoffType: trDropType, dropoffCode: trDropCode, transferDate: trDate, adults: trAdults }),
      })
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLiveError(data?.error ?? 'Transfer search failed.'); return }
      setTransferResults(Array.isArray(data.offers) ? data.offers : [])
    } catch { setLiveError('Transfer search failed.') } finally { setLiveSearching(false) }
  }

  // ── UX-4.2b — pending offer (pricing + revalidation) then attach ────────
  function openPending(type: LiveServiceType, offer: NormalizedOffer, title: string, supplierMinor: number, offerCurrency: string, extra?: { rateKey: string }) {
    const seq = ++pendingSeqRef.current
    const supplier = supplierFor(type, offer)
    const productType = productTypeFor(type)
    const needsRevalidation = type === 'flight' || type === 'hotel'
    setLiveError(null)
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

  function cancelPending() { setPending(null) }

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

  async function confirmAddPending() {
    if (!pending || liveBusy) return
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
      const res = await fetch('/api/admin/travel-search/add-to-quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAttachPayload(qid, pending, costMinor, markupMinor, serviceFeeMinor, sellingPriceMinor)),
      })
      if (res.status === 401) { router.push('/admin/login'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLiveError(data?.error ?? 'Could not add this item to the quote.'); return }
      setAttachedLive(prev => [...prev, {
        key: crypto.randomUUID(), type: pending.type, title: pending.title,
        costMinor, markupMinor, serviceFeeMinor, sellingPriceMinor, currency,
      }])
      setPending(null)
    } catch {
      setLiveError('Could not add this item to the quote.')
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

  const inputCls = 'w-full min-h-[44px] px-3 py-2 rounded-lg border border-walz-border bg-white text-sm text-walz-deep-navy focus:outline-none focus:ring-2 focus:ring-walz-gold/60'
  const labelCls = 'block text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-1'
  const isFinalized = quote && quote.status !== 'draft'

  return (
    <ActionDrawerShell
      panelRef={panelRef}
      closeRef={closeRef}
      entered={entered}
      onClose={onClose}
      title="Create quote"
      role="dialog"
      panelTransitionClassName="motion-safe:transition-transform motion-safe:duration-200"
      panelSafeAreaStyle={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
          {ctxError ? (
            <div className="space-y-2">
              <p className="text-xs text-walz-muted-strong">Could not load client context.</p>
              <button onClick={() => { retryCtx(); void loadRecent() }} className="min-h-[44px] px-4 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                Retry
              </button>
            </div>
          ) : !ctx ? (
            <>
              <span className="sr-only" role="status">Loading client</span>
              <div className="space-y-2 motion-safe:animate-pulse" aria-hidden="true">
                <div className="h-4 w-40 rounded bg-walz-navy/10" />
                <div className="h-3 w-28 rounded bg-walz-navy/10" />
              </div>
            </>
          ) : !identityOk ? (
            <div className="rounded-xl border border-walz-border bg-walz-off-white p-3">
              <p className="text-xs font-bold text-walz-deep-navy">Client identity required</p>
              <p className="text-xs text-walz-muted-strong mt-1">
                Verify the client through the Application Lookup before creating a quote.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-walz-border bg-walz-off-white p-3">
              <p className={labelCls}>Client</p>
              <p className="text-sm font-semibold text-walz-deep-navy">{ctx.contact?.name ?? 'Client on file'}</p>
            </div>
          )}

          {duplicateOf ? (
            <div className="space-y-2">
              <div className="rounded-xl border border-walz-border bg-walz-off-white p-3">
                <p className="text-xs font-bold text-walz-deep-navy">A matching draft already exists</p>
                <p className="text-xs text-walz-muted-strong mt-1">
                  {duplicateOf.reference} was created moments ago for this conversation with the same title.
                </p>
              </div>
              <a href={`/admin/quotes/${duplicateOf.id}`} target="_blank" rel="noreferrer"
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                Open in quote editor <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : quote ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-walz-border p-3 space-y-1">
                <p className={labelCls}>{isFinalized ? 'Quote ready to share' : 'Draft created'}</p>
                <p className="text-sm font-semibold text-walz-deep-navy">{quote.reference}</p>
                <p className="text-xs text-walz-navy break-all">{quote.link}</p>
                <p className="text-xs text-walz-muted-strong">Status: {statusLabel(quote.status)}</p>
              </div>
              {!isFinalized ? (
                <div className="space-y-2">
                  <p className="text-xs text-walz-muted-strong">
                    Preview link only — finalize to issue the client-facing share link.
                  </p>
                  <a href={quote.link} target="_blank" rel="noreferrer" className="text-xs text-walz-navy underline inline-flex items-center gap-1">
                    Preview (read-only) <ExternalLink className="w-3 h-3" />
                  </a>
                  {submitError && <p role="alert" className="text-xs text-red-700">{submitError}</p>}
                  <button
                    onClick={() => void handleFinalize()}
                    disabled={finalizing}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-60"
                  >
                    {finalizing ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Finalizing…</>) : 'Finalize for client'}
                  </button>
                  <p className="text-[10px] text-walz-muted-strong">
                    Finalizing issues a new link; earlier links stop working. Nothing is sent to the client yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-walz-muted-strong">
                    Nothing has been sent to the client yet. Choose how to share it:
                  </p>
                  {submitError && <p role="alert" className="text-xs text-red-700">{submitError}</p>}
                  <button onClick={() => void handleCopy()} className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                    <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <button onClick={handleInsert} className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                    <MessageSquarePlus className="w-3.5 h-3.5" /> Insert into reply (does not send)
                  </button>
                  <button
                    onClick={() => void handleSendToClient()}
                    disabled={sending || sent}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5" /> {sent ? 'Sent to client' : sending ? 'Sending…' : 'Send to client'}
                  </button>
                  <a href={`/admin/quotes/${quote.id}`} target="_blank" rel="noreferrer" className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg text-walz-navy text-xs font-semibold hover:underline">
                    Open in quote editor <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ) : profileGate ? (
            <CompleteClientProfile
              conversationId={conversationId}
              missingFields={profileGate.missingFields}
              availableFields={profileGate.availableFields}
              crossRecordConflicts={profileGate.crossRecordConflicts}
              onComplete={() => { setProfileGate(null); retryCtx(); void loadRecent() }}
            />
          ) : (
            <fieldset disabled={!identityOk || submitting} className="space-y-3 disabled:opacity-60">
              <div>
                <label htmlFor="q-title" className={labelCls}>Quote title</label>
                <input id="q-title" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder={ctx?.contact?.name ? `${ctx.contact.name} travel quote` : 'Travel quote'}
                  className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="q-currency" className={labelCls}>Currency</label>
                  <select id="q-currency" value={currency} onChange={e => setCurrency(e.target.value as typeof currency)} className={inputCls}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="q-valid" className={labelCls}>Valid for (days)</label>
                  <input id="q-valid" inputMode="numeric" value={validDays} onChange={e => setValidDays(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="pt-2 border-t border-walz-border">
                <p className={labelCls}>Line items</p>
                {items.length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {items.map(i => (
                      <li key={i.key} className="flex items-center justify-between gap-2 text-xs text-walz-deep-navy">
                        <span className="min-w-0 truncate">{i.title} <span className="text-walz-muted-strong">· {currency} {Number(i.priceMajor).toLocaleString()}</span></span>
                        <button type="button" onClick={() => removeItem(i.key)} aria-label={`Remove ${i.title}`} className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-walz-muted-strong hover:text-red-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 flex-wrap mb-2">
                  <button type="button" onClick={() => applyVisaPreset('priorityService')}
                    className="min-h-[36px] px-3 rounded-lg border border-walz-border text-xs font-semibold text-walz-navy hover:bg-walz-navy/5 transition-colors">
                    Visa: UK Priority (£{UK_VISA_FEES.priorityService.amount})
                  </button>
                  <button type="button" onClick={() => applyVisaPreset('superPriorityService')}
                    className="min-h-[36px] px-3 rounded-lg border border-walz-border text-xs font-semibold text-walz-navy hover:bg-walz-navy/5 transition-colors">
                    Visa: UK Super Priority (£{UK_VISA_FEES.superPriorityService.amount})
                  </button>
                </div>
                <div className="space-y-2 rounded-lg border border-dashed border-walz-border p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={itemType} onChange={e => setItemType(e.target.value as typeof itemType)} className={inputCls}>
                      {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input inputMode="decimal" value={itemPrice} onChange={e => setItemPrice(e.target.value)} placeholder={`Price (${currency})`} className={inputCls} />
                  </div>
                  <input value={itemTitle} onChange={e => setItemTitle(e.target.value)} placeholder="Item title" className={inputCls} />
                  <input value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="Description (optional)" className={inputCls} />
                  <button type="button" onClick={addItem} className="w-full min-h-[44px] rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                    Add item
                  </button>
                </div>
              </div>

              {items.length > 0 && (
                <p className="text-xs text-walz-muted-strong">
                  Estimated total — server computes the final total: {currency} {estimatedTotal.toLocaleString()}
                </p>
              )}

              {submitError && <p role="alert" className="text-xs text-red-700">{submitError}</p>}

              <button
                onClick={() => void handleCreate()}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all"
              >
                {submitting ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Creating…</>) : 'Create quote'}
              </button>
              <p className="text-[10px] text-walz-muted-strong">
                Creating saves a draft only — nothing is sent to the client until you finalize and choose to share it.
              </p>
            </fieldset>
          )}

          {/* UX-4.2b — live search & attach. Rendered whenever identity is OK
              and there's no blocking gate, WHETHER OR NOT the draft quote has
              already been created — unlike the manual mini-form (frozen once
              submitted), live-search items attach directly to the existing
              draft via add-to-quote, so staff can keep adding after the
              first item. If no draft exists yet, the first "Add to quote"
              click below transparently creates it (reusing handleCreate). */}
          {!duplicateOf && !profileGate && identityOk && (
            <div className="pt-2 border-t border-walz-border space-y-3">
              <p className={labelCls}>Search &amp; add live inventory</p>
              <div className="flex gap-1 flex-wrap">
                {LIVE_TABS.map(t => (
                  <button key={t.id} type="button" onClick={() => setLiveTab(t.id)}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1
                      ${liveTab === t.id ? 'bg-walz-navy text-white border-walz-navy' : 'bg-white text-walz-navy border-walz-border hover:bg-walz-navy/5'}`}>
                    {t.id === 'flight' && <Plane className="w-3 h-3" />}
                    {t.id === 'hotel' && <Hotel className="w-3 h-3" />}
                    {t.id === 'activity' && <Activity className="w-3 h-3" />}
                    {t.id === 'transfer' && <Car className="w-3 h-3" />}
                    {t.label}
                  </button>
                ))}
              </div>

              {liveError && <p role="alert" className="text-xs text-red-700">{liveError}</p>}

              {liveTab === 'flight' && (
                <div className="space-y-2 rounded-lg border border-walz-border p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={flFrom} onChange={e => setFlFrom(e.target.value.toUpperCase())} placeholder="From (LHR)" maxLength={3} className={inputCls} />
                    <input value={flTo} onChange={e => setFlTo(e.target.value.toUpperCase())} placeholder="To (DXB)" maxLength={3} className={inputCls} />
                    <input type="date" value={flDepart} onChange={e => setFlDepart(e.target.value)} className={inputCls} />
                    <input type="date" value={flReturn} onChange={e => setFlReturn(e.target.value)} disabled={flTrip === 'one-way'} className={`${inputCls} disabled:opacity-40`} />
                    <select value={flTrip} onChange={e => setFlTrip(e.target.value as typeof flTrip)} className={inputCls}>
                      <option value="one-way">One-way</option>
                      <option value="round-trip">Round-trip</option>
                    </select>
                    <select value={flCabin} onChange={e => setFlCabin(e.target.value)} className={inputCls}>
                      <option value="economy">Economy</option>
                      <option value="premium_economy">Premium Economy</option>
                      <option value="business">Business</option>
                      <option value="first">First</option>
                    </select>
                    <input type="number" min={1} max={9} value={flAdults} onChange={e => setFlAdults(Number(e.target.value))} className={inputCls} />
                  </div>
                  <button type="button" onClick={() => void searchFlightsLive()} disabled={liveSearching}
                    className="w-full min-h-[40px] rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors disabled:opacity-60">
                    {liveSearching ? 'Searching…' : 'Search flights'}
                  </button>
                  {flightResults.length > 0 && (
                    <ul className="space-y-2 max-h-64 overflow-y-auto">
                      {flightResults.map((o, i) => (
                        <li key={i} className="rounded-lg border border-walz-border p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-walz-deep-navy truncate">{o.airline} · {o.segments[0]?.originCode} → {o.segments[o.segments.length - 1]?.destinationCode}</span>
                            <span className="font-mono text-walz-muted-strong flex-shrink-0">{fmtMinor(o.supplierTotalMinor, o.supplierCurrency)}</span>
                          </div>
                          <div className="text-walz-muted-strong mt-0.5">{o.cabinClass} · {o.tripType} · {o.segments.length - 1} stop(s){o.checkedBaggage ? ` · ${o.checkedBaggage}` : ''}</div>
                          <button type="button"
                            onClick={() => openPending('flight', o, `${o.airline} · ${o.segments[0]?.originCode} → ${o.segments[o.segments.length - 1]?.destinationCode}`, o.supplierTotalMinor, o.supplierCurrency)}
                            className="mt-1 min-h-[32px] px-3 rounded-lg bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors">
                            Select &amp; price
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {liveTab === 'hotel' && (
                <div className="space-y-2 rounded-lg border border-walz-border p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={htDest} onChange={e => setHtDest(e.target.value.toUpperCase())} placeholder="Destination code (PMI)" className={inputCls} />
                    <input type="number" min={1} max={9} value={htRooms} onChange={e => setHtRooms(Number(e.target.value))} placeholder="Rooms" className={inputCls} />
                    <input type="date" value={htIn} onChange={e => setHtIn(e.target.value)} className={inputCls} />
                    <input type="date" value={htOut} onChange={e => setHtOut(e.target.value)} className={inputCls} />
                    <input type="number" min={1} max={9} value={htAdults} onChange={e => setHtAdults(Number(e.target.value))} placeholder="Adults" className={inputCls} />
                  </div>
                  <button type="button" onClick={() => void searchHotelsLive()} disabled={liveSearching}
                    className="w-full min-h-[40px] rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors disabled:opacity-60">
                    {liveSearching ? 'Searching…' : 'Search hotels'}
                  </button>
                  {/* Cheapest rate is used for pricing (the compact drawer skips the
                      full per-rate picker the /admin/travel-search page offers —
                      staff can still fine-tune via "Open in quote editor"). */}
                  {hotelResults.length > 0 && (
                    <ul className="space-y-2 max-h-64 overflow-y-auto">
                      {hotelResults.map((o, i) => {
                        const cheapest = o.rates[0]
                        return (
                          <li key={i} className="rounded-lg border border-walz-border p-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-walz-deep-navy truncate">{o.hotelName}</span>
                              <span className="font-mono text-walz-muted-strong flex-shrink-0">{cheapest ? fmtMinor(cheapest.supplierAmountMinor, cheapest.supplierCurrency) : '—'}</span>
                            </div>
                            <div className="text-walz-muted-strong mt-0.5">{o.city ?? o.destinationCode} · {o.checkIn} → {o.checkOut} · {o.nights}n</div>
                            <button type="button" disabled={!cheapest}
                              onClick={() => cheapest && openPending('hotel', o, o.hotelName, cheapest.supplierAmountMinor, cheapest.supplierCurrency, { rateKey: cheapest.rateKey })}
                              className="mt-1 min-h-[32px] px-3 rounded-lg bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors disabled:opacity-50">
                              Select &amp; price
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}

              {liveTab === 'activity' && (
                <div className="space-y-2 rounded-lg border border-walz-border p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={acDest} onChange={e => setAcDest(e.target.value)} placeholder="Destination" className={inputCls} />
                    <input type="number" min={1} max={20} value={acAdults} onChange={e => setAcAdults(Number(e.target.value))} placeholder="Adults" className={inputCls} />
                    <input type="date" value={acFrom} onChange={e => setAcFrom(e.target.value)} className={inputCls} />
                    <input type="date" value={acTo} onChange={e => setAcTo(e.target.value)} className={inputCls} />
                  </div>
                  <button type="button" onClick={() => void searchActivitiesLive()} disabled={liveSearching}
                    className="w-full min-h-[40px] rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors disabled:opacity-60">
                    {liveSearching ? 'Searching…' : 'Search activities'}
                  </button>
                  {activityResults.length > 0 && (
                    <ul className="space-y-2 max-h-64 overflow-y-auto">
                      {activityResults.map((o, i) => (
                        <li key={i} className="rounded-lg border border-walz-border p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-walz-deep-navy truncate">{o.name}</span>
                            <span className="font-mono text-walz-muted-strong flex-shrink-0">{fmtMinor(o.supplierAmountMinor, o.supplierCurrency)}</span>
                          </div>
                          <div className="text-walz-muted-strong mt-0.5">{o.provider === 'viator' ? 'Viator' : 'Hotelbeds'}{o.duration ? ` · ${o.duration}` : ''}</div>
                          <button type="button" onClick={() => openPending('activity', o, o.name, o.supplierAmountMinor, o.supplierCurrency)}
                            className="mt-1 min-h-[32px] px-3 rounded-lg bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors">
                            Select &amp; price
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {liveTab === 'transfer' && (
                <div className="space-y-2 rounded-lg border border-walz-border p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={trPickupType} onChange={e => setTrPickupType(e.target.value)} className={inputCls}>
                      <option>IATA</option><option>ATLAS</option><option>RESORT</option><option>PORT</option><option>STATION</option><option>HOTEL</option>
                    </select>
                    <input value={trPickupCode} onChange={e => setTrPickupCode(e.target.value.toUpperCase())} placeholder="Pickup code" className={inputCls} />
                    <select value={trDropType} onChange={e => setTrDropType(e.target.value)} className={inputCls}>
                      <option>HOTEL</option><option>IATA</option><option>ATLAS</option><option>RESORT</option><option>PORT</option><option>STATION</option>
                    </select>
                    <input value={trDropCode} onChange={e => setTrDropCode(e.target.value.toUpperCase())} placeholder="Dropoff code" className={inputCls} />
                    <input type="date" value={trDate} onChange={e => setTrDate(e.target.value)} className={inputCls} />
                    <input type="number" min={1} max={20} value={trAdults} onChange={e => setTrAdults(Number(e.target.value))} placeholder="Adults" className={inputCls} />
                  </div>
                  <button type="button" onClick={() => void searchTransfersLive()} disabled={liveSearching}
                    className="w-full min-h-[40px] rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors disabled:opacity-60">
                    {liveSearching ? 'Searching…' : 'Search transfers'}
                  </button>
                  {transferResults.length > 0 && (
                    <ul className="space-y-2 max-h-64 overflow-y-auto">
                      {transferResults.map((o, i) => (
                        <li key={i} className="rounded-lg border border-walz-border p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-walz-deep-navy truncate">{o.name}</span>
                            <span className="font-mono text-walz-muted-strong flex-shrink-0">{fmtMinor(o.supplierAmountMinor, o.supplierCurrency)}</span>
                          </div>
                          <div className="text-walz-muted-strong mt-0.5">{o.pickupCode} → {o.dropoffCode} · {o.transferDate}</div>
                          <button type="button" onClick={() => openPending('transfer', o, o.name, o.supplierAmountMinor, o.supplierCurrency)}
                            className="mt-1 min-h-[32px] px-3 rounded-lg bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors">
                            Select &amp; price
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {pending && (
                <div className="rounded-xl border border-walz-gold/60 bg-walz-off-white p-3 space-y-2">
                  <p className={labelCls}>Pricing — {pending.title}</p>
                  <div className="flex justify-between text-xs text-walz-deep-navy">
                    <span>Supplier / net cost</span>
                    <span className="font-mono">{fmtMinor(pending.supplierMinor, pending.offerCurrency)}</span>
                  </div>
                  {pendingCurrencyMismatch && (
                    <p role="alert" className="text-xs text-red-700 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Offer is priced in {pending.offerCurrency}; quote is in {currency}.
                    </p>
                  )}
                  {pending.type === 'flight' || pending.type === 'hotel' ? (
                    pending.revalidateState === 'checking' ? (
                      <p className="text-xs text-walz-muted-strong flex items-center gap-1"><RefreshCw className="w-3 h-3 motion-safe:animate-spin" /> Verifying latest price…</p>
                    ) : pending.revalidateState === 'stale' ? (
                      <p role="alert" className="text-xs text-red-700 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {pending.revalidateMessage ?? 'This offer has changed. Please re-search.'}
                      </p>
                    ) : pending.revalidateState === 'error' ? (
                      <div className="space-y-1">
                        <p role="alert" className="text-xs text-red-700">{pending.revalidateMessage ?? 'Could not verify this offer.'}</p>
                        <button type="button"
                          onClick={() => pending.type === 'flight'
                            ? void revalidateFlight(pending.token, (pending.offer as NormalizedFlightOffer).providerOfferId)
                            : void revalidateHotel(pending.token, pending.extra?.rateKey ?? '')}
                          className="text-xs text-walz-navy underline">Retry check</button>
                      </div>
                    ) : (
                      <p className="text-xs text-green-700">Verified — price and availability current.</p>
                    )
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Markup %</label>
                      <input type="number" min={0} value={pending.markupPercent}
                        onChange={e => setPending(prev => prev ? { ...prev, markupPercent: Number(e.target.value) || 0 } : prev)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Service fee ({pending.offerCurrency})</label>
                      <input inputMode="decimal" value={pending.serviceFeeMajor}
                        onChange={e => setPending(prev => prev ? { ...prev, serviceFeeMajor: e.target.value } : prev)} className={inputCls} />
                    </div>
                  </div>
                  {(() => {
                    const preview = calculateBookingPrice({
                      productType: pending.productType, supplier: pending.supplier,
                      netAmount: pending.supplierMinor / 100, currency: pending.offerCurrency,
                      markupPercent: pending.markupPercent, serviceFee: Number(pending.serviceFeeMajor) || 0,
                    })
                    return (
                      <div className="text-xs space-y-0.5 border-t border-walz-border pt-2">
                        <div className="flex justify-between text-walz-muted-strong"><span>Markup</span><span className="font-mono">{pending.offerCurrency} {preview.markupAmount.toLocaleString()}</span></div>
                        <div className="flex justify-between font-semibold text-walz-deep-navy"><span>Client price</span><span className="font-mono">{pending.offerCurrency} {preview.sellingPrice.toLocaleString()}</span></div>
                        <div className="flex justify-between text-walz-muted-strong"><span>Margin</span><span className="font-mono">{preview.marginPercent}%</span></div>
                      </div>
                    )
                  })()}
                  <div className="flex gap-2">
                    <button type="button" onClick={cancelPending}
                      className="flex-1 min-h-[40px] rounded-lg border border-walz-border text-walz-navy text-xs font-semibold hover:bg-walz-navy/5 transition-colors">
                      Cancel
                    </button>
                    <button type="button" onClick={() => void confirmAddPending()}
                      disabled={liveBusy || pendingCurrencyMismatch || ((pending.type === 'flight' || pending.type === 'hotel') && pending.revalidateState !== 'ok')}
                      className="flex-1 min-h-[40px] rounded-lg bg-walz-gold text-walz-deep-navy text-xs font-bold hover:brightness-95 transition-all disabled:opacity-50">
                      {liveBusy ? 'Adding…' : 'Add to quote'}
                    </button>
                  </div>
                </div>
              )}

              {attachedLive.length > 0 && (
                <ul className="space-y-1">
                  {attachedLive.map(i => (
                    <li key={i.key} className="flex items-center justify-between gap-2 text-xs text-walz-deep-navy">
                      <span className="min-w-0 truncate">
                        {i.title} <span className="text-walz-muted-strong">· {i.currency} {(i.sellingPriceMinor / 100).toLocaleString()} (cost {(i.costMinor / 100).toLocaleString()})</span>
                      </span>
                      <span className="flex-shrink-0 text-green-700 text-[10px] font-semibold">Added</span>
                    </li>
                  ))}
                </ul>
              )}
              {items.length > 0 && !quote && (
                <p className="text-[10px] text-walz-muted-strong">
                  {items.length} manual item(s) staged above — included when you click &quot;Create quote&quot;, or as soon as the first live-search item is added.
                </p>
              )}
            </div>
          )}

          {recent.length > 0 && (
            <div className="pt-2 border-t border-walz-border">
              <p className={labelCls}>Quotes</p>
              <ul className="space-y-2">
                {recent.map(q => (
                  <li key={q.id} className="text-xs text-walz-deep-navy flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {q.title} <span className="text-walz-muted-strong">· {q.currency} {q.totalMinor / 100}</span>
                    </span>
                    <span className="flex-shrink-0 text-walz-muted-strong">{statusLabel(q.status)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
    </ActionDrawerShell>
  )
}
