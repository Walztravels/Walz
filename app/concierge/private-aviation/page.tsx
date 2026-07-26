'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Plane } from 'lucide-react'

const HERO_SRC =
  'https://images.unsplash.com/photo-1540339832862-474599807836?auto=format&fit=crop&w=1920&q=80'

const AIRCRAFT_CATEGORIES = [
  { value: 'very_light',      label: 'Very Light Jet',    seats: '4–5 seats',  note: 'Short hops' },
  { value: 'light',           label: 'Light Jet',         seats: '6–8 seats',  note: 'Up to 2,500 nm' },
  { value: 'midsize',         label: 'Midsize Jet',       seats: '7–9 seats',  note: 'Up to 3,000 nm' },
  { value: 'super_midsize',   label: 'Super Midsize Jet', seats: '8–10 seats', note: 'Transcontinental' },
  { value: 'heavy',           label: 'Heavy Jet',         seats: '10–16 seats',note: 'Long haul' },
  { value: 'ultra_long_range',label: 'Ultra Long Range',  seats: '12–19 seats',note: 'Non-stop global' },
]

interface Airport {
  code: string
  name: string
  city: string
  country: string
}

interface FormState {
  from:         string
  to:           string
  fromDisplay:  string
  toDisplay:    string
  date:         string
  returnDate:   string
  passengers:   number
  category:     string
  notes:        string
  clientName:   string
  clientEmail:  string
  clientPhone:  string
}

const EMPTY: FormState = {
  from: '', to: '', fromDisplay: '', toDisplay: '',
  date: '', returnDate: '', passengers: 1, category: '',
  notes: '', clientName: '', clientEmail: '', clientPhone: '',
}

function useAirportSearch(query: string) {
  const [results, setResults] = useState<Airport[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/concierge/private-aviation/search?mode=airports&q=${encodeURIComponent(query)}`,
        )
        const json = await res.json() as { airports?: Airport[] }
        setResults(json.airports ?? [])
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 280)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  return { results, loading }
}

function AirportInput({
  label,
  value,
  display,
  onChange,
  onSelect,
  placeholder,
}: {
  label:       string
  value:       string
  display:     string
  onChange:    (display: string) => void
  onSelect:    (airport: Airport) => void
  placeholder: string
}) {
  const [open, setOpen]   = useState(false)
  const { results, loading } = useAirportSearch(display)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={wrapRef} className="relative">
      <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={display}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
          placeholder:text-white/25 text-sm focus:outline-none focus:border-[#C9A84C]/60
          focus:ring-1 focus:ring-[#C9A84C]/30 transition-colors"
      />
      {value && (
        <p className="text-[#C9A84C] text-xs mt-1 font-medium">{value}</p>
      )}
      {open && (loading || results.length > 0) && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-[#0F2340] border border-white/10
          rounded-xl overflow-hidden shadow-2xl">
          {loading && (
            <p className="text-white/40 text-xs px-4 py-3">Searching…</p>
          )}
          {results.slice(0, 6).map(a => (
            <button
              key={a.code}
              type="button"
              onClick={() => { onSelect(a); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors"
            >
              <span className="text-white text-sm font-medium">{a.name}</span>
              <span className="text-white/40 text-xs ml-2">{a.city}, {a.country} · {a.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PrivateAviationPage() {
  const [form, setForm]     = useState<FormState>(EMPTY)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [reference, setRef] = useState<string>('')
  const [errMsg, setErrMsg] = useState<string>('')

  const set = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: val }))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.from || !form.to || !form.date || !form.clientName || !form.clientEmail) return
    setStatus('submitting')
    setErrMsg('')

    try {
      const res = await fetch('/api/concierge/private-aviation/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:        form.from,
          to:          form.to,
          date:        form.date,
          returnDate:  form.returnDate || undefined,
          passengers:  form.passengers,
          category:    form.category || undefined,
          notes:       form.notes || undefined,
          clientName:  form.clientName,
          clientEmail: form.clientEmail,
          clientPhone: form.clientPhone || undefined,
        }),
      })

      const json = await res.json() as { reference?: string; error?: string }

      if (!res.ok) {
        setErrMsg(json.error ?? 'Something went wrong. Please try again.')
        setStatus('error')
        return
      }

      setRef(json.reference ?? '')
      setStatus('done')
    } catch {
      setErrMsg('Connection error. Please try again or contact us on WhatsApp.')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <main className="min-h-screen bg-[#0B1F3A] flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-[#C9A84C]/10 border border-[#C9A84C]/30
            flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-[#C9A84C]" />
          </div>
          <h1 className="font-display text-2xl font-bold text-white mb-3">
            Enquiry received
          </h1>
          <p className="text-white/60 text-sm leading-relaxed mb-6">
            Your private aviation request is with our team. We&apos;ll come back with tailored options and pricing — usually within a few hours.
          </p>
          {reference && (
            <p className="text-[#C9A84C]/60 text-xs mb-8 font-mono">Ref: {reference}</p>
          )}
          <Link
            href="/concierge"
            className="inline-block text-white/40 hover:text-[#C9A84C] text-sm transition-colors"
          >
            ← Back to Concierge
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0B1F3A]">
      {/* ── Hero ─────────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[45vh] flex flex-col items-center justify-end pb-10 overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src={HERO_SRC}
            alt="Private jet on the tarmac at sunset"
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: 'center 40%' }}
          />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-[#0B1F3A]/60 via-[#0B1F3A]/50 to-[#0B1F3A]/98"
        />

        {/* Back link */}
        <div className="absolute top-8 left-6 z-10">
          <Link
            href="/concierge"
            className="inline-flex items-center gap-1.5 text-white/40 hover:text-[#C9A84C]
              text-xs font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Concierge Services
          </Link>
        </div>

        <div className="relative z-10 text-center px-6 pt-24">
          <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.25em] mb-3">
            Walz Concierge
          </p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Private Aviation
          </h1>
          <p className="text-white/55 text-sm max-w-md mx-auto leading-relaxed">
            Private jet, turboprop, and helicopter charters arranged by your personal Walz specialist.
          </p>
        </div>
      </section>

      {/* ── Enquiry form ──────────────────────────────────────────────────────────── */}
      <section className="px-6 pb-20 pt-8 max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.2em] mb-1.5">
            Request a charter
          </p>
          <p className="text-white/40 text-sm">
            We&apos;ll come back with tailored options and pricing within a few hours.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Route */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AirportInput
              label="From"
              value={form.from}
              display={form.fromDisplay}
              onChange={v => set('fromDisplay', v)}
              onSelect={a => {
                set('from', a.code)
                set('fromDisplay', `${a.name} (${a.code})`)
              }}
              placeholder="City or airport"
            />
            <AirportInput
              label="To"
              value={form.to}
              display={form.toDisplay}
              onChange={v => set('toDisplay', v)}
              onSelect={a => {
                set('to', a.code)
                set('toDisplay', `${a.name} (${a.code})`)
              }}
              placeholder="City or airport"
            />
          </div>

          {/* Dates + passengers */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">
                Departure date
              </label>
              <input
                type="date"
                required
                value={form.date}
                onChange={e => set('date', e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
                  text-sm focus:outline-none focus:border-[#C9A84C]/60 focus:ring-1
                  focus:ring-[#C9A84C]/30 transition-colors [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">
                Return date
              </label>
              <input
                type="date"
                value={form.returnDate}
                onChange={e => set('returnDate', e.target.value)}
                min={form.date || new Date().toISOString().slice(0, 10)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3
                  text-white/60 text-sm focus:outline-none focus:border-[#C9A84C]/60
                  focus:ring-1 focus:ring-[#C9A84C]/30 transition-colors [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">
                Passengers
              </label>
              <input
                type="number"
                required
                min={1}
                max={200}
                value={form.passengers}
                onChange={e => set('passengers', Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
                  text-sm focus:outline-none focus:border-[#C9A84C]/60 focus:ring-1
                  focus:ring-[#C9A84C]/30 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Aircraft category */}
          <div>
            <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">
              Aircraft preference <span className="normal-case text-white/25">(optional)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {AIRCRAFT_CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => set('category', form.category === cat.value ? '' : cat.value)}
                  className={`text-left px-3.5 py-3 rounded-xl border text-xs transition-all ${
                    form.category === cat.value
                      ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-white'
                      : 'border-white/10 bg-white/3 text-white/60 hover:border-white/20 hover:text-white/80'
                  }`}
                >
                  <p className="font-semibold leading-tight mb-0.5">{cat.label}</p>
                  <p className="text-white/40" style={{ fontSize: '0.65rem' }}>{cat.seats} · {cat.note}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">
              Special requirements <span className="normal-case text-white/25">(optional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="Catering, ground transport, specific aircraft model, VIP clearance…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
                placeholder:text-white/25 text-sm focus:outline-none focus:border-[#C9A84C]/60
                focus:ring-1 focus:ring-[#C9A84C]/30 transition-colors resize-none"
            />
          </div>

          {/* Contact */}
          <div className="border-t border-white/5 pt-5">
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-4">
              Your details
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">
                  Full name
                </label>
                <input
                  type="text"
                  required
                  value={form.clientName}
                  onChange={e => set('clientName', e.target.value)}
                  placeholder="Your full name"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
                    placeholder:text-white/25 text-sm focus:outline-none focus:border-[#C9A84C]/60
                    focus:ring-1 focus:ring-[#C9A84C]/30 transition-colors"
                />
              </div>
              <div>
                <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={form.clientEmail}
                  onChange={e => set('clientEmail', e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
                    placeholder:text-white/25 text-sm focus:outline-none focus:border-[#C9A84C]/60
                    focus:ring-1 focus:ring-[#C9A84C]/30 transition-colors"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">
                Phone <span className="normal-case text-white/25">(optional)</span>
              </label>
              <input
                type="tel"
                value={form.clientPhone}
                onChange={e => set('clientPhone', e.target.value)}
                placeholder="+1 555 000 0000"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white
                  placeholder:text-white/25 text-sm focus:outline-none focus:border-[#C9A84C]/60
                  focus:ring-1 focus:ring-[#C9A84C]/30 transition-colors"
              />
            </div>
          </div>

          {errMsg && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20
              rounded-xl px-4 py-3">
              {errMsg}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-4 rounded-full
              hover:bg-[#d4b86e] transition-colors text-sm tracking-wide
              disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {status === 'submitting' ? (
              <>
                <span className="w-4 h-4 border-2 border-[#0B1F3A]/40 border-t-[#0B1F3A]
                  rounded-full animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Plane className="w-4 h-4" />
                Request Private Aviation
              </>
            )}
          </button>

          <p className="text-white/25 text-xs text-center leading-relaxed">
            No booking is made until our team confirms pricing and availability with you directly.
            <br />
            Or{' '}
            <a
              href="https://wa.me/12317902336"
              className="text-[#C9A84C]/60 hover:text-[#C9A84C] transition-colors"
            >
              WhatsApp us directly
            </a>
            .
          </p>
        </form>
      </section>
    </main>
  )
}
