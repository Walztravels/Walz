'use client'

import { useState, useEffect } from 'react'
import { useRouter }           from 'next/navigation'
import type { FlightItinerary, Passenger } from '@/lib/flights/types'
import type { AiRecommendation, SavedPaymentMethod } from '@/store/flightStore'
import { useFlightStore }   from '@/store/flightStore'
import { formatDuration, formatTime, formatDate } from '@/lib/flights/utils'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  offer:              FlightItinerary
  aiRec:              AiRecommendation | null
  savedCard:          SavedPaymentMethod | null
  passengerCount:     number
  onClose:            () => void
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function cardBrandIcon(brand: string) {
  const map: Record<string, string> = { visa: '🟦', mastercard: '🔴', amex: '🟩', discover: '🟧' }
  return map[brand.toLowerCase()] ?? '💳'
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function EmptyPassengerForm({
  onChange,
}: {
  onChange: (pax: Partial<Passenger>) => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">First name</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
            onChange={e => onChange({ firstName: e.target.value })} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Last name</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
            onChange={e => onChange({ lastName: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Date of birth</label>
          <input type="date"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
            onChange={e => onChange({ dob: e.target.value })} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Gender</label>
          <select
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
            onChange={e => onChange({ title: e.target.value as Passenger['title'] })}>
            <option value="Mr">Mr</option>
            <option value="Ms">Ms</option>
            <option value="Mrs">Mrs</option>
            <option value="Dr">Dr</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Email</label>
        <input type="email"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
          onChange={e => onChange({ email: e.target.value })} />
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Phone</label>
        <input type="tel"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
          onChange={e => onChange({ phone: e.target.value })} />
      </div>
    </div>
  )
}

// ─── Main modal ────────────────────────────────────────────────────────────────

export function OneTapModal({ offer, aiRec, savedCard, passengerCount, onClose }: Props) {
  const router = useRouter()
  const store  = useFlightStore()
  const { setConfirmed, setSelected, setPassengers, passengers: storedPassengers } = store

  const [processing, setProcessing] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [paxDraft,   setPaxDraft]   = useState<Partial<Passenger>>({})

  // Build a passenger list for the Duffel order
  const leadPax: Partial<Passenger> = storedPassengers[0] ?? paxDraft

  const seg     = offer.segments[0]
  const segLast = offer.segments[offer.segments.length - 1]
  const total   = offer.price.total

  // ── One-tap confirm: charge card then create Duffel order ────────────────────
  async function handleConfirm() {
    setError(null)

    // Validate lead passenger
    if (!leadPax.firstName || !leadPax.lastName || !leadPax.email) {
      setError('Please fill in passenger details to continue.')
      return
    }

    if (!savedCard) {
      setError('No saved payment method. Please complete checkout first.')
      return
    }

    setProcessing(true)

    // ── Step 1: Charge the saved card ─────────────────────────────────────────
    const chargeRes = await fetch('/api/payments/charge', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        stripeCustomerId:      savedCard.stripeCustomerId,
        stripePaymentMethodId: savedCard.stripePaymentMethodId,
        amount:                Math.round(total * 100),
        currency:              offer.price.currency?.toLowerCase() ?? 'gbp',
        metadata: {
          offerId:  offer.id,
          route:    `${seg?.departureIata}-${segLast?.arrivalIata}`,
          email:    leadPax.email ?? '',
        },
      }),
    })

    const chargeData = await chargeRes.json()

    if (!chargeRes.ok) {
      // Stripe declined — do NOT create Duffel order
      setError(chargeData.error ?? 'Payment failed — card was not charged.')
      setProcessing(false)
      return
    }

    const paymentIntentId = chargeData.paymentIntentId as string

    // ── Step 2: Create Duffel order ───────────────────────────────────────────
    // Persist selection + passengers so existing book route can reference them
    setSelected(offer)
    const pax: Passenger[] = [{
      id:             'pax_1',
      type:           'adult',
      title:          (leadPax.title ?? 'Mr') as Passenger['title'],
      firstName:      leadPax.firstName ?? '',
      lastName:       leadPax.lastName  ?? '',
      dob:            leadPax.dob        ?? '1990-01-01',
      nationality:    leadPax.nationality ?? 'GBR',
      passportNo:     leadPax.passportNo  ?? '',
      passportExpiry: leadPax.passportExpiry ?? '',
      email:          leadPax.email  ?? '',
      phone:          leadPax.phone  ?? '',
    }]
    setPassengers(pax)

    const bookRes = await fetch('/api/flights/one-tap-book', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        offerId:         offer.id,
        paymentIntentId,
        total,
        currency:        offer.price.currency,
        passengers:      pax.map((p, i) => ({
          id:          `pax_${i + 1}`,
          given_name:  p.firstName,
          family_name: p.lastName,
          born_on:     p.dob,
          gender:      p.title === 'Mr' ? 'm' : 'f',
          title:       p.title.toLowerCase(),
          email:       p.email ?? '',
          phone_number: p.phone ?? '',
        })),
        passengerEmail: leadPax.email ?? '',
        passengerName:  `${leadPax.firstName ?? ''} ${leadPax.lastName ?? ''}`.trim(),
      }),
    })

    const bookData = await bookRes.json()

    if (!bookRes.ok || !bookData.bookingRef) {
      // Duffel failed AFTER card was charged — flag for manual review
      setError(
        bookData.error
          ? `Booking failed after payment: ${bookData.error}. Our team has been notified and will contact you.`
          : 'Payment succeeded but booking failed. Our team has been alerted — please contact support.',
      )
      setProcessing(false)
      return
    }

    // ── Step 3: Confirm ───────────────────────────────────────────────────────
    setConfirmed(bookData.bookingRef, bookData.orderId ?? '', {
      bookingRef:      bookData.bookingRef,
      orderId:         bookData.orderId ?? '',
      total,
      currency:        offer.price.currency,
      paymentIntentId,
      confirmedAt:     new Date().toISOString(),
    })

    onClose()
    router.push(`/flights/confirmation?ref=${bookData.bookingRef}`)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
        aria-hidden />

      {/* Modal */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto z-50 bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#0B1F3A] px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-base">Confirm Booking</h2>
            <p className="text-white/40 text-xs mt-0.5">Review and confirm your flight</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-2xl leading-none">×</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Flight summary */}
          <div className="bg-[#FAF7F2] rounded-2xl p-4">
            <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-2">Flight</p>
            <div className="flex items-center gap-3">
              {seg?.airlineLogo && (
                <img src={seg.airlineLogo} alt={seg.airlineName} className="w-10 h-10 rounded-xl object-contain bg-white p-1 border border-black/5" />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 font-bold text-[#0B1F3A] text-sm">
                  <span>{seg?.departureIata}</span>
                  <span className="text-[#0B1F3A]/30">→</span>
                  <span>{segLast?.arrivalIata}</span>
                </div>
                <p className="text-[#0B1F3A]/50 text-xs mt-0.5">
                  {formatDate(seg?.departureTime ?? '')} · {formatTime(seg?.departureTime ?? '')}–{formatTime(segLast?.arrivalTime ?? '')}
                </p>
                <p className="text-[#0B1F3A]/40 text-[10px] mt-0.5">
                  {offer.stops === 0 ? 'Direct' : `${offer.stops} stop${offer.stops > 1 ? 's' : ''}`}
                  {' · '}{formatDuration(offer.totalDuration)}
                  {' · '}{capitalise(offer.fareType)}
                  {' · '}{offer.baggageInfo.checked}
                </p>
              </div>
            </div>
          </div>

          {/* Price breakdown */}
          <div className="bg-white border border-[#0B1F3A]/8 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-2">Price breakdown</p>
            <div className="flex justify-between text-sm">
              <span className="text-[#0B1F3A]/60">Base fare ({passengerCount} pax)</span>
              <span className="text-[#0B1F3A] font-medium">
                {new Intl.NumberFormat('en-GB', { style: 'currency', currency: offer.price.currency ?? 'GBP', minimumFractionDigits: 0 }).format(offer.price.base ?? 0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#0B1F3A]/60">Taxes &amp; fees</span>
              <span className="text-[#0B1F3A] font-medium">
                {new Intl.NumberFormat('en-GB', { style: 'currency', currency: offer.price.currency ?? 'GBP', minimumFractionDigits: 0 }).format(offer.price.taxes ?? 0)}
              </span>
            </div>
            <div className="border-t border-[#0B1F3A]/8 pt-2 flex justify-between items-center">
              <span className="font-bold text-[#0B1F3A]">Total</span>
              <span className="text-xl font-bold text-[#0B1F3A]">
                {new Intl.NumberFormat('en-GB', { style: 'currency', currency: offer.price.currency ?? 'GBP', minimumFractionDigits: 0 }).format(total)}
              </span>
            </div>
          </div>

          {/* Payment method */}
          {savedCard ? (
            <div className="bg-[#0B1F3A] rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl">{cardBrandIcon(savedCard.brand)}</span>
              <div>
                <p className="text-white text-sm font-semibold">
                  {capitalise(savedCard.brand)} ••••{savedCard.last4}
                </p>
                <p className="text-white/40 text-xs">Saved payment method · charged immediately</p>
              </div>
              <span className="ml-auto text-[#C9A84C] text-xs font-bold">⚡ One-tap</span>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-amber-800 text-sm font-semibold">No saved card</p>
              <p className="text-amber-600 text-xs mt-0.5">Complete a checkout to save your card for one-tap bookings.</p>
            </div>
          )}

          {/* Cancellation policy */}
          <div className="bg-[#FAF7F2] rounded-2xl p-4">
            <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-2">Cancellation policy</p>
            <div className="flex items-center gap-2 text-sm">
              <span className={offer.refundable ? 'text-emerald-600' : 'text-red-500'}>
                {offer.refundable ? '✓' : '✗'}
              </span>
              <span className="text-[#0B1F3A]/70">
                {offer.refundable
                  ? 'Refundable — cancellation eligible with fees'
                  : 'Non-refundable — no cancellation refund'}
              </span>
            </div>
            {offer.changeable && (
              <div className="flex items-center gap-2 text-sm mt-1">
                <span className="text-emerald-600">✓</span>
                <span className="text-[#0B1F3A]/70">Date change allowed (fees may apply)</span>
              </div>
            )}
          </div>

          {/* AI recommendation reason */}
          {aiRec && (
            <div className="flex items-start gap-2 bg-[#C9A84C]/8 border border-[#C9A84C]/20 rounded-2xl p-4">
              <div className="w-5 h-5 rounded-md bg-[#C9A84C] flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[#0B1F3A] font-black text-[8px]">AI</span>
              </div>
              <p className="text-[#0B1F3A]/70 text-xs leading-relaxed">
                <span className="font-semibold text-[#0B1F3A]">Jade AI: </span>
                {aiRec.reason}
              </p>
            </div>
          )}

          {/* Passenger details */}
          <div>
            <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-3">Lead passenger</p>
            {storedPassengers.length > 0 ? (
              <div className="bg-[#FAF7F2] rounded-2xl p-4">
                <p className="font-semibold text-[#0B1F3A] text-sm">
                  {storedPassengers[0].firstName} {storedPassengers[0].lastName}
                </p>
                <p className="text-[#0B1F3A]/50 text-xs mt-0.5">{storedPassengers[0].email}</p>
                {passengerCount > 1 && (
                  <p className="text-[#0B1F3A]/40 text-xs mt-1">+{passengerCount - 1} additional passenger{passengerCount > 2 ? 's' : ''}</p>
                )}
              </div>
            ) : (
              <EmptyPassengerForm onChange={p => setPaxDraft(prev => ({ ...prev, ...p }))} />
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-[#0B1F3A]/8 flex gap-3 flex-shrink-0 bg-white">
          <button onClick={onClose} disabled={processing}
            className="flex-1 py-3 rounded-xl border border-[#0B1F3A]/15 text-[#0B1F3A]/60 font-semibold text-sm hover:bg-[#F5F2EE] transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={processing || !savedCard}
            className="flex-1 py-3 rounded-xl bg-[#C9A84C] hover:bg-[#E8C87A] text-[#0B1F3A] font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {processing ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-[#0B1F3A]/30 border-t-[#0B1F3A] animate-spin" />
                Confirming…
              </>
            ) : (
              <>
                <span>⚡</span>
                Confirm booking
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
