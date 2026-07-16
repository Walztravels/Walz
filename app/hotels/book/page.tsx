'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import {
  Star, MapPin, Shield, Coffee, Utensils, Calendar, Users,
  ChevronLeft, ChevronRight, CheckCircle, Loader2, X, AlertCircle,
} from 'lucide-react'
import { PaymentForm } from '@/components/booking/PaymentForm'
import { generateBookingReference } from '@/lib/utils'
import { formatPrice, cn } from '@/lib/utils'
import type { HotelResult } from '@/types/booking'
import type { HotelSearchMeta } from '@/components/search/HotelSearchForm'

export const dynamic = 'force-dynamic'

// ─── helpers ─────────────────────────────────────────────────────────────────

function mealLabel(plan?: string) {
  if (!plan) return 'Room Only'
  const p = plan.toLowerCase()
  if (p.includes('all inclusive'))                  return 'All Inclusive'
  if (p.includes('full board'))                     return 'Full Board'
  if (p.includes('half board'))                     return 'Half Board'
  if (p.includes('breakfast') || p.includes('bb')) return 'Breakfast Included'
  return plan
}
function ratingLabel(r: number) {
  if (r >= 9) return 'Exceptional'
  if (r >= 8) return 'Superb'
  if (r >= 7) return 'Very Good'
  if (r >= 6) return 'Good'
  return 'Pleasant'
}
function fmtDate(d: string) {
  return d ? new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : ''
}
function fmtShort(d: string) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
}

// ─── photo gallery ────────────────────────────────────────────────────────────

function Gallery({ images, name }: { images: string[]; name: string }) {
  const [main, setMain] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const FALLBACK = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80'
  const safe = (i: number) => images[i] ?? FALLBACK

  return (
    <>
      {/* Gallery grid */}
      <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[340px] sm:h-[420px] rounded-2xl overflow-hidden">
        {/* Main image */}
        <div className="col-span-4 sm:col-span-2 row-span-2 relative overflow-hidden group cursor-pointer bg-walz-off-white"
          onClick={() => setLightbox(main)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={safe(main)} alt={name} onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK }}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
        </div>
        {/* Thumbnails (up to 4) */}
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={cn('hidden sm:block relative overflow-hidden cursor-pointer group bg-walz-off-white', images.length <= i && 'invisible')}
            onClick={() => { if (images[i]) { setMain(i); setLightbox(i) } }}>
            {images[i] && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={safe(i)} alt={`${name} ${i + 1}`}
                  onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK }}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                {i === 4 && images.length > 5 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white font-bold text-sm">+{images.length - 5} photos</span>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {/* Mobile dot nav */}
        <div className="sm:hidden col-span-4 flex justify-center gap-1.5 absolute bottom-3 left-0 right-0">
          {images.slice(0, 5).map((_, i) => (
            <button key={i} onClick={() => setMain(i)}
              className={cn('w-2 h-2 rounded-full transition-colors', i === main ? 'bg-walz-gold' : 'bg-white/60')} />
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(null)}>
            <X className="w-7 h-7" />
          </button>
          <button className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 bg-black/40 rounded-full"
            onClick={e => { e.stopPropagation(); setLightbox(l => Math.max(0, (l ?? 0) - 1)) }}>
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 bg-black/40 rounded-full"
            onClick={e => { e.stopPropagation(); setLightbox(l => Math.min(images.length - 1, (l ?? 0) + 1)) }}>
            <ChevronRight className="w-6 h-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={safe(lightbox)} alt={name} onClick={e => e.stopPropagation()}
            onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK }}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl" />
          <p className="absolute bottom-4 left-0 right-0 text-center text-white/50 text-sm">
            {lightbox + 1} / {images.length}
          </p>
        </div>
      )}
    </>
  )
}

// ─── booking panel ────────────────────────────────────────────────────────────

type Step = 'details' | 'payment' | 'confirming' | 'confirmed'

function BookingPanel({ hotel, meta, nights }: { hotel: HotelResult; meta: HotelSearchMeta; nights: number }) {
  const [step,         setStep]        = useState<Step>('details')
  const [name,         setName]        = useState('')
  const [email,        setEmail]       = useState('')
  const [phone,        setPhone]       = useState('')
  const [error,        setError]       = useState<string | null>(null)
  const [walzRef,      setWalzRef]     = useState('')
  const [hbRef,        setHbRef]       = useState('')
  const [rateComments, setRateComments] = useState<string[]>([])

  const total    = hotel.totalPrice.amount
  const currency = hotel.totalPrice.currency
  const bookRef  = generateBookingReference()
  const txRef    = `WALZ-HTL-${bookRef}`

  useEffect(() => {
    if (!hotel.rateCommentsId) return
    fetch(`/api/hotelbeds/ratecomments?id=${encodeURIComponent(hotel.rateCommentsId)}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.comments)) setRateComments(d.comments.map((c: any) => c.description ?? c).filter(Boolean)) })
      .catch(() => {})
  }, [hotel.rateCommentsId])

  function validate() {
    if (!name.trim())                                 { setError('Please enter your full name.'); return false }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email.'); return false }
    if (!phone.trim())                                { setError('Please enter your phone number.'); return false }
    setError(null); return true
  }

  async function handlePaymentSuccess(transactionId: string | number, gateway: 'flutterwave' | 'stripe') {
    setStep('confirming')
    setError(null)
    try {
      const res = await fetch('/api/hotels/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateKey: hotel.rateKey || hotel.id,
          rateType: 'BOOKABLE',
          hotelCode: hotel.hotelCode,
          hotelName: hotel.name,
          hotelAddress: hotel.hotelAddress ?? [hotel.address.lines[0], hotel.address.city, hotel.address.country].filter(Boolean).join(', '),
          rateCommentsId:      hotel.rateCommentsId ?? null,
          destinationTimezone: hotel.destinationTimezone ?? 'UTC',
          checkIn: meta.checkIn, checkOut: meta.checkOut,
          adults: meta.adults, rooms: meta.rooms,
          children: meta.children ?? 0,
          childAges: meta.childAges ?? [],
          holderName: name, holderEmail: email, holderPhone: phone,
          totalAmount: total, currency,
          txRef, paymentGateway: gateway, transactionId,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Booking failed')
      setWalzRef(data.walzRef)
      setHbRef(data.hotelbedsRef)
      setStep('confirmed')
    } catch (e: any) {
      setError(`Payment received but booking failed — contact us with ref: ${txRef}. Error: ${e.message}`)
      setStep('payment')
    }
  }

  // ── details step ───────────────────────────────────────────────────────────
  if (step === 'details') return (
    <div className="space-y-5">
      <h3 className="font-display font-bold text-walz-deep-navy text-lg">Your details</h3>
      <p className="text-sm text-walz-muted -mt-3">Name must match the lead guest's passport.</p>

      {[
        { label: 'Full Name', value: name,  set: setName,  type: 'text',  ph: 'As on passport' },
        { label: 'Email',     value: email, set: setEmail, type: 'email', ph: 'Confirmation sent here' },
        { label: 'Phone / WhatsApp', value: phone, set: setPhone, type: 'tel', ph: '+44 7...' },
      ].map(f => (
        <div key={f.label}>
          <label className="block text-xs font-semibold text-walz-muted uppercase tracking-wide mb-1.5">{f.label} *</label>
          <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph}
            className="w-full border border-walz-border rounded-xl px-4 py-3 text-sm text-walz-deep-navy outline-none focus:border-walz-gold focus:ring-1 focus:ring-walz-gold/30" />
        </div>
      ))}

      {/* Price summary */}
      <div className="bg-walz-off-white border border-walz-border rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between text-walz-muted">
          <span>{formatPrice(hotel.pricePerNight.amount, currency)} × {nights} night{nights !== 1 ? 's' : ''}</span>
          <span>{formatPrice(hotel.totalPrice.amount, currency)}</span>
        </div>
        {hotel.roomType && (
          <div className="flex justify-between text-walz-muted">
            <span>Room type</span><span className="text-right max-w-[55%] truncate">{hotel.roomType}</span>
          </div>
        )}
        <div className="flex justify-between text-walz-muted">
          <span>Board</span><span>{mealLabel(hotel.mealPlan)}</span>
        </div>
        {hotel.isRefundable && (
          <div className="flex items-center gap-1.5 text-walz-success text-xs font-medium">
            <Shield className="w-3 h-3" /> Free cancellation available
          </div>
        )}
        <div className="border-t border-walz-border pt-2 flex justify-between font-bold text-walz-deep-navy">
          <span>Total</span>
          <span className="text-walz-gold text-lg">{formatPrice(total, currency)}</span>
        </div>
      </div>

      {/* Cert 3.7 — rate comments mandatory before booking confirmation */}
      {rateComments.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-semibold mb-2">Important Rate Conditions</p>
          <ul className="space-y-1 list-disc list-inside">
            {rateComments.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      {error && <p className="text-walz-error text-xs bg-red-50 border border-red-100 rounded-xl p-3">{error}</p>}

      <button onClick={() => { if (validate()) setStep('payment') }}
        className="w-full bg-walz-gold hover:bg-walz-gold-light text-walz-deep-navy font-bold py-4 rounded-xl text-base transition-colors">
        Continue to Payment →
      </button>
      <p className="text-center text-xs text-walz-muted">Secure booking · No hidden fees</p>
    </div>
  )

  // ── payment step ───────────────────────────────────────────────────────────
  if (step === 'payment') return (
    <div className="space-y-4">
      <button onClick={() => setStep('details')} className="flex items-center gap-1 text-sm text-walz-muted hover:text-walz-gold">
        <ChevronLeft className="w-4 h-4" /> Back to details
      </button>
      <div className="bg-walz-deep-navy rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-walz-muted text-xs">Total to pay</p>
          <p className="text-walz-gold font-bold text-2xl">{formatPrice(total, currency)}</p>
        </div>
        <div className="text-right">
          <p className="text-white/70 text-xs line-clamp-1 max-w-[120px]">{hotel.name}</p>
          <p className="text-white/40 text-xs">{fmtShort(meta.checkIn)} – {fmtShort(meta.checkOut)}</p>
        </div>
      </div>
      <PaymentForm txRef={txRef} amount={total} currency={currency}
        customerEmail={email} customerName={name} customerPhone={phone}
        bookingReference={bookRef}
        onSuccess={handlePaymentSuccess}
        onError={e => setError(e)} />
      {error && <p className="text-walz-error text-xs bg-red-50 rounded-xl p-3">{error}</p>}
    </div>
  )

  // ── confirming ─────────────────────────────────────────────────────────────
  if (step === 'confirming') return (
    <div className="flex flex-col items-center justify-center py-14 gap-4">
      <Loader2 className="w-12 h-12 animate-spin text-walz-gold" />
      <div className="text-center">
        <p className="font-display font-bold text-walz-deep-navy text-lg">Payment received!</p>
        <p className="text-walz-muted text-sm mt-1">Confirming your reservation…</p>
        <p className="text-walz-muted/60 text-xs mt-1">Please do not close this page.</p>
      </div>
    </div>
  )

  // ── confirmed ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle className="w-9 h-9 text-walz-success" />
      </div>
      <div>
        <h3 className="font-display font-bold text-walz-deep-navy text-2xl">Booking Confirmed!</h3>
        <p className="text-walz-muted text-sm mt-1">Confirmation sent to <strong className="text-walz-deep-navy">{email}</strong></p>
      </div>

      <div className="bg-walz-off-white border border-walz-border rounded-xl p-4 text-sm text-left space-y-2.5">
        {[
          { label: 'Walz Reference', value: walzRef, bold: true },
          { label: 'Supplier Ref',   value: hbRef,   bold: false, small: true },
          { label: 'Hotel',          value: hotel.name },
          { label: 'Check-in',       value: fmtDate(meta.checkIn) },
          { label: 'Check-out',      value: fmtDate(meta.checkOut) },
          { label: 'Guests',         value: `${meta.adults} adult${meta.adults !== 1 ? 's' : ''} · ${meta.rooms} room${meta.rooms !== 1 ? 's' : ''}` },
        ].map(r => (
          <div key={r.label} className="flex justify-between gap-4">
            <span className="text-walz-muted flex-shrink-0">{r.label}</span>
            <span className={cn('text-right font-medium text-walz-deep-navy', r.small && 'text-xs text-walz-muted font-mono')}>{r.value}</span>
          </div>
        ))}
        <div className="border-t border-walz-border pt-2.5 flex justify-between font-bold">
          <span className="text-walz-deep-navy">Total Paid</span>
          <span className="text-walz-success">{formatPrice(total, currency)}</span>
        </div>
      </div>

      <a href={`/hotels/voucher?ref=${walzRef}`} target="_blank" rel="noreferrer"
        className="block w-full bg-walz-deep-navy text-white font-bold py-3.5 rounded-xl hover:bg-walz-navy transition-colors text-sm">
        View & Download Voucher
      </a>
      <a href="/hotels" className="block text-sm text-walz-muted hover:text-walz-gold">← Search more hotels</a>
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

function HotelBookPageContent() {
  const router = useRouter()
  const [hotel, setHotel] = useState<HotelResult | null>(null)
  const [meta,  setMeta]  = useState<HotelSearchMeta>({ checkIn: '', checkOut: '', adults: 2, rooms: 1 })
  const [imgIdx, setImgIdx] = useState(0)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('walz_hotel_booking')
      if (!raw) { router.replace('/hotels'); return }
      const { hotel: h, meta: m } = JSON.parse(raw)
      setHotel(h); setMeta(m)
    } catch {
      router.replace('/hotels')
    }
  }, [router])

  if (!hotel) {
    return (
      <div className="min-h-screen bg-walz-off-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-walz-gold" />
      </div>
    )
  }

  const nights = Math.max(1, Math.ceil(
    (new Date(meta.checkOut).getTime() - new Date(meta.checkIn).getTime()) / 86400000
  ))
  const FALLBACK = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80'

  return (
    <div className="min-h-screen bg-walz-off-white">

      {/* Top breadcrumb bar */}
      <div className="bg-walz-deep-navy border-b border-walz-slate">
        <div className="container-walz py-3 flex items-center gap-2 text-sm">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-walz-muted hover:text-walz-gold transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back to results
          </button>
          <span className="text-walz-slate">·</span>
          <span className="text-walz-muted truncate max-w-[200px]">{hotel.name}</span>
        </div>
      </div>

      <div className="container-walz py-8">

        {/* ── Hotel header ── */}
        <div className="mb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display font-bold text-walz-deep-navy text-3xl leading-tight">{hotel.name}</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={cn('w-4 h-4', i < hotel.stars ? 'text-walz-gold fill-walz-gold' : 'text-walz-border fill-walz-border')} />
                  ))}
                  <span className="text-sm text-walz-muted ml-1">{hotel.stars}-star hotel</span>
                </div>
                {hotel.rating != null && hotel.rating > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="bg-walz-gold text-walz-deep-navy font-bold text-sm px-2 py-0.5 rounded-lg">
                      {hotel.rating.toFixed(1)}
                    </span>
                    <span className="text-sm text-walz-muted">{ratingLabel(hotel.rating)}</span>
                    {hotel.reviewCount && (
                      <span className="text-sm text-walz-muted">· {hotel.reviewCount.toLocaleString()} reviews</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-walz-muted mt-1">
                <MapPin className="w-4 h-4 text-walz-gold flex-shrink-0" />
                {[hotel.address.lines[0], hotel.address.city, hotel.address.country].filter(Boolean).join(', ')}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-walz-muted text-xs">from</p>
              <p className="font-display font-bold text-walz-gold text-3xl">{formatPrice(hotel.pricePerNight.amount, hotel.pricePerNight.currency)}</p>
              <p className="text-walz-muted text-xs">/night · {formatPrice(hotel.totalPrice.amount, hotel.totalPrice.currency)} total</p>
            </div>
          </div>
        </div>

        {/* ── Gallery ── */}
        <div className="mb-8 relative">
          <Gallery images={hotel.images} name={hotel.name} />
        </div>

        {/* ── Two-column layout ── */}
        <div className="flex gap-8 items-start flex-col lg:flex-row">

          {/* LEFT: Hotel info */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Stay summary strip */}
            <div className="bg-walz-deep-navy rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              {[
                { icon: <Calendar className="w-5 h-5 text-walz-gold mx-auto" />, label: 'Check-in',  value: fmtShort(meta.checkIn) },
                { icon: <Calendar className="w-5 h-5 text-walz-gold mx-auto" />, label: 'Check-out', value: fmtShort(meta.checkOut) },
                { icon: <Users    className="w-5 h-5 text-walz-gold mx-auto" />, label: 'Guests',    value: `${meta.adults} adult${meta.adults !== 1 ? 's' : ''}` },
                { icon: <span className="block text-walz-gold font-bold text-lg">{nights}</span>,    label: 'Nights', value: `night${nights !== 1 ? 's' : ''}` },
              ].map(item => (
                <div key={item.label}>
                  {item.icon}
                  <p className="text-walz-muted text-xs mt-1">{item.label}</p>
                  <p className="text-walz-white font-semibold text-sm">{item.value}</p>
                </div>
              ))}
            </div>

            {/* Room details */}
            <div className="bg-white rounded-2xl border border-walz-border p-6">
              <h2 className="font-display font-bold text-walz-deep-navy text-xl mb-4">Room Details</h2>
              <div className="space-y-3">
                {hotel.roomType && (
                  <div className="flex items-start gap-3 pb-3 border-b border-walz-border">
                    <div className="w-10 h-10 bg-walz-off-white rounded-xl flex items-center justify-center flex-shrink-0">
                      <span className="text-xl">🛏</span>
                    </div>
                    <div>
                      <p className="font-semibold text-walz-deep-navy">{hotel.roomType}</p>
                      <p className="text-sm text-walz-muted">Room type</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3 pb-3 border-b border-walz-border">
                  <div className="w-10 h-10 bg-walz-off-white rounded-xl flex items-center justify-center flex-shrink-0">
                    {hotel.mealPlan?.toLowerCase().includes('breakfast') ? (
                      <Coffee className="w-5 h-5 text-walz-gold" />
                    ) : (
                      <Utensils className="w-5 h-5 text-walz-gold" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-walz-deep-navy">{mealLabel(hotel.mealPlan)}</p>
                    <p className="text-sm text-walz-muted">Meal plan included</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-walz-off-white rounded-xl flex items-center justify-center flex-shrink-0">
                    <Shield className={cn('w-5 h-5', hotel.isRefundable ? 'text-walz-success' : 'text-walz-muted')} />
                  </div>
                  <div>
                    <p className={cn('font-semibold', hotel.isRefundable ? 'text-walz-success' : 'text-walz-deep-navy')}>
                      {hotel.isRefundable ? 'Free Cancellation' : 'Non-refundable'}
                    </p>
                    <p className="text-sm text-walz-muted">{hotel.cancellationPolicy ?? (hotel.isRefundable ? 'Cancel any time for free' : 'No refund if cancelled')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* What's included */}
            <div className="bg-white rounded-2xl border border-walz-border p-6">
              <h2 className="font-display font-bold text-walz-deep-navy text-xl mb-4">What's Included</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: '✓', text: `${nights} night${nights !== 1 ? 's' : ''} accommodation`, ok: true },
                  { icon: '✓', text: mealLabel(hotel.mealPlan), ok: true },
                  { icon: '✓', text: hotel.isRefundable ? 'Free cancellation' : 'Confirmed booking', ok: true },
                  { icon: '✓', text: 'Instant confirmation', ok: true },
                  { icon: '✓', text: '24/7 Walz support', ok: true },
                  { icon: '✓', text: 'E-voucher on booking', ok: true },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm">
                    <span className="w-5 h-5 rounded-full bg-walz-success/10 text-walz-success flex items-center justify-center text-xs font-bold flex-shrink-0">✓</span>
                    <span className="text-walz-deep-navy">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Price breakdown */}
            <div className="bg-white rounded-2xl border border-walz-border p-6">
              <h2 className="font-display font-bold text-walz-deep-navy text-xl mb-4">Price Breakdown</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-walz-muted">
                  <span>Price per night</span>
                  <span>{formatPrice(hotel.pricePerNight.amount, hotel.pricePerNight.currency)}</span>
                </div>
                <div className="flex justify-between text-walz-muted">
                  <span>× {nights} night{nights !== 1 ? 's' : ''}</span>
                  <span>{formatPrice(hotel.totalPrice.amount, hotel.totalPrice.currency)}</span>
                </div>
                <div className="flex justify-between text-walz-muted">
                  <span>{meta.rooms} room{meta.rooms !== 1 ? 's' : ''}</span>
                  <span>{meta.rooms > 1 ? 'rate per room' : 'included'}</span>
                </div>
                <div className="border-t border-walz-border pt-3 flex justify-between font-bold text-walz-deep-navy text-base">
                  <span>Total (incl. taxes & fees)</span>
                  <span className="text-walz-gold text-xl">{formatPrice(hotel.totalPrice.amount, hotel.totalPrice.currency)}</span>
                </div>
              </div>
            </div>

            {/* Photo thumbnails (mobile) */}
            {hotel.images.length > 1 && (
              <div className="lg:hidden">
                <h2 className="font-display font-bold text-walz-deep-navy text-xl mb-3">Photos</h2>
                <div className="grid grid-cols-3 gap-2">
                  {hotel.images.slice(0, 6).map((img, i) => (
                    <div key={i} className="aspect-square rounded-xl overflow-hidden bg-walz-off-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={`${hotel.name} ${i + 1}`}
                        onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK }}
                        className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Booking panel (sticky) */}
          <div className="w-full lg:w-80 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-walz-border shadow-card sticky top-4 p-6">
              {/* Price header */}
              <div className="pb-4 border-b border-walz-border mb-5">
                <div className="flex items-baseline gap-1">
                  <span className="font-display font-bold text-walz-gold text-3xl">
                    {formatPrice(hotel.pricePerNight.amount, hotel.pricePerNight.currency)}
                  </span>
                  <span className="text-walz-muted text-sm">/night</span>
                </div>
                <p className="text-xs text-walz-muted mt-0.5">
                  {formatPrice(hotel.totalPrice.amount, hotel.totalPrice.currency)} total · {nights} night{nights !== 1 ? 's' : ''}
                </p>
                {hotel.isRefundable && (
                  <div className="flex items-center gap-1 text-walz-success text-xs font-semibold mt-1">
                    <Shield className="w-3 h-3" /> Free cancellation
                  </div>
                )}
              </div>

              <BookingPanel hotel={hotel} meta={meta} nights={nights} />
            </div>

            {/* Trust badges */}
            <div className="mt-4 bg-white rounded-2xl border border-walz-border p-4">
              <div className="space-y-2.5 text-xs text-walz-muted">
                {[
                  { icon: '🔒', text: 'Payments secured by Stripe & Flutterwave' },
                  { icon: '📋', text: 'Instant confirmation from Hotelbeds' },
                  { icon: '📞', text: '24/7 support from Walz Travels' },
                  { icon: '📧', text: 'Voucher emailed immediately on booking' },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span>{b.icon}</span><span>{b.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HotelBookPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-walz-off-white flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-walz-gold" /></div>}>
      <HotelBookPageContent />
    </Suspense>
  )
}
