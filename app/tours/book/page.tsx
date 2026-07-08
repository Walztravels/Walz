'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Check, ChevronRight, ChevronLeft, Calendar, Users, Plus, Minus,
  Star, MapPin, Clock, Shield, Loader2, CheckCircle, AlertCircle,
  CreditCard, Smartphone, MessageSquare, Image as ImageIcon, Coins,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbTour {
  id: string; name: string; slug: string; description: string
  highlights: string; price: number; currency: string
  duration: string; location: string; imageUrl: string | null
}

interface Addon { id: string; name: string; description: string; price: number }

interface Details {
  firstName: string; lastName: string; email: string
  countryCode: string; whatsapp: string; country: string
  requirements: string; message: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ADDONS: Addon[] = [
  { id: 'transfer', name: 'Private Transfer', description: 'Airport or hotel pickup and drop-off included', price: 45 },
  { id: 'photos', name: 'Photography Package', description: 'Professional photographer for the full tour (digital download)', price: 75 },
  { id: 'lunch', name: 'Gourmet Lunch', description: 'Three-course lunch at a top-rated local restaurant', price: 35 },
  { id: 'guide', name: 'Audio Guide Device', description: 'Multilingual audio guide for the entire tour', price: 15 },
]

const COUNTRY_CODES = ['+44', '+1', '+234', '+971', '+61', '+49', '+33', '+91', '+27', '+65', '+60', '+55', '+52']

const COUNTRIES = [
  'United Kingdom', 'United States', 'Nigeria', 'United Arab Emirates', 'Canada', 'Australia',
  'Germany', 'France', 'Spain', 'Italy', 'India', 'China', 'Japan', 'South Africa', 'Ghana',
  'Kenya', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Singapore', 'Malaysia', 'Netherlands', 'Belgium',
  'Sweden', 'Norway', 'Denmark', 'Ireland', 'Portugal', 'Brazil', 'Mexico', 'Other',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function fmtDate(date: string) {
  if (!date) return ''
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  const steps = ['Select Experience', 'Your Details', 'Review & Pay']
  return (
    <div className="flex items-center justify-center">
      {steps.map((label, i) => {
        const num = i + 1
        const active = step === num
        const done = step > num
        return (
          <div key={num} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                ${done ? 'bg-[#C9A84C] text-[#0B1F3A]' : active ? 'bg-[#0B1F3A] text-white' : 'bg-gray-200 text-gray-400'}`}>
                {done ? <Check className="w-4 h-4" /> : num}
              </div>
              <span className={`text-[10px] sm:text-xs mt-1 font-medium whitespace-nowrap hidden sm:block
                ${active ? 'text-[#0B1F3A]' : done ? 'text-[#C9A84C]' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-12 sm:w-20 h-0.5 mb-4 sm:mb-5 mx-1 transition-all ${done ? 'bg-[#C9A84C]' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Select Experience ─────────────────────────────────────────────────

function StepOne({ tour, date, setDate, groupSize, setGroupSize, addons, setAddons, onNext }: {
  tour: DbTour; date: string; setDate: (d: string) => void
  groupSize: number; setGroupSize: (n: number) => void
  addons: string[]; setAddons: (a: string[]) => void
  onNext: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const basePrice = tour.price * groupSize
  const selectedAddons = ADDONS.filter(a => addons.includes(a.id))
  const addonsTotal = selectedAddons.reduce((s, a) => s + a.price * groupSize, 0)
  const total = basePrice + addonsTotal
  const currency = tour.currency

  function toggleAddon(id: string) {
    setAddons(addons.includes(id) ? addons.filter(a => a !== id) : [...addons, id])
  }

  return (
    <div className="lg:grid lg:grid-cols-3 lg:gap-6">
      {/* ── Left column ── */}
      <div className="lg:col-span-2 space-y-4">

        {/* Tour hero card */}
        <div className="relative h-52 sm:h-64 rounded-2xl overflow-hidden bg-gray-100 shadow-sm">
          {tour.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tour.imageUrl} alt={tour.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <ImageIcon className="w-16 h-16" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/80 via-[#0B1F3A]/20 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <h2 className="text-white font-bold text-xl sm:text-2xl leading-tight">{tour.name}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-white/80">
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-[#C9A84C]" />{tour.location}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-[#C9A84C]" />{tour.duration}</span>
              <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />4.9</span>
            </div>
          </div>
        </div>

        {/* Date picker */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-semibold text-[#0B1F3A] mb-3 flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-[#C9A84C]" /> Select Your Date
          </h3>
          <input
            type="date" min={today}
            onChange={(e) => { if (e.target.value) setDate(e.target.value) }}
            onInput={(e) => { const v = (e.target as HTMLInputElement).value; if (v) setDate(v) }}
            onBlur={(e)  => { if (e.target.value) setDate(e.target.value) }}
            className="w-full border-2 border-gray-200 focus:border-[#C9A84C] rounded-xl px-4 py-3 text-sm outline-none transition-colors"
          />
          <p className="text-xs text-gray-400 mt-2">All dates are subject to availability. Our team will confirm within 2 hours.</p>
        </div>

        {/* Group size */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-semibold text-[#0B1F3A] mb-4 flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-[#C9A84C]" /> Group Size
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700">Travellers</p>
              <p className="text-xs text-gray-400 mt-0.5">{fmt(tour.price, currency)} per person</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setGroupSize(Math.max(1, groupSize - 1))}
                className="w-10 h-10 rounded-full border-2 border-gray-200 hover:border-[#C9A84C] hover:text-[#C9A84C] flex items-center justify-center transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-2xl font-bold text-[#0B1F3A] w-8 text-center">{groupSize}</span>
              <button
                onClick={() => setGroupSize(Math.min(20, groupSize + 1))}
                className="w-10 h-10 rounded-full border-2 border-gray-200 hover:border-[#C9A84C] hover:text-[#C9A84C] flex items-center justify-center transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Add-ons */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-semibold text-[#0B1F3A] mb-0.5 text-sm">✨ Enhance Your Experience</h3>
          <p className="text-xs text-gray-400 mb-4">Optional extras — priced per person</p>
          <div className="space-y-3">
            {ADDONS.map((addon) => {
              const selected = addons.includes(addon.id)
              return (
                <div
                  key={addon.id}
                  onClick={() => toggleAddon(addon.id)}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all select-none
                    ${selected ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-gray-100 hover:border-gray-200 bg-gray-50'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-all
                      ${selected ? 'bg-[#C9A84C]' : 'border-2 border-gray-300 bg-white'}`}>
                      {selected && <Check className="w-3 h-3 text-[#0B1F3A]" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#0B1F3A]">{addon.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{addon.description}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[#C9A84C] ml-4 flex-shrink-0">+{fmt(addon.price, currency)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Right: price panel (desktop) ── */}
      <div className="mt-5 lg:mt-0 hidden lg:block">
        <div className="sticky top-24">
          <div className="bg-[#0B1F3A] rounded-2xl p-5 text-white shadow-lg">
            <h3 className="font-bold text-base mb-4">Price Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-white/70">{fmt(tour.price, currency)} × {groupSize} {groupSize === 1 ? 'person' : 'people'}</span>
                <span>{fmt(basePrice, currency)}</span>
              </div>
              {selectedAddons.map(a => (
                <div key={a.id} className="flex justify-between">
                  <span className="text-white/70">{a.name} × {groupSize}</span>
                  <span>{fmt(a.price * groupSize, currency)}</span>
                </div>
              ))}
              {date && (
                <div className="flex justify-between text-white/60 text-xs pt-1 border-t border-white/10">
                  <span>Date</span>
                  <span>{new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              )}
            </div>
            <div className="border-t border-white/20 mt-4 pt-4 flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <span className="text-[#C9A84C] text-2xl font-bold">{fmt(total, currency)}</span>
            </div>
            <button
              onClick={onNext}
              disabled={!date}
              className="w-full mt-4 bg-[#C9A84C] hover:bg-[#d4b45f] disabled:opacity-40 disabled:cursor-not-allowed text-[#0B1F3A] font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
            {!date && <p className="text-xs text-white/40 text-center mt-2">Please select a date to continue</p>}
          </div>
          <div className="mt-4 space-y-2 text-sm text-gray-500">
            <p className="flex items-center gap-2"><Shield className="w-4 h-4 text-[#C9A84C]" /> Free cancellation up to 48 hours</p>
            <p className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-[#C9A84C]" /> Confirmed within 2 hours</p>
          </div>
        </div>
      </div>

      {/* ── Mobile sticky footer ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between z-40 shadow-lg">
        <div>
          <p className="text-xs text-gray-400">Total</p>
          <p className="text-lg font-bold text-[#0B1F3A]">{fmt(total, currency)}</p>
        </div>
        <button
          onClick={onNext}
          disabled={!date}
          className="bg-[#C9A84C] hover:bg-[#d4b45f] disabled:opacity-40 disabled:cursor-not-allowed text-[#0B1F3A] font-bold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2"
        >
          Continue <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Your Details ──────────────────────────────────────────────────────

function StepTwo({ details, setDetails, onNext, onBack }: {
  details: Details; setDetails: (d: Details) => void
  onNext: () => void; onBack: () => void
}) {
  const [errors, setErrors] = useState<Partial<Details>>({})

  function validate() {
    const e: Partial<Details> = {}
    if (!details.firstName.trim()) e.firstName = 'Required'
    if (!details.lastName.trim()) e.lastName = 'Required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) e.email = 'Valid email required'
    if (!details.whatsapp.trim()) e.whatsapp = 'Required'
    if (!details.country) e.country = 'Please select your country'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function inp(label: string, key: keyof Details, type = 'text', placeholder = '') {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
        <input
          type={type}
          value={details[key] as string}
          onChange={(e) => { setDetails({ ...details, [key]: e.target.value }); if (errors[key]) setErrors({ ...errors, [key]: undefined }) }}
          placeholder={placeholder}
          className={`w-full border-2 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors
            ${errors[key] ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-[#C9A84C]'}`}
        />
        {errors[key] && <p className="text-red-500 text-xs mt-1">{errors[key]}</p>}
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
        <div>
          <h3 className="font-bold text-[#0B1F3A] text-base">Lead Traveller Details</h3>
          <p className="text-xs text-gray-400 mt-0.5">All tour communications will go to this person</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {inp('First Name *', 'firstName', 'text', 'John')}
          {inp('Last Name *', 'lastName', 'text', 'Smith')}
        </div>

        {inp('Email Address *', 'email', 'email', 'john@example.com')}

        {/* WhatsApp with country code */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">WhatsApp Number *</label>
          <div className="flex gap-2">
            <select
              value={details.countryCode}
              onChange={(e) => setDetails({ ...details, countryCode: e.target.value })}
              className="border-2 border-gray-200 focus:border-[#C9A84C] rounded-xl px-3 py-2.5 text-sm outline-none bg-white flex-shrink-0"
            >
              {COUNTRY_CODES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="tel"
              value={details.whatsapp}
              onChange={(e) => { setDetails({ ...details, whatsapp: e.target.value }); if (errors.whatsapp) setErrors({ ...errors, whatsapp: undefined }) }}
              placeholder="7700 000000"
              className={`flex-1 border-2 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors
                ${errors.whatsapp ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-[#C9A84C]'}`}
            />
          </div>
          {errors.whatsapp && <p className="text-red-500 text-xs mt-1">{errors.whatsapp}</p>}
        </div>

        {/* Country */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Country of Residence *</label>
          <select
            value={details.country}
            onChange={(e) => { setDetails({ ...details, country: e.target.value }); if (errors.country) setErrors({ ...errors, country: undefined }) }}
            className={`w-full border-2 rounded-xl px-4 py-2.5 text-sm outline-none bg-white transition-colors
              ${errors.country ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-[#C9A84C]'}`}
          >
            <option value="">Select country…</option>
            {COUNTRIES.map(c => <option key={c}>{c}</option>)}
          </select>
          {errors.country && <p className="text-red-500 text-xs mt-1">{errors.country}</p>}
        </div>

        {/* Requirements */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Special Requirements / Accessibility Needs</label>
          <textarea
            value={details.requirements}
            onChange={(e) => setDetails({ ...details, requirements: e.target.value })}
            rows={2}
            placeholder="Dietary needs, wheelchair access, special occasions…"
            className="w-full border-2 border-gray-200 focus:border-[#C9A84C] rounded-xl px-4 py-2.5 text-sm outline-none resize-none transition-colors"
          />
        </div>

        {/* Message to host */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Message to Host <span className="text-gray-300">(optional)</span></label>
          <textarea
            value={details.message}
            onChange={(e) => setDetails({ ...details, message: e.target.value })}
            rows={2}
            placeholder="Any specific requests or questions for your guide…"
            className="w-full border-2 border-gray-200 focus:border-[#C9A84C] rounded-xl px-4 py-2.5 text-sm outline-none resize-none transition-colors"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-5 mb-8">
        <button onClick={onBack} className="flex items-center gap-2 px-5 py-3 border-2 border-gray-200 hover:border-gray-300 rounded-xl text-sm font-medium transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button onClick={() => { if (validate()) onNext() }} className="flex-1 bg-[#0B1F3A] hover:bg-[#1a3358] text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
          Review Booking <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Review & Pay ──────────────────────────────────────────────────────

function StepThree({ tour, date, groupSize, addons, details, onBack, onSuccess }: {
  tour: DbTour; date: string; groupSize: number; addons: string[]
  details: Details; onBack: () => void; onSuccess: (ref: string) => void
}) {
  const [agreed, setAgreed] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [gateway, setGateway] = useState<'stripe' | 'flutterwave' | 'nowpayments'>('stripe')

  const currency = tour.currency
  const basePrice = tour.price * groupSize
  const selectedAddons = ADDONS.filter(a => addons.includes(a.id))
  const addonsTotal = selectedAddons.reduce((s, a) => s + a.price * groupSize, 0)
  const total = basePrice + addonsTotal

  // ── Stripe (Checkout Session redirect) ────────────────────────────────────
  async function handleStripePay() {
    setPaying(true)
    setError('')
    try {
      const res = await fetch('/api/tours/stripe-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tourId: tour.id, tourName: tour.name, tourSlug: tour.slug,
          tourLocation: tour.location,
          date, groupSize, currency,
          addons: selectedAddons.map(a => ({ id: a.id, name: a.name, price: a.price })),
          basePrice, addonsTotal, totalAmount: total,
          imageUrl: tour.imageUrl,
          firstName: details.firstName, lastName: details.lastName,
          email: details.email,
          whatsapp: `${details.countryCode}${details.whatsapp}`,
          country: details.country,
          requirements: details.requirements,
          message: details.message,
        }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Failed to create payment session')
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start payment. Please try again.')
      setPaying(false)
    }
  }

  // ── Flutterwave (inline modal) ────────────────────────────────────────────
  async function handleFlutterwavePay() {
    const flwKey = process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY
    if (!flwKey) {
      setError('Flutterwave is not configured. Please choose another payment method.')
      return
    }
    setPaying(true)
    setError('')
    const txRef = 'WLZ-TOUR-' + Date.now()
    try {
      await new Promise<void>((resolve, reject) => {
        const win = window as unknown as Record<string, unknown>
        if (typeof win.FlutterwaveCheckout === 'function') { resolve(); return }

        const alreadyInjected = document.querySelector('script[src*="checkout.flutterwave.com/v3.js"]')
        if (alreadyInjected) {
          let ticks = 0
          const poll = setInterval(() => {
            if (typeof win.FlutterwaveCheckout === 'function') { clearInterval(poll); resolve(); return }
            if (++ticks > 80) {
              clearInterval(poll)
              reject(new Error('Flutterwave did not initialise — it may be blocked by an ad-blocker.'))
            }
          }, 100)
          return
        }

        const s = document.createElement('script')
        s.src = 'https://checkout.flutterwave.com/v3.js'
        s.onload = () => {
          if (typeof win.FlutterwaveCheckout === 'function') {
            resolve()
          } else {
            reject(new Error('Flutterwave loaded but did not initialise correctly.'))
          }
        }
        s.onerror = () => {
          console.error('[FLW] Failed to load https://checkout.flutterwave.com/v3.js')
          reject(new Error('Payment script could not be loaded. Please try another method.'))
        }
        document.body.appendChild(s)
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).FlutterwaveCheckout({
        public_key: flwKey,
        tx_ref: txRef,
        amount: total,
        currency,
        payment_options: 'card,mobilemoney,ussd',
        customer: { email: details.email, name: `${details.firstName} ${details.lastName}`, phone_number: `${details.countryCode}${details.whatsapp}` },
        customizations: { title: 'Walz Travels', description: `Tour: ${tour.name}`, logo: '/favicon.ico' },
        callback: async (response: { status: string; transaction_id: number | string }) => {
          if (response.status === 'successful' || response.status === 'completed') {
            try {
              const res = await fetch('/api/tours/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tourId: tour.id, tourName: tour.name, tourSlug: tour.slug,
                  date, groupSize, currency,
                  addons: selectedAddons.map(a => ({ id: a.id, name: a.name, price: a.price })),
                  basePrice, addonsTotal, totalAmount: total,
                  firstName: details.firstName, lastName: details.lastName,
                  email: details.email,
                  whatsapp: `${details.countryCode}${details.whatsapp}`,
                  country: details.country,
                  requirements: details.requirements,
                  message: details.message,
                  txRef, flutterwaveTransactionId: String(response.transaction_id),
                }),
              })
              const data = await res.json() as { bookingReference?: string; error?: string }
              if (res.ok && data.bookingReference) { onSuccess(data.bookingReference) }
              else { setError('Payment received but booking save failed. Quote ref ' + txRef + ' when contacting us.') }
            } catch { setError('Payment received but booking save failed. Quote ref ' + txRef + ' when contacting us.') }
          } else {
            setError('Payment was not completed. Please try again.')
          }
          setPaying(false)
        },
        onclose: () => setPaying(false),
      })
    } catch {
      setError('Payment system unavailable. Please contact us directly on WhatsApp.')
      setPaying(false)
    }
  }

  // ── NOWPayments (hosted crypto invoice — USDC / USDT) ────────────────────
  async function handleNOWPaymentsPay() {
    setPaying(true)
    setError('')
    try {
      const res = await fetch('/api/payments/crypto/create-invoice', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tourId: tour.id, tourName: tour.name, tourSlug: tour.slug,
          tourLocation: tour.location,
          date, groupSize, currency,
          addons: selectedAddons.map(a => ({ id: a.id, name: a.name, price: a.price })),
          basePrice, addonsTotal, totalAmount: total,
          firstName: details.firstName, lastName: details.lastName,
          email: details.email,
          whatsapp: `${details.countryCode}${details.whatsapp}`,
          country: details.country,
          requirements: details.requirements,
          message: details.message,
        }),
      })
      const data = await res.json() as { invoiceUrl?: string; error?: string }
      if (!res.ok || !data.invoiceUrl) throw new Error(data.error ?? 'Failed to create crypto invoice')
      window.location.href = data.invoiceUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start crypto payment. Please try again.')
      setPaying(false)
    }
  }

  function handlePay() {
    if (!agreed) {
      setError('Please accept the terms and conditions to proceed.')
      // On mobile the error is in the scrolled content; scroll it into view
      document.querySelector('[data-terms-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (gateway === 'stripe') { handleStripePay() }
    else if (gateway === 'flutterwave') { handleFlutterwavePay() }
    else if (gateway === 'nowpayments') { handleNOWPaymentsPay() }
  }

  return (
    <div className="lg:grid lg:grid-cols-3 lg:gap-6">
      {/* ── Left: summary ── */}
      <div className="lg:col-span-2 space-y-4">

        {/* Tour summary */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-[#0B1F3A] mb-4">Booking Summary</h3>
          <div className="flex gap-4">
            {tour.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tour.imageUrl} alt={tour.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-[#0B1F3A] leading-tight">{tour.name}</h4>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3 text-[#C9A84C]" />{tour.location}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3 text-[#C9A84C]" />{tour.duration}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-400 text-xs">Date</p>
              <p className="font-semibold text-[#0B1F3A] text-sm">{fmtDate(date)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Group size</p>
              <p className="font-semibold text-[#0B1F3A]">{groupSize} {groupSize === 1 ? 'person' : 'people'}</p>
            </div>
          </div>
          {selectedAddons.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-2">Add-ons</p>
              <div className="flex flex-wrap gap-2">
                {selectedAddons.map(a => (
                  <span key={a.id} className="inline-flex items-center gap-1 bg-[#C9A84C]/10 text-[#0B1F3A] text-xs font-medium px-2.5 py-1 rounded-full border border-[#C9A84C]/30">
                    <Check className="w-3 h-3 text-[#C9A84C]" />{a.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Price breakdown */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-[#0B1F3A] mb-4">Price Breakdown</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Base price — {groupSize} {groupSize === 1 ? 'person' : 'people'} × {fmt(tour.price, currency)}</span>
              <span className="font-medium">{fmt(basePrice, currency)}</span>
            </div>
            {selectedAddons.map(a => (
              <div key={a.id} className="flex justify-between text-gray-600">
                <span>{a.name} — {groupSize} × {fmt(a.price, currency)}</span>
                <span className="font-medium">{fmt(a.price * groupSize, currency)}</span>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
              <span className="font-bold text-[#0B1F3A]">Total</span>
              <span className="text-[#C9A84C] text-xl font-bold">{fmt(total, currency)}</span>
            </div>
          </div>
        </div>

        {/* Traveller details */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-[#0B1F3A]">Lead Traveller</h3>
            <button onClick={onBack} className="text-xs text-[#C9A84C] underline">Edit</button>
          </div>
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <div><p className="text-gray-400 text-xs">Name</p><p className="font-medium">{details.firstName} {details.lastName}</p></div>
            <div><p className="text-gray-400 text-xs">Country</p><p className="font-medium">{details.country}</p></div>
            <div className="col-span-2"><p className="text-gray-400 text-xs">Email</p><p className="font-medium">{details.email}</p></div>
            <div className="col-span-2"><p className="text-gray-400 text-xs">WhatsApp</p><p className="font-medium">{details.countryCode} {details.whatsapp}</p></div>
            {details.requirements && <div className="col-span-2"><p className="text-gray-400 text-xs">Special requirements</p><p className="font-medium">{details.requirements}</p></div>}
          </div>
        </div>

        {/* Cancellation policy */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-amber-800 text-sm">Cancellation Policy</h4>
              <ul className="text-amber-700 text-xs mt-2 space-y-1 leading-relaxed">
                <li>• <strong>Free cancellation</strong> up to 48 hours before the tour</li>
                <li>• Cancellations within 48 hours are non-refundable</li>
                <li>• Rescheduling available subject to availability</li>
                <li>• Full refund if Walz Travels cancels the tour</li>
              </ul>
            </div>
          </div>
        </div>

        {/* T&C checkbox */}
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <div
            onClick={() => { setAgreed(!agreed); setError('') }}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all
              ${agreed ? 'bg-[#C9A84C] border-[#C9A84C]' : 'border-gray-300 bg-white'}`}
          >
            {agreed && <Check className="w-3 h-3 text-[#0B1F3A]" />}
          </div>
          <span className="text-sm text-gray-600">
            I have read and agree to the{' '}
            <span className="text-[#C9A84C] underline cursor-pointer">Terms and Conditions</span>
            {' '}and{' '}
            <span className="text-[#C9A84C] underline cursor-pointer">Cancellation Policy</span>
          </span>
        </label>

        {error && (
          <div data-terms-error className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}
      </div>

      {/* ── Right: payment panel ── */}
      <div className="mt-5 lg:mt-0">
        <div className="lg:sticky lg:top-24 space-y-3">
          <div className="bg-[#0B1F3A] rounded-2xl p-5 text-white shadow-lg">
            <h3 className="font-bold text-base mb-1">Secure Payment</h3>
            <p className="text-white/50 text-xs mb-4">SSL encrypted · 256-bit security</p>

            {/* Amount summary */}
            <div className="bg-white/5 rounded-xl p-4 mb-4">
              <p className="text-white/60 text-xs mb-1">{tour.name}</p>
              <div className="flex justify-between items-center">
                <span className="text-white/60 text-xs">
                  {groupSize} {groupSize === 1 ? 'person' : 'people'}
                  {selectedAddons.length > 0 ? ` + ${selectedAddons.length} add-on${selectedAddons.length > 1 ? 's' : ''}` : ''}
                </span>
                <span className="text-[#C9A84C] text-2xl font-bold">{fmt(total, currency)}</span>
              </div>
            </div>

            {/* Gateway selector */}
            <p className="text-white/50 text-[11px] uppercase tracking-wider mb-2 font-medium">Choose payment method</p>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {([
                ['stripe',       CreditCard, 'Stripe',      'Apple/Google Pay'],
                ['flutterwave',  Smartphone, 'Flutterwave', 'Mobile · USSD'],
                ['nowpayments',  Coins,      'Crypto',      'USDC · USDT'],
              ] as const).map(([id, Icon, label, sub]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setGateway(id)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all
                    ${gateway === id
                      ? 'border-[#C9A84C] bg-[#C9A84C]/10'
                      : 'border-white/10 hover:border-white/25 bg-white/5'}`}
                >
                  <Icon className={`w-4 h-4 ${gateway === id ? 'text-[#C9A84C]' : 'text-white/60'}`} />
                  <span className={`text-[10px] font-bold leading-none ${gateway === id ? 'text-white' : 'text-white/60'}`}>{label}</span>
                  <span className={`text-[9px] leading-none text-center ${gateway === id ? 'text-[#C9A84C]' : 'text-white/30'}`}>{sub}</span>
                </button>
              ))}
            </div>

            {/* Pay button */}
            <button
              onClick={handlePay}
              disabled={paying}
              className="w-full bg-[#C9A84C] hover:bg-[#d4b45f] disabled:opacity-60 disabled:cursor-not-allowed text-[#0B1F3A] font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-base"
            >
              {paying
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {gateway === 'stripe' || gateway === 'nowpayments' ? 'Redirecting…' : 'Processing…'}</>
                : gateway === 'nowpayments'
                  ? <><Coins className="w-4 h-4" /> Pay with Crypto</>
                  : <><CreditCard className="w-4 h-4" /> Pay {fmt(total, currency)}</>
              }
            </button>
          </div>

          <button
            onClick={onBack}
            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-gray-200 hover:border-gray-300 rounded-xl text-sm font-medium transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Details
          </button>
        </div>
      </div>

      {/* Mobile sticky pay bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-40 shadow-lg">
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {([
            ['stripe',      '🃏', 'Stripe'],
            ['flutterwave', '📱', 'Flutterwave'],
            ['nowpayments', '🪙', 'Crypto'],
          ] as const).map(([gw, icon, label]) => (
            <button
              key={gw}
              type="button"
              onClick={() => setGateway(gw)}
              className={`py-1.5 rounded-lg text-[10px] font-bold border-2 transition-all
                ${gateway === gw ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#0B1F3A]' : 'border-gray-200 text-gray-400'}`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
        <button
          onClick={handlePay}
          disabled={paying}
          className="w-full bg-[#C9A84C] hover:bg-[#d4b45f] disabled:opacity-60 text-[#0B1F3A] font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {paying
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {gateway === 'stripe' || gateway === 'nowpayments' ? 'Redirecting…' : 'Processing…'}</>
            : gateway === 'nowpayments'
              ? <><Coins className="w-4 h-4" /> Pay with Crypto (USDC · USDT)</>
              : `Pay ${fmt(total, currency)}`}
        </button>
      </div>
    </div>
  )
}

// ── Success Page ──────────────────────────────────────────────────────────────

function SuccessPage({ bookingRef, tour, date, groupSize, details }: {
  bookingRef: string; tour: DbTour; date: string; groupSize: number; details: Details
}) {
  function addToCalendar() {
    const d = date.replace(/-/g, '')
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(tour.name)}&dates=${d}T090000/${d}T180000&details=${encodeURIComponent('Walz Travels booking. Ref: ' + bookingRef)}&location=${encodeURIComponent(tour.location)}`
    window.open(url, '_blank')
  }

  const waMsg = `Hi! I just booked ${tour.name}. My booking reference is ${bookingRef}. Date: ${fmtDate(date)}`

  return (
    <div className="max-w-lg mx-auto text-center py-8">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
        <CheckCircle className="w-10 h-10 text-green-500" />
      </div>

      <h2 className="text-2xl font-bold text-[#0B1F3A] mb-2">Booking Confirmed! 🎉</h2>
      <p className="text-gray-500 text-sm mb-4">A confirmation has been sent to {details.email}</p>

      <div className="inline-flex flex-col items-center bg-[#0B1F3A] rounded-2xl px-8 py-4 mb-8">
        <span className="text-white/60 text-xs mb-1">Booking Reference</span>
        <span className="text-[#C9A84C] font-mono text-2xl font-bold tracking-wider">{bookingRef}</span>
      </div>

      {/* Details card */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-left mb-5">
        <h3 className="font-bold text-[#0B1F3A] mb-4">Your Booking</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-gray-400">Tour</span><span className="font-semibold text-right max-w-[55%]">{tour.name}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Date</span><span className="font-semibold">{fmtDate(date)}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Location</span><span className="font-semibold">{tour.location}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Group</span><span className="font-semibold">{groupSize} {groupSize === 1 ? 'person' : 'people'}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Lead traveller</span><span className="font-semibold">{details.firstName} {details.lastName}</span></div>
        </div>
      </div>

      {/* What happens next */}
      <div className="bg-[#0B1F3A]/5 border border-[#0B1F3A]/10 rounded-2xl p-5 mb-6 text-left">
        <h3 className="font-bold text-[#0B1F3A] mb-3">What happens next?</h3>
        <div className="space-y-3 text-sm text-gray-600">
          {[
            'Our team will contact you within 2 hours to confirm all details.',
            'You\'ll receive your full itinerary, guide info and meeting point by email and WhatsApp.',
            'Your guide will meet you at the agreed location on the day.',
          ].map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#C9A84C] text-[#0B1F3A] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </div>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <a
          href={`https://wa.me/12317902336?text=${encodeURIComponent(waMsg)}`}
          target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bc59] text-white font-bold py-3.5 rounded-xl transition-colors"
        >
          <Smartphone className="w-4 h-4" /> WhatsApp Us
        </a>
        <button
          onClick={addToCalendar}
          className="flex-1 flex items-center justify-center gap-2 border-2 border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white font-bold py-3.5 rounded-xl transition-colors"
        >
          <Calendar className="w-4 h-4" /> Add to Calendar
        </button>
      </div>

      <a href="/tours" className="text-sm text-gray-400 hover:text-gray-600 underline">← Explore more tours</a>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function BookingContent() {
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') ?? ''

  const [tour, setTour] = useState<DbTour | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<1 | 2 | 3 | 'success'>(1)

  const [date, setDate] = useState('')
  const [groupSize, setGroupSize] = useState(2)
  const [addons, setAddons] = useState<string[]>([])

  const [details, setDetails] = useState<Details>({
    firstName: '', lastName: '', email: '',
    countryCode: '+44', whatsapp: '',
    country: '', requirements: '', message: '',
  })

  const [bookingRef, setBookingRef] = useState('')

  useEffect(() => {
    if (!slug) { setLoading(false); return }
    fetch('/api/tours')
      .then(r => r.json())
      .then((tours: DbTour[]) => {
        setTour(tours.find(t => t.slug === slug || t.id === slug) ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [slug])

  function next(s: 1 | 2 | 3 | 'success') { setStep(s); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-[#C9A84C]" />
    </div>
  )

  if (!tour) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-8 gap-4">
      <AlertCircle className="w-12 h-12 text-gray-300" />
      <h2 className="text-xl font-bold text-[#0B1F3A]">Tour not found</h2>
      <a href="/tours" className="text-[#C9A84C] underline text-sm">← Back to all tours</a>
    </div>
  )

  if (step === 'success') return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <SuccessPage bookingRef={bookingRef} tour={tour} date={date} groupSize={groupSize} details={details} />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24 lg:pb-12">
      {/* Sticky header with progress */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <a href="/tours" className="text-sm text-gray-500 hover:text-[#0B1F3A] flex items-center gap-1 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Tours
            </a>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Shield className="w-3.5 h-3.5 text-[#C9A84C]" /> Secure booking
            </div>
          </div>
          <ProgressBar step={step as number} />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {step === 1 && (
          <StepOne
            tour={tour} date={date} setDate={setDate}
            groupSize={groupSize} setGroupSize={setGroupSize}
            addons={addons} setAddons={setAddons}
            onNext={() => next(2)}
          />
        )}
        {step === 2 && (
          <StepTwo
            details={details} setDetails={setDetails}
            onNext={() => next(3)} onBack={() => next(1)}
          />
        )}
        {step === 3 && (
          <StepThree
            tour={tour} date={date} groupSize={groupSize} addons={addons} details={details}
            onBack={() => next(2)}
            onSuccess={(ref) => { setBookingRef(ref); next('success') }}
          />
        )}
      </div>
    </div>
  )
}

export default function BookPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#C9A84C]" />
      </div>
    }>
      <BookingContent />
    </Suspense>
  )
}
