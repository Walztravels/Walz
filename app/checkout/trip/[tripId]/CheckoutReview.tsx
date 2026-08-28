'use client'
// app/checkout/trip/[tripId]/CheckoutReview.tsx
// Client component — handles revalidation fetch, price acceptance, gateway selection, and pay CTA.
// Prices for payment come from the DB via /api/checkout/trip (never from this component's state).

import { useState, useEffect, useCallback } from 'react'

interface InitialItem {
  id:          string
  type:        string
  title:       string
  description: string | null
  cost:        number | null
  currency:    string
  confirmed:   boolean
  bookingRef:  string | null
  location:    string | null
  startTime:   string | null
  sourceType:  string | null
}

interface ValidationItem {
  itemId:         string
  title:          string
  type:           string
  status:         string
  previousPrice?: number
  latestPrice?:   number
  currency?:      string
  reason?:        string
}

interface ValidationResult {
  status:            'READY' | 'ACTION_REQUIRED' | 'BLOCKED'
  items:             ValidationItem[]
  eligibleCount:     number
  priceChangedCount: number
  blockedCount:      number
}

interface Props {
  tripId:        string
  checkoutToken: string
  wasCancelled:  boolean
  initialItems:  InitialItem[]
  tripCurrency:  string
}

const TYPE_LABEL: Record<string, string> = {
  FLIGHT: '✈ Flight', HOTEL: '🏨 Hotel', ACTIVITY: '🎭 Activity',
  TRANSFER: '🚗 Transfer', TRANSPORT: '🚗 Transport', ESIM: '📶 eSIM',
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  READY:               { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Confirmed' },
  PRICE_CHANGED:       { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Price Updated' },
  SOLD_OUT:            { bg: 'bg-red-50',     text: 'text-red-700',     label: 'Unavailable' },
  EXPIRED:             { bg: 'bg-red-50',     text: 'text-red-700',     label: 'Expired' },
  STALE:               { bg: 'bg-orange-50',  text: 'text-orange-700',  label: 'Needs Re-search' },
  REVALIDATION_FAILED: { bg: 'bg-gray-50',    text: 'text-gray-600',    label: 'Check Failed' },
  PURCHASED:           { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Already Purchased' },
  NOT_APPLICABLE:      { bg: 'bg-gray-50',    text: 'text-gray-500',    label: '' },
}

function getSessionId(): string {
  try {
    let id = localStorage.getItem('walz_cart_session_id')
    if (!id) {
      id = `cs_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
      localStorage.setItem('walz_cart_session_id', id)
    }
    return id
  } catch {
    return `cs_${Math.random().toString(36).slice(2)}`
  }
}

export default function CheckoutTripReview({
  tripId, checkoutToken, wasCancelled, initialItems, tripCurrency,
}: Props) {
  const [validation, setValidation]         = useState<ValidationResult | null>(null)
  const [validating, setValidating]         = useState(true)
  const [validationError, setValidationError] = useState('')
  const [gateway, setGateway]               = useState<'stripe' | 'flutterwave' | 'paystack'>('stripe')
  const [paying, setPaying]                 = useState(false)
  const [payError, setPayError]             = useState('')
  const [acceptingId, setAcceptingId]       = useState<string | null>(null)
  const [acceptedPrices, setAcceptedPrices] = useState<Record<string, number>>({})

  // Run revalidation on mount
  const runValidation = useCallback(async () => {
    setValidating(true)
    setValidationError('')
    try {
      const sessionId = getSessionId()
      const res = await fetch(`/api/checkout/trip/${tripId}/validate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ checkoutToken, sessionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setValidationError(data.error ?? 'Could not verify availability. Please try again.')
        setValidation(null)
      } else {
        setValidation(data as ValidationResult)
      }
    } catch {
      setValidationError('Network error — please check your connection and try again.')
    } finally {
      setValidating(false)
    }
  }, [tripId, checkoutToken])

  useEffect(() => { runValidation() }, [runValidation])

  // Accept a price change server-side (re-runs revalidation for that item, updates DB)
  async function acceptPrice(itemId: string) {
    setAcceptingId(itemId)
    try {
      const sessionId = getSessionId()
      const res = await fetch(`/api/checkout/trip/${tripId}/accept-price`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ itemId, checkoutToken, sessionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Could not accept price change.')
        return
      }
      setAcceptedPrices(prev => ({ ...prev, [itemId]: data.newPrice }))
      // Re-run validation to refresh the state
      await runValidation()
    } catch {
      alert('Network error — please try again.')
    } finally {
      setAcceptingId(null)
    }
  }

  // Proceed to payment
  async function handlePay() {
    setPaying(true)
    setPayError('')
    try {
      const sessionId = getSessionId()
      const res = await fetch('/api/checkout/trip', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tripId, gateway, sessionId, checkoutToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPayError(data.message ?? data.error ?? 'Checkout failed. Please try again.')
        // Re-validate in case something changed
        void runValidation()
        return
      }
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setPayError('Network error — please try again.')
    } finally {
      setPaying(false)
    }
  }

  // Compute display items — merge DB items with validation results
  const displayItems = initialItems.map(item => {
    const v = validation?.items.find(i => i.itemId === item.id)
    return { ...item, validation: v }
  })

  // Eligible unpurchased items for total calculation
  const eligibleItems = initialItems.filter(i =>
    ['ACTIVITY', 'TRANSFER', 'TRANSPORT', 'HOTEL', 'FLIGHT'].includes(i.type.toUpperCase()) &&
    !i.confirmed && !i.bookingRef
  )
  const tripTotal = eligibleItems.reduce((s, i) => {
    const v = validation?.items.find(vi => vi.itemId === i.id)
    const price = acceptedPrices[i.id] ?? v?.latestPrice ?? i.cost ?? 0
    return s + price
  }, 0)

  const canPay =
    validation?.status === 'READY' &&
    !validating && !paying

  const hasBlockers = validation?.status === 'BLOCKED'
  const hasChanges  = validation?.status === 'ACTION_REQUIRED' &&
    (validation?.items.some(i => i.status === 'PRICE_CHANGED') ?? false)

  return (
    <div className="space-y-4">
      {/* Cancelled banner */}
      {wasCancelled && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          Your payment was cancelled. Your trip is still saved — review and try again when ready.
        </div>
      )}

      {/* Validation state */}
      {validating && (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm text-gray-600">
          <svg className="animate-spin h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Checking latest availability and prices…
        </div>
      )}
      {validationError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {validationError}
          <button onClick={runValidation} className="ml-2 underline font-medium">Try again</button>
        </div>
      )}
      {hasBlockers && !validating && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
          <strong>Checkout blocked.</strong> One or more items need attention before you can pay.
          Return to Jade to resolve.
        </div>
      )}
      {hasChanges && !validating && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <strong>Prices have changed.</strong> Please review and accept the updated prices below before continuing.
        </div>
      )}

      {/* Trip items */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        <div className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Your Trip
        </div>
        {displayItems.map(item => {
          const s     = STATUS_STYLE[item.validation?.status ?? 'NOT_APPLICABLE']
          const isPurchased    = item.confirmed || !!item.bookingRef
          const isPriceChanged = item.validation?.status === 'PRICE_CHANGED'
          const isBlocked      = ['SOLD_OUT', 'EXPIRED', 'STALE'].includes(item.validation?.status ?? '')
          const displayPrice   = acceptedPrices[item.id]
            ?? item.validation?.latestPrice
            ?? item.cost

          return (
            <div key={item.id} className={`px-4 py-4 ${isBlocked ? 'bg-red-50' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400">
                      {TYPE_LABEL[item.type.toUpperCase()] ?? item.type}
                    </span>
                    {item.validation && s.label && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                        {s.label}
                      </span>
                    )}
                    {isPurchased && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        Already purchased
                      </span>
                    )}
                  </div>
                  <div className="font-medium text-gray-900 mt-0.5 text-sm leading-snug">{item.title}</div>
                  {item.location && (
                    <div className="text-xs text-gray-400 mt-0.5">{item.location}</div>
                  )}
                  {item.validation?.reason && isBlocked && (
                    <div className="text-xs text-red-600 mt-1">{item.validation.reason}</div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  {!isPurchased && displayPrice != null && (
                    <div className={`font-semibold text-sm ${isPriceChanged ? 'text-amber-700' : 'text-gray-900'}`}>
                      {item.currency} {displayPrice.toFixed(2)}
                    </div>
                  )}
                  {isPriceChanged && item.validation?.previousPrice != null && (
                    <div className="text-xs text-gray-400 line-through">
                      {item.currency} {item.validation.previousPrice.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>

              {/* Price change acceptance */}
              {isPriceChanged && !acceptedPrices[item.id] && (
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => acceptPrice(item.id)}
                    disabled={acceptingId === item.id}
                    className="text-xs font-medium bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg px-3 py-1.5 transition-colors"
                  >
                    {acceptingId === item.id ? 'Updating…' : `Accept ${item.currency} ${item.validation?.latestPrice?.toFixed(2)}`}
                  </button>
                  <a href="/plan" className="text-xs text-gray-500 underline">Find alternative</a>
                </div>
              )}
              {isPriceChanged && acceptedPrices[item.id] && (
                <div className="mt-2 text-xs text-emerald-600 font-medium">✓ Price accepted</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Total */}
      {eligibleItems.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Trip total</span>
            <span className="text-lg font-bold text-gray-900">
              {tripCurrency} {tripTotal.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Excludes already-purchased items. Payment is collected in {tripCurrency}.
          </p>
        </div>
      )}

      {/* Gateway selector + pay button */}
      {!hasBlockers && !validating && !validationError && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-4 space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
              Payment method
            </div>
            <div className="flex gap-3 flex-wrap">
              {[
                { id: 'stripe',      label: 'Card (Stripe)',              sub: 'Visa, Mastercard, Amex' },
                { id: 'flutterwave', label: 'Card / Mobile Money (FLW)',   sub: 'Flutterwave — Africa & more' },
                { id: 'paystack',    label: 'Card / Bank Transfer (NGN)',  sub: 'Paystack — Nigeria & Africa' },
              ].map(g => (
                <label
                  key={g.id}
                  className={`flex-1 min-w-[140px] border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                    gateway === g.id
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="gateway"
                    value={g.id}
                    checked={gateway === g.id}
                    onChange={() => setGateway(g.id as 'stripe' | 'flutterwave' | 'paystack')}
                    className="sr-only"
                  />
                  <div className="text-sm font-medium text-gray-900">{g.label}</div>
                  <div className="text-xs text-gray-400">{g.sub}</div>
                </label>
              ))}
            </div>
          </div>

          {payError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {payError}
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={!canPay || paying}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3.5 text-sm transition-colors"
          >
            {paying
              ? 'Redirecting to payment…'
              : canPay
              ? `Continue to Payment — ${tripCurrency} ${tripTotal.toFixed(2)}`
              : hasChanges
              ? 'Accept price changes above to continue'
              : 'Checking availability…'}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Secure payment. Your card details are handled by {gateway === 'stripe' ? 'Stripe' : gateway === 'paystack' ? 'Paystack' : 'Flutterwave'} and never stored by Walz Travels.
            Payment does not confirm your booking — you'll receive confirmation once we verify with suppliers.
          </p>
        </div>
      )}
    </div>
  )
}
