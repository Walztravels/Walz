'use client'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Clock, AlertTriangle, Download, MessageCircle, Loader2, Plane, Hotel, MapPin, Smartphone, ArrowRight } from 'lucide-react'
import type { CrossSellRecommendation, RecommendationType } from '@/lib/commercial/cross-sell'

type CartStatus =
  | 'PROCESSING'
  | 'CONFIRMED'
  | 'PARTIALLY_CONFIRMED'
  | 'ACTION_REQUIRED'
  | 'FAILED'

interface ItemStatus {
  walzReference:     string | null
  supplierReference: string | null
  status:            string
  activityTitle:     string | null
  failureReason?:    string | null
}

interface ConfirmResult {
  bookingReference:        string | null
  supplierReference:       string | null
  status:                  CartStatus | string
  customerEmail:           string
  activityTitle:           string | null
  items?:                  ItemStatus[]
  isCart?:                 boolean
  voucherUrl?:             string
  error?:                  string
  tripId?:                 string | null
  tripStatus?:             string | null
  crossSellRecommendations?: CrossSellRecommendation[]
}

const PENDING_CART_STATUSES: string[] = ['PROCESSING', 'PARTIALLY_CONFIRMED']
const PENDING_ITEM_STATUSES: string[] = ['PAYMENT_RECEIVED', 'SUPPLIER_CONFIRMING', 'PROCESSING']
const POLL_INTERVAL_MS  = 3_000
const POLL_MAX_ATTEMPTS = 40  // ~2 minutes

function itemIcon(status: string) {
  if (status === 'CONFIRMED')   return <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
  if (PENDING_ITEM_STATUSES.includes(status)) return <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5 animate-pulse" />
  return <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
}

function itemStatusLabel(status: string, failureReason?: string | null): string {
  if (status === 'CONFIRMED')                      return 'Confirmed'
  if (status === 'SUPPLIER_CONFIRMING')            return 'Confirming with supplier…'
  if (status === 'PAYMENT_RECEIVED')               return 'Awaiting supplier confirmation'
  if (status === 'SUPPLIER_BOOKING_FAILED')        return failureReason === 'SOLD_OUT' ? 'Sold out — our team has been notified' : 'Supplier could not confirm — our team has been notified'
  if (status === 'RECONCILIATION_REQUIRED')        return 'Verifying with supplier…'
  if (status === 'PRICE_CHANGE_REQUIRES_ACTION')   return 'Price change — our team has been notified'
  return 'Pending'
}

function CrossSellIcon({ type }: { type: RecommendationType }) {
  const cls = 'w-5 h-5'
  if (type === 'HOTEL')    return <Hotel    className={cls} />
  if (type === 'FLIGHT')   return <Plane    className={cls} />
  if (type === 'ESIM')     return <Smartphone className={cls} />
  if (type === 'TRANSFER') return <ArrowRight className={cls} />
  return <MapPin className={cls} />
}

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId    = searchParams.get('session_id')
  const gateway      = searchParams.get('gateway') ?? 'stripe'
  const txRef        = searchParams.get('tx_ref')

  const [result, setResult]   = useState<ConfirmResult | null>(null)
  const [loading, setLoading] = useState(true)
  const pollCount             = useRef(0)
  const upsellTracked         = useRef(false)

  async function fetchStatus() {
    const res = await fetch('/api/checkout/confirm', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ sessionId, gateway, txRef }),
    })
    return (await res.json()) as ConfirmResult
  }

  useEffect(() => {
    if (!sessionId && gateway !== 'flutterwave') { setLoading(false); return }
    let cancelled = false

    async function run() {
      try {
        const initial = await fetchStatus()
        if (cancelled) return
        setResult(initial)
        setLoading(false)

        if (!initial.isCart) return
        if (!PENDING_CART_STATUSES.includes(initial.status)) return

        while (!cancelled && pollCount.current < POLL_MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
          if (cancelled) break
          pollCount.current++
          const next = await fetchStatus()
          if (cancelled) break
          setResult(next)
          if (!PENDING_CART_STATUSES.includes(next.status)) break
        }
      } catch { if (!cancelled) setLoading(false) }
    }

    run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F0E8]">
      <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
    </div>
  )

  const status       = (result?.status ?? 'PROCESSING') as CartStatus | string
  const items        = result?.items ?? []
  const hasItems     = items.length > 0
  const isConfirmed  = status === 'CONFIRMED'
  const isPartial    = status === 'PARTIALLY_CONFIRMED'
  const isAction     = status === 'ACTION_REQUIRED' || status === 'FAILED'
  const isProcessing = PENDING_CART_STATUSES.includes(status) || status === 'PROCESSING'

  const confirmedCount = items.filter(i => i.status === 'CONFIRMED').length
  const pendingCount   = items.filter(i => PENDING_ITEM_STATUSES.includes(i.status)).length
  const failedCount    = items.filter(i =>
    ['SUPPLIER_BOOKING_FAILED', 'RECONCILIATION_REQUIRED', 'PRICE_CHANGE_REQUIRES_ACTION'].includes(i.status)
  ).length

  const recs = result?.crossSellRecommendations ?? []
  // Only surface "Complete Your Trip" when supplier has confirmed — not during PROCESSING.
  // Prevents cross-sell distraction when the booking outcome is still uncertain.
  const showRecommendations = (isConfirmed || isPartial) && recs.length > 0

  // Fire post_booking_upsell_shown once when recommendations appear (2D.3)
  useEffect(() => {
    if (!showRecommendations || upsellTracked.current) return
    upsellTracked.current = true
    fetch('/api/commercial/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event:       'post_booking_upsell_shown',
        sessionId,
        metadata:    { count: recs.length, types: recs.map(r => r.type) },
      }),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs.length])

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-4">

        {/* Main booking confirmation card */}
        <div className="bg-white rounded-3xl shadow-xl p-8">

          {/* Status header */}
          <div className="text-center mb-6">
            {isConfirmed && (
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-500" />
              </div>
            )}
            {isProcessing && (
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-10 h-10 text-amber-500 animate-pulse" />
              </div>
            )}
            {(isPartial || isAction) && (
              <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-10 h-10 text-orange-500" />
              </div>
            )}

            {isConfirmed && (
              <>
                <h1 className="text-2xl font-bold text-[#0B1F3A] mb-1">
                  {hasItems && items.length === 1 ? 'Booking Confirmed!' : 'Booking Confirmed!'}
                </h1>
                <p className="text-gray-400 text-sm">Your reservation is confirmed with the supplier.</p>
              </>
            )}
            {isProcessing && (
              <>
                <h1 className="text-2xl font-bold text-[#0B1F3A] mb-1">Payment Received</h1>
                <p className="text-gray-400 text-sm">
                  {pendingCount > 0
                    ? `Confirming ${pendingCount} item${pendingCount === 1 ? '' : 's'} with the supplier…`
                    : 'Your booking is being processed.'}
                </p>
              </>
            )}
            {isPartial && (
              <>
                <h1 className="text-2xl font-bold text-[#0B1F3A] mb-1">Partially Confirmed</h1>
                <p className="text-gray-400 text-sm">
                  {confirmedCount} item{confirmedCount !== 1 ? 's' : ''} confirmed
                  {pendingCount > 0 ? `, ${pendingCount} still confirming` : ''}.
                </p>
              </>
            )}
            {isAction && (
              <>
                <h1 className="text-2xl font-bold text-[#0B1F3A] mb-1">
                  {confirmedCount > 0 ? `${confirmedCount} Confirmed — Action Needed` : 'We\'re Working on Your Booking'}
                </h1>
                <p className="text-gray-400 text-sm">
                  {failedCount > 0
                    ? `${failedCount} item${failedCount !== 1 ? 's' : ''} could not be confirmed. Our team has been notified.`
                    : 'Our team is resolving your booking and will contact you shortly.'}
                </p>
              </>
            )}
          </div>

          {/* Primary Walz reference */}
          {result?.bookingReference && !hasItems && (
            <div className="text-center mb-6">
              <p className="text-gray-400 text-xs mb-1 tracking-widest">WALZ REFERENCE</p>
              <p className="font-mono font-bold text-[#C9A84C] text-2xl">{result.bookingReference}</p>
            </div>
          )}

          {/* Polling indicator */}
          {(isProcessing || isPartial) && (
            <div className="flex items-center justify-center gap-2 mb-4 text-amber-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Checking status…</span>
            </div>
          )}

          {/* Per-item breakdown */}
          {hasItems && (
            <div className="space-y-3 mb-6">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Your Bookings</p>
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 border border-gray-100 rounded-xl p-3"
                >
                  {itemIcon(item.status)}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#0B1F3A] text-sm leading-tight">
                      {item.activityTitle ?? `Item ${idx + 1}`}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{itemStatusLabel(item.status, item.failureReason)}</p>
                    {item.walzReference && (
                      <p className="font-mono text-[10px] text-[#C9A84C] mt-1">{item.walzReference}</p>
                    )}
                    {item.supplierReference && item.status === 'CONFIRMED' && (
                      <p className="font-mono text-[10px] text-gray-400">Supplier: {item.supplierReference}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <a
              href="https://wa.me/12317902336"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 bg-green-500 text-white
                font-bold py-3 rounded-xl text-sm hover:bg-green-600 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              {isAction || failedCount > 0 ? 'Contact our team' : 'Chat with our team'}
            </a>
            {result?.voucherUrl && isConfirmed && (
              <a
                href={result.voucherUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-[#0B1F3A] text-white
                  font-bold py-3 rounded-xl text-sm hover:bg-[#162d52] transition-colors"
              >
                <Download className="w-4 h-4" /> Download Voucher (PDF)
              </a>
            )}
            {result?.tripId && (
              <a
                href={`/trip/${result.tripId}`}
                className="flex items-center justify-center gap-2 border border-[#0B1F3A] text-[#0B1F3A]
                  font-bold py-3 rounded-xl text-sm hover:bg-[#0B1F3A] hover:text-white transition-colors"
              >
                View My Trip
              </a>
            )}
            <a href="/" className="text-gray-400 text-sm hover:text-[#0B1F3A] transition-colors text-center mt-1">
              Back to homepage
            </a>
          </div>
        </div>

        {/* Complete Your Trip — cross-sell section (2D.2) */}
        {/* Gated: only shows on CONFIRMED or PARTIALLY_CONFIRMED — not during PROCESSING */}
        {showRecommendations && (
          <div className="bg-white rounded-3xl shadow-xl p-6">
            <h2 className="text-lg font-bold text-[#0B1F3A] mb-1">Complete Your Trip</h2>
            <p className="text-gray-400 text-sm mb-4">You may also need:</p>
            <div className="space-y-3">
              {recs.map((rec, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 border border-gray-100 rounded-xl p-4 hover:border-[#C9A84C] transition-colors"
                >
                  <div className="w-9 h-9 bg-[#F5F0E8] rounded-lg flex items-center justify-center flex-shrink-0 text-[#C9A84C]">
                    <CrossSellIcon type={rec.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#0B1F3A] text-sm">{rec.type.charAt(0) + rec.type.slice(1).toLowerCase()}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{rec.reason}</p>
                    {rec.ctaHref ? (
                      <a
                        href={rec.ctaHref}
                        className="text-xs font-bold text-[#C9A84C] hover:underline mt-1 inline-block"
                      >
                        {rec.ctaLabel} →
                      </a>
                    ) : (
                      <span className="text-xs font-bold text-[#C9A84C] mt-1 inline-block">{rec.ctaLabel}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default function BookingSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F5F0E8]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
