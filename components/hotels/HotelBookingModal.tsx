'use client'

import { useState } from 'react'
import { X, Calendar, Users, ChevronRight, Loader2, CheckCircle, MapPin, Shield, Star } from 'lucide-react'
import { PaymentForm } from '@/components/booking/PaymentForm'
import { generateBookingReference } from '@/lib/utils'
import type { HotelResult } from '@/types/booking'

type Step = 'details' | 'payment' | 'confirming' | 'confirmed'

interface Props {
  hotel:    HotelResult
  checkIn:  string
  checkOut: string
  adults:   number
  rooms:    number
  onClose:  () => void
}

export function HotelBookingModal({ hotel, checkIn, checkOut, adults, rooms, onClose }: Props) {
  const [step,  setStep]  = useState<Step>('details')
  const [error, setError] = useState<string | null>(null)

  const [name,  setName]  = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [walzRef, setWalzRef] = useState('')
  const [hbRef,   setHbRef]   = useState('')

  const nights = Math.max(1, Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  ))
  const total    = Math.round((hotel.totalPrice?.amount ?? hotel.pricePerNight.amount * nights) * 100) / 100
  const currency = hotel.totalPrice?.currency ?? hotel.pricePerNight.currency
  const bookRef  = generateBookingReference()
  const txRef    = `WALZ-HTL-${bookRef}`

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  function validate() {
    if (!name.trim())  { setError('Please enter your full name.'); return false }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email.'); return false
    }
    if (!phone.trim()) { setError('Please enter your phone number.'); return false }
    setError(null); return true
  }

  async function handlePaymentSuccess(transactionId: string | number, gateway: 'flutterwave' | 'stripe') {
    setStep('confirming')
    setError(null)
    try {
      const res = await fetch('/api/hotels/book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateKey:       hotel.rateKey || hotel.id,
          rateType:      'BOOKABLE',
          hotelCode:     hotel.hotelCode,
          hotelName:     hotel.name,
          hotelAddress:        hotel.hotelAddress ?? [hotel.address?.lines?.[0], hotel.address?.city, hotel.address?.country].filter(Boolean).join(', '),
          rateCommentsId:      (hotel as any).rateCommentsId ?? null,
          destinationTimezone: (hotel as any).destinationTimezone ?? 'UTC',
          checkIn, checkOut, adults, rooms,
          holderName:    name,
          holderEmail:   email,
          holderPhone:   phone,
          totalAmount:   total,
          currency,
          txRef,
          paymentGateway: gateway,
          transactionId,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Booking failed')
      setWalzRef(data.walzRef)
      setHbRef(data.hotelbedsRef)
      setStep('confirmed')
    } catch (e: any) {
      setError(`Payment received but booking failed. Please contact us with ref: ${txRef}. Error: ${e.message}`)
      setStep('payment')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={step === 'confirmed' ? onClose : undefined} />

      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="bg-[#0B1F3A] px-5 py-4 rounded-t-3xl sm:rounded-t-2xl flex items-start gap-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold leading-snug line-clamp-1">{hotel.name}</p>
            <p className="text-white/50 text-xs mt-0.5 flex items-center gap-1">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {hotel.address.city}, {hotel.address.country}
              {hotel.stars > 0 && (
                <span className="ml-1 flex items-center gap-0.5">
                  · {Array.from({ length: hotel.stars }).map((_, i) => (
                    <Star key={i} className="w-2.5 h-2.5 text-[#C9A84C] fill-[#C9A84C]" />
                  ))}
                </span>
              )}
            </p>
          </div>
          {step !== 'confirming' && (
            <button onClick={onClose} className="text-white/60 hover:text-white flex-shrink-0 p-1">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Stay strip */}
        <div className="bg-[#F5F0E8] border-b border-gray-100 px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 flex-shrink-0">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#C9A84C]" />
            {fmt(checkIn)} → {fmt(checkOut)} · {nights} night{nights > 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[#C9A84C]" />
            {adults} adult{adults > 1 ? 's' : ''} · {rooms} room{rooms > 1 ? 's' : ''}
          </span>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* ─ STEP 1: Guest Details ─ */}
          {step === 'details' && (
            <>
              <div>
                <h3 className="font-semibold text-[#0B1F3A]">Guest details</h3>
                <p className="text-xs text-gray-400 mt-0.5">Name must match passport of lead guest.</p>
              </div>

              {([
                { label: 'Full Name *',        value: name,  set: setName,  type: 'text',  ph: 'As on passport' },
                { label: 'Email *',            value: email, set: setEmail, type: 'email', ph: 'booking@email.com' },
                { label: 'Phone / WhatsApp *', value: phone, set: setPhone, type: 'tel',   ph: '+44 7...' },
              ] as const).map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
                  <input
                    type={f.type}
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.ph}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]"
                  />
                </div>
              ))}

              {/* Price box */}
              <div className="bg-[#F5F0E8] rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Per night</span>
                  <span>{hotel.pricePerNight.currency} {hotel.pricePerNight.amount.toLocaleString()}</span>
                </div>
                <div className="text-gray-500">× {nights} night{nights > 1 ? 's' : ''}</div>
                {hotel.roomType && <div className="flex justify-between text-gray-500"><span>Room</span><span>{hotel.roomType}</span></div>}
                {hotel.mealPlan && <div className="flex justify-between text-gray-500"><span>Board</span><span>{hotel.mealPlan}</span></div>}
                {hotel.isRefundable && (
                  <div className="flex items-center gap-1.5 text-green-600 text-xs">
                    <Shield className="w-3 h-3" /> Free cancellation available
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-[#0B1F3A]">
                  <span>Total</span>
                  <span className="text-lg">{currency} {total.toLocaleString()}</span>
                </div>
              </div>

              {error && <p className="text-red-600 text-xs bg-red-50 rounded-xl p-3">{error}</p>}

              <button
                onClick={() => { if (validate()) setStep('payment') }}
                className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-3.5 rounded-xl hover:bg-[#d4b45f] transition-colors flex items-center justify-center gap-2"
              >
                Continue to Payment <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* ─ STEP 2: Payment ─ */}
          {step === 'payment' && (
            <>
              <button onClick={() => setStep('details')} className="text-xs text-gray-400 hover:text-gray-600">
                ← Back to details
              </button>

              <div className="bg-[#0B1F3A] rounded-xl p-4 flex justify-between items-center">
                <div>
                  <p className="text-white/60 text-xs">Booking total</p>
                  <p className="text-[#C9A84C] font-bold text-xl">{currency} {total.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/60 text-xs">{hotel.name}</p>
                  <p className="text-white/40 text-xs">{fmt(checkIn)} – {fmt(checkOut)}</p>
                </div>
              </div>

              <PaymentForm
                txRef={txRef}
                amount={total}
                currency={currency}
                customerEmail={email}
                customerName={name}
                customerPhone={phone}
                bookingReference={bookRef}
                onSuccess={handlePaymentSuccess}
                onError={e => setError(e)}
              />

              {error && <p className="text-red-600 text-xs bg-red-50 rounded-xl p-3">{error}</p>}
            </>
          )}

          {/* ─ Confirming ─ */}
          {step === 'confirming' && (
            <div className="flex flex-col items-center justify-center py-14 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-[#C9A84C]" />
              <div className="text-center">
                <p className="font-semibold text-[#0B1F3A]">Payment received!</p>
                <p className="text-gray-500 text-sm mt-1">Confirming with Hotelbeds…</p>
                <p className="text-gray-400 text-xs mt-1">Please do not close this window.</p>
              </div>
            </div>
          )}

          {/* ─ STEP 3: Confirmed ─ */}
          {step === 'confirmed' && (
            <div className="text-center space-y-4 py-2">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-9 h-9 text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-[#0B1F3A] text-xl">Booking Confirmed!</h3>
                <p className="text-gray-400 text-sm mt-1">Confirmation sent to <strong>{email}</strong></p>
              </div>

              <div className="bg-[#F5F0E8] rounded-xl p-4 text-sm text-left space-y-2.5">
                {[
                  { label: 'Walz Reference', value: walzRef, mono: true,  xs: false },
                  { label: 'Supplier Ref',   value: hbRef,   mono: true,  xs: true  },
                  { label: 'Hotel',          value: hotel.name, mono: false, xs: false },
                  { label: 'Check-in',       value: fmt(checkIn), mono: false, xs: false },
                  { label: 'Check-out',      value: fmt(checkOut), mono: false, xs: false },
                  { label: 'Guests',         value: `${adults} adult${adults > 1 ? 's' : ''} · ${rooms} room${rooms > 1 ? 's' : ''}`, mono: false, xs: false },
                ].map(r => (
                  <div key={r.label} className="flex justify-between gap-4 items-start">
                    <span className="text-gray-500 flex-shrink-0">{r.label}</span>
                    <span className={`text-right font-medium ${r.mono ? 'font-mono' : ''} ${r.xs ? 'text-xs text-gray-500' : 'text-[#0B1F3A]'}`}>
                      {r.value}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-gray-200 pt-2.5">
                  <span className="font-bold text-[#0B1F3A]">Total Paid</span>
                  <span className="font-bold text-green-600">{currency} {total.toLocaleString()}</span>
                </div>
              </div>

              <a
                href={`/hotels/voucher?ref=${walzRef}`}
                target="_blank"
                rel="noreferrer"
                className="block w-full bg-[#0B1F3A] text-white font-bold py-3 rounded-xl hover:bg-[#1a3358] transition-colors text-sm"
              >
                View & Download Voucher
              </a>
              <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 w-full">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
