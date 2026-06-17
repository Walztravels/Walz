'use client'

import { useState } from 'react'
import { X, Clock, ChevronRight, Loader2, CheckCircle, Users, Calendar } from 'lucide-react'
import { PaymentForm } from '@/components/booking/PaymentForm'
import { generateBookingReference } from '@/lib/utils'
import type { ActivityResult, ActivityModality } from './ActivityResultCard'

type Step = 'modality' | 'details' | 'payment' | 'confirming' | 'confirmed'

interface Props {
  activity:    ActivityResult
  serviceDate: string
  adults:      number
  children:    number
  onClose:     () => void
}

function fmt(amount?: string | null, currency?: string | null) {
  if (!amount) return null
  const n = parseFloat(amount)
  if (isNaN(n)) return null
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency ?? 'USD', minimumFractionDigits: 0 }).format(n)
}

export function ActivityBookingModal({ activity, serviceDate, adults, children, onClose }: Props) {
  const [step,      setStep]      = useState<Step>(activity.modalities?.length === 1 ? 'details' : 'modality')
  const [modality,  setModality]  = useState<ActivityModality | null>(
    activity.modalities?.length === 1 ? activity.modalities[0] : null
  )
  const [name,      setName]      = useState('')
  const [email,     setEmail]     = useState('')
  const [phone,     setPhone]     = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [walzRef,   setWalzRef]   = useState('')
  const [hbRef,     setHbRef]     = useState('')

  const bookRef = generateBookingReference()
  const txRef   = `WALZ-ACT-${bookRef}`
  const pax     = adults + children

  const total    = modality?.amountFrom ? Math.round(parseFloat(modality.amountFrom) * pax * 100) / 100 : 0
  const currency = modality?.currency ?? 'GBP'

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

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
      const res = await fetch('/api/hotelbeds/activities/book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityCode:   activity.code,
          modalityCode:   modality!.code,
          serviceDate,
          adults,
          children,
          holderName:     name,
          holderEmail:    email,
          holderPhone:    phone || null,
          totalAmount:    total,
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
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold leading-snug line-clamp-1">{activity.name}</p>
            <p className="text-white/50 text-xs mt-0.5 flex items-center gap-1.5">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              {fmtDate(serviceDate)}
              <span className="text-white/30">·</span>
              <Users className="w-3 h-3 flex-shrink-0" />
              {adults} adult{adults !== 1 ? 's' : ''}{children > 0 ? `, ${children} child${children !== 1 ? 'ren' : ''}` : ''}
            </p>
          </div>
          {step !== 'confirming' && (
            <button onClick={onClose} className="text-white/60 hover:text-white flex-shrink-0 p-1">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* ─ STEP: Modality picker ─ */}
          {step === 'modality' && (
            <>
              <div>
                <h3 className="font-semibold text-[#0B1F3A]">Choose your option</h3>
                <p className="text-xs text-gray-400 mt-0.5">Select the experience that suits your group.</p>
              </div>
              <div className="space-y-2.5">
                {(activity.modalities ?? []).map(m => (
                  <button
                    key={m.code}
                    type="button"
                    onClick={() => { setModality(m); setStep('details') }}
                    className="w-full text-left border border-walz-border rounded-xl p-4 hover:border-[#C9A84C] hover:bg-[#C9A84C]/5 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#0B1F3A] text-sm group-hover:text-[#C9A84C] transition-colors">{m.name}</p>
                        {m.duration?.value && (
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {m.duration.value} {m.duration.metric ?? 'min'}
                          </p>
                        )}
                      </div>
                      {m.amountFrom && (
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] text-gray-400">From</p>
                          <p className="font-bold text-[#C9A84C]">{fmt(m.amountFrom, m.currency)}</p>
                          <p className="text-[10px] text-gray-400">per person</p>
                        </div>
                      )}
                    </div>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 group-hover:text-[#C9A84C]" />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ─ STEP: Guest details ─ */}
          {step === 'details' && modality && (
            <>
              {activity.modalities && activity.modalities.length > 1 && (
                <button onClick={() => setStep('modality')} className="text-xs text-gray-400 hover:text-gray-600">
                  ← Change option
                </button>
              )}

              <div className="bg-[#F5F0E8] rounded-xl p-4 space-y-1.5 text-sm">
                <p className="font-semibold text-[#0B1F3A]">{modality.name}</p>
                {modality.duration?.value && (
                  <p className="text-gray-500 flex items-center gap-1 text-xs">
                    <Clock className="w-3 h-3" /> {modality.duration.value} {modality.duration.metric ?? 'min'}
                  </p>
                )}
                {total > 0 && (
                  <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-[#0B1F3A]">
                    <span>Total ({pax} person{pax !== 1 ? 's' : ''})</span>
                    <span className="text-lg">{fmt(String(total), currency)}</span>
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-[#0B1F3A] mb-3">Lead guest details</h3>
                {([
                  { label: 'Full Name *',        value: name,  set: setName,  type: 'text',  ph: 'As on passport' },
                  { label: 'Email *',            value: email, set: setEmail, type: 'email', ph: 'booking@email.com' },
                  { label: 'Phone (optional)',   value: phone, set: setPhone, type: 'tel',   ph: '+44 7…' },
                ] as const).map(f => (
                  <div key={f.label} className="mb-3">
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

          {/* ─ STEP: Payment ─ */}
          {step === 'payment' && modality && (
            <>
              <button onClick={() => setStep('details')} className="text-xs text-gray-400 hover:text-gray-600">
                ← Back to details
              </button>

              {total > 0 && (
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
              )}

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

          {/* ─ Confirmed ─ */}
          {step === 'confirmed' && (
            <div className="text-center space-y-4 py-2">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-9 h-9 text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-[#0B1F3A] text-xl">Activity Booked!</h3>
                <p className="text-gray-400 text-sm mt-1">Confirmation sent to <strong>{email}</strong></p>
              </div>

              <div className="bg-[#F5F0E8] rounded-xl p-4 text-sm text-left space-y-2.5">
                {[
                  { label: 'Walz Reference', value: walzRef,          mono: true },
                  ...(hbRef ? [{ label: 'Supplier Ref', value: hbRef, mono: true }] : []),
                  { label: 'Activity',       value: activity.name,    mono: false },
                  { label: 'Option',         value: modality?.name ?? '', mono: false },
                  { label: 'Date',           value: fmtDate(serviceDate), mono: false },
                  { label: 'Guests',         value: `${adults} adult${adults !== 1 ? 's' : ''}${children > 0 ? `, ${children} child${children !== 1 ? 'ren' : ''}` : ''}`, mono: false },
                ].map(r => (
                  <div key={r.label} className="flex justify-between gap-4 items-start">
                    <span className="text-gray-500 flex-shrink-0">{r.label}</span>
                    <span className={`text-right font-medium text-[#0B1F3A] ${r.mono ? 'font-mono text-xs' : ''}`}>{r.value}</span>
                  </div>
                ))}
                {total > 0 && (
                  <div className="flex justify-between border-t border-gray-200 pt-2.5">
                    <span className="font-bold text-[#0B1F3A]">Total Paid</span>
                    <span className="font-bold text-green-600">{fmt(String(total), currency)}</span>
                  </div>
                )}
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
