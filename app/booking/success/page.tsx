'use client'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Clock, AlertTriangle, Download, MessageCircle, Loader2 } from 'lucide-react'

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
  bookingReference:  string | null
  supplierReference: string | null
  status:            CartStatus | string
  customerEmail:     string
  activityTitle:     string | null
  items?:            ItemStatus[]
  isCart?:           boolean
  voucherUrl?:       string
  error?:            string
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

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId    = searchParams.get('session_id')
  const gateway      = searchParams.get('gateway') ?? 'stripe'
  const txRef        = searchParams.get('tx_ref')

  const [result, setResult]   = useState<ConfirmResult | null>(null)
  const [loading, setLoading] = useState(true)
  const pollCount             = useRef(0)

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

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-lg w-full">

        {/* Cart-level header */}
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
                {hasItems && items.length === 1 ? 'Activity Confirmed!' : 'All Activities Confirmed!'}
              </h1>
              <p className="text-gray-400 text-sm">Your reservations are confirmed with the supplier.</p>
            </>
          )}
          {isProcessing && (
            <>
              <h1 className="text-2xl font-bold text-[#0B1F3A] mb-1">Payment Received</h1>
              <p className="text-gray-400 text-sm">
                {pendingCount > 0
                  ? `Confirming ${pendingCount} activit${pendingCount === 1 ? 'y' : 'ies'} with the supplier…`
                  : 'Your booking is being processed.'}
              </p>
            </>
          )}
          {isPartial && (
            <>
              <h1 className="text-2xl font-bold text-[#0B1F3A] mb-1">Partially Confirmed</h1>
              <p className="text-gray-400 text-sm">
                {confirmedCount} activit{confirmedCount !== 1 ? 'ies' : 'y'} confirmed
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
                  ? `${failedCount} activit${failedCount !== 1 ? 'ies' : 'y'} could not be confirmed. Our team has been notified.`
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

        {/* Per-item breakdown (multi-item) */}
        {hasItems && (
          <div className="space-y-3 mb-6">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Your Activities</p>
            {items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 border border-gray-100 rounded-xl p-3"
              >
                {itemIcon(item.status)}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#0B1F3A] text-sm leading-tight">
                    {item.activityTitle ?? `Activity ${idx + 1}`}
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
          <a href="/" className="text-gray-400 text-sm hover:text-[#0B1F3A] transition-colors text-center mt-1">
            Back to homepage
          </a>
        </div>
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
