'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'

interface Rate {
  rateKey:              string
  rateType:             'BOOKABLE' | 'RECHECK'
  net:                  string
  currency:             string
  rateCommentsId?:      string
  cancellationPolicies?: { amount: string; from: string }[]
  promotions?:          { code: string; name: string }[]
}

interface Props {
  hotel:    { code: number; name: string }
  rate:     Rate
  checkIn:  string
  checkOut: string
  onClose:  () => void
}

export function HotelBookingModal({ hotel, rate, checkIn, checkOut, onClose }: Props) {
  const [step,        setStep]        = useState<'details' | 'confirm' | 'done'>('details')
  const [checkedRate, setCheckedRate] = useState<Rate | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [comments,    setComments]    = useState<string[]>([])
  const [name,        setName]        = useState('')
  const [email,       setEmail]       = useState('')
  const [phone,       setPhone]       = useState('')
  const [walzRef,     setWalzRef]     = useState('')

  async function proceedToConfirm() {
    if (!name || !email) { setError('Name and email required'); return }
    setLoading(true)
    setError(null)

    try {
      let activeRate = rate

      // Cert 2.5 — only call CheckRate for RECHECK rates
      if (rate.rateType === 'RECHECK') {
        const res  = await fetch('/api/hotelbeds/checkrate', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rateKeys: [rate.rateKey] }),
        })
        const data = await res.json()
        activeRate = data.rooms?.[0]?.rates?.[0] ?? rate
        setCheckedRate(activeRate as Rate)
      }

      // Cert 3.9 — fetch rate comments before confirmation
      if (activeRate.rateCommentsId) {
        const cRes  = await fetch(`/api/hotelbeds/ratecomments?id=${activeRate.rateCommentsId}`)
        const cData = await cRes.json()
        setComments(cData.comments?.map((c: any) => c.description?.content).filter(Boolean) ?? [])
      }

      setStep('confirm')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function confirmBooking() {
    setLoading(true)
    setError(null)
    try {
      const activeRate = checkedRate ?? rate
      const res = await fetch('/api/hotelbeds/book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateKey:     activeRate.rateKey,
          holderName:  name,
          holderEmail: email,
          holderPhone: phone,
          checkIn,
          checkOut,
          hotelCode:   hotel.code,
          hotelName:   hotel.name,
          totalNet:    activeRate.net,
          currency:    activeRate.currency,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Booking failed')
      setWalzRef(data.walzRef)
      setStep('done')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        <div className="bg-[#0B1F3A] px-5 py-4 rounded-t-2xl flex items-start justify-between">
          <div>
            <h3 className="text-white font-bold">{hotel.name}</h3>
            <p className="text-white/60 text-xs">{checkIn} → {checkOut}</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {step === 'details' && (
            <>
              {/* Cert 3.8 — cancellation policy before confirmation */}
              {rate.cancellationPolicies && rate.cancellationPolicies.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  <strong>Cancellation policy:</strong> Fee of {rate.currency} {rate.cancellationPolicies[0].amount}{' '}
                  applies from {new Date(rate.cancellationPolicies[0].from).toLocaleDateString('en-GB')}
                </div>
              )}

              {/* Cert 2.7 — promotions */}
              {rate.promotions?.map(p => (
                <div key={p.code} className="bg-green-50 border border-green-200 rounded-xl p-2 text-xs text-green-700">
                  ✓ {p.name}
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full name *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]"
                />
              </div>

              {error && <p className="text-red-600 text-xs">{error}</p>}

              <button
                onClick={proceedToConfirm}
                disabled={loading}
                className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading
                  ? (rate.rateType === 'RECHECK' ? 'Checking rate…' : 'Loading…')
                  : 'Continue'}
              </button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="bg-[#F5F0E8] rounded-xl p-4 text-sm">
                <p className="font-bold text-[#0B1F3A]">{hotel.name}</p>
                <p className="text-gray-600">{checkIn} → {checkOut}</p>
                <p className="text-[#C9A84C] font-bold mt-1">
                  {(checkedRate ?? rate).currency} {(checkedRate ?? rate).net}
                </p>
              </div>

              {/* Cert 3.9 — rate comments must be shown before booking */}
              {comments.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 space-y-1">
                  <strong>Important notes:</strong>
                  {comments.map((c, i) => <p key={i}>• {c}</p>)}
                </div>
              )}

              {error && <p className="text-red-600 text-xs">{error}</p>}

              <button
                onClick={confirmBooking}
                disabled={loading}
                className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Confirming booking…' : 'Confirm & Book'}
              </button>

              <button onClick={() => setStep('details')} className="w-full text-sm text-gray-400 py-2">
                ← Back
              </button>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">✓</span>
              </div>
              <h3 className="font-bold text-[#0B1F3A] text-lg">Booking Confirmed!</h3>
              <p className="text-gray-500 text-sm mt-1">Reference: <strong>{walzRef}</strong></p>
              <a
                href={`/hotels/voucher?ref=${walzRef}`}
                className="block mt-4 bg-[#C9A84C] text-[#0B1F3A] font-bold py-2.5 rounded-xl text-sm text-center"
              >
                Download Voucher
              </a>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
