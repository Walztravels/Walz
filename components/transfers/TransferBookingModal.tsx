'use client'

import { useState } from 'react'
import { X, Car, ChevronRight, Loader2, CheckCircle, ArrowRight, Users } from 'lucide-react'
import { PaymentForm } from '@/components/booking/PaymentForm'
import { generateBookingReference } from '@/lib/utils'
import type { TransferResult } from './TransferResultCard'
import type { TransferSearchParams } from './TransferSearchForm'

type Step = 'details' | 'payment' | 'confirming' | 'confirmed'

interface Props {
  transfer:    TransferResult
  search:      TransferSearchParams
  onClose:     () => void
}

export function TransferBookingModal({ transfer, search, onClose }: Props) {
  const [step,    setStep]    = useState<Step>('details')
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [phone,   setPhone]   = useState('')
  const [country, setCountry] = useState('GB')
  const [error,   setError]   = useState<string | null>(null)
  const [walzRef, setWalzRef] = useState('')
  const [hbRef,   setHbRef]   = useState('')

  const bookRef = generateBookingReference()
  const txRef   = `WALZ-TRF-${bookRef}`
  const total   = transfer.price
  const currency = transfer.currency

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const fmtPrice = new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 0 }).format(total)

  function validate() {
    if (!name.trim())  { setError('Please enter your full name.'); return false }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email.'); return false
    }
    setError(null); return true
  }

  async function handlePaymentSuccess(transactionId: string | number, gateway: 'flutterwave' | 'stripe') {
    setStep('confirming')
    setError(null)
    try {
      const res = await fetch('/api/hotelbeds/transfers/book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferKey:   transfer.transferKey,
          fromCode:      search.fromCode,
          fromType:      'IATA',
          toCode:        search.toCode,
          toType:        'IATA',
          fromDate:      search.fromDate,
          fromTime:      search.fromTime,
          adults:        search.adults,
          children:      search.children,
          holderName:    name,
          holderEmail:   email,
          holderPhone:   phone || null,
          holderCountry: country,
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
      setHbRef(data.hotelbedsRef ?? '')
      setStep('confirmed')
    } catch (e: any) {
      setError(`Payment received but booking failed. Contact us with ref: ${txRef}. Error: ${e.message}`)
      setStep('payment')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={step === 'confirmed' ? onClose : undefined} />

      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="bg-[#0B1F3A] px-5 py-4 rounded-t-3xl sm:rounded-t-2xl flex items-start gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center flex-shrink-0">
            <Car className="w-5 h-5 text-[#C9A84C]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold leading-snug line-clamp-1">{transfer.vehicleName}</p>
            <p className="text-white/50 text-xs mt-0.5 flex items-center gap-1">
              {search.fromName}
              <ArrowRight className="w-3 h-3 flex-shrink-0" />
              {search.toName}
            </p>
          </div>
          {step !== 'confirming' && (
            <button onClick={onClose} className="text-white/60 hover:text-white flex-shrink-0 p-1">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Trip strip */}
        <div className="bg-[#F5F0E8] border-b border-gray-100 px-5 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 flex-shrink-0">
          <span>{fmtDate(search.fromDate)} at {search.fromTime}</span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3 text-[#C9A84C]" />
            {search.adults} adult{search.adults !== 1 ? 's' : ''}
            {search.children > 0 ? `, ${search.children} child${search.children !== 1 ? 'ren' : ''}` : ''}
          </span>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* ─ STEP 1: Passenger details ─ */}
          {step === 'details' && (
            <>
              <div>
                <h3 className="font-semibold text-[#0B1F3A]">Lead passenger details</h3>
                <p className="text-xs text-gray-400 mt-0.5">Name as on passport of lead traveller.</p>
              </div>

              {([
                { label: 'Full Name *',      value: name,    set: setName,    type: 'text',  ph: 'As on passport' },
                { label: 'Email *',          value: email,   set: setEmail,   type: 'email', ph: 'booking@email.com' },
                { label: 'Phone (optional)', value: phone,   set: setPhone,   type: 'tel',   ph: '+44 7…' },
              ] as const).map(f => (
                <div key={f.label} className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
                  <input
                    type={f.type} value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.ph}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]"
                  />
                </div>
              ))}

              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                <select
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C] bg-white"
                >
                  <option value="GB">United Kingdom</option>
                  <option value="NG">Nigeria</option>
                  <option value="GH">Ghana</option>
                  <option value="CA">Canada</option>
                  <option value="US">United States</option>
                  <option value="AE">UAE</option>
                  <option value="ZA">South Africa</option>
                  <option value="KE">Kenya</option>
                  <option value="QA">Qatar</option>
                  <option value="SG">Singapore</option>
                </select>
              </div>

              {/* Price box */}
              <div className="bg-[#F5F0E8] rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>{transfer.vehicleName}</span>
                  <span>{transfer.transferType}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-[#0B1F3A]">
                  <span>Total</span>
                  <span className="text-lg">{fmtPrice}</span>
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
                  <p className="text-white/60 text-xs">Transfer total</p>
                  <p className="text-[#C9A84C] font-bold text-xl">{fmtPrice}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/60 text-xs">{transfer.vehicleName}</p>
                  <p className="text-white/40 text-xs">{fmtDate(search.fromDate)}</p>
                </div>
              </div>

              <PaymentForm
                txRef={txRef}
                amount={total}
                currency={currency}
                customerEmail={email}
                customerName={name}
                customerPhone={phone || undefined}
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
                <p className="text-gray-500 text-sm mt-1">Confirming your transfer…</p>
                <p className="text-gray-400 text-xs mt-1">Please do not close this window.</p>
              </div>
            </div>
          )}

          {/* ─ Confirmed ─ */}
          {step === 'confirmed' && (
            <div className="text-center space-y-4 py-2">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-9 h-9 text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-[#0B1F3A] text-xl">Transfer Booked!</h3>
                <p className="text-gray-400 text-sm mt-1">Confirmation sent to <strong>{email}</strong></p>
              </div>

              <div className="bg-[#F5F0E8] rounded-xl p-4 text-sm text-left space-y-2.5">
                {[
                  { label: 'Walz Reference', value: walzRef,              mono: true },
                  ...(hbRef ? [{ label: 'Supplier Ref', value: hbRef,   mono: true }] : []),
                  { label: 'Vehicle',        value: transfer.vehicleName, mono: false },
                  { label: 'Pickup',         value: search.fromName,      mono: false },
                  { label: 'Drop-off',       value: search.toName,        mono: false },
                  { label: 'Date',           value: `${fmtDate(search.fromDate)} at ${search.fromTime}`, mono: false },
                  { label: 'Passengers',     value: `${search.adults} adult${search.adults !== 1 ? 's' : ''}${search.children > 0 ? `, ${search.children} child${search.children !== 1 ? 'ren' : ''}` : ''}`, mono: false },
                ].map(r => (
                  <div key={r.label} className="flex justify-between gap-4 items-start">
                    <span className="text-gray-500 flex-shrink-0">{r.label}</span>
                    <span className={`text-right font-medium text-[#0B1F3A] ${r.mono ? 'font-mono text-xs' : ''}`}>{r.value}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-gray-200 pt-2.5">
                  <span className="font-bold text-[#0B1F3A]">Total Paid</span>
                  <span className="font-bold text-green-600">{fmtPrice}</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full bg-[#0B1F3A] text-white font-bold py-3 rounded-xl hover:bg-[#1a3358] transition-colors text-sm"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
