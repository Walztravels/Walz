'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFlightStore } from '@/store/flightStore'
import { formatTime, formatDuration, formatPrice } from '@/lib/flights/utils'
import type { Passenger } from '@/lib/flights/types'

const STEPS        = ['Search', 'Seats', 'Travellers', 'Extras', 'Review', 'Pay']
const TITLES       = ['Mr', 'Mrs', 'Ms', 'Dr'] as const
const NATIONALITIES = [
  'British','Nigerian','Ghanaian','American','Canadian','South African','Kenyan',
  'French','German','Italian','Spanish','Dutch','Swedish','Australian','Emirati',
  'Indian','Chinese','Japanese','Brazilian','Mexican','Egyptian','Moroccan',
]
const MEALS = ['No preference','Vegetarian','Vegan','Halal','Kosher','Gluten-free','Low-sodium']

function blankPassenger(id: string, isLead: boolean): Passenger {
  return {
    id, type: 'adult', title: 'Mr',
    firstName: '', lastName: '', dob: '',
    nationality: 'British', passportNo: '', passportExpiry: '',
    email: isLead ? '' : undefined,
    phone: isLead ? '' : undefined,
  }
}

type FieldErrors = Record<string, string>

function paxProgress(p: Passenger, isLead: boolean): number {
  const required = [p.firstName, p.lastName, p.dob, p.nationality, p.passportNo, p.passportExpiry]
  if (isLead) required.push(p.email ?? '', p.phone ?? '')
  const filled = required.filter(v => v?.trim()).length
  return Math.round((filled / required.length) * 100)
}

export default function TravellerPage() {
  const router = useRouter()
  const { passengers: storedPax, setPassengers, setStep, passengerCount, selected, seats } = useFlightStore()
  const count = passengerCount()

  const initPax = storedPax.length === count
    ? storedPax
    : Array.from({ length: count }, (_, i) => blankPassenger(`pax_${i + 1}`, i === 0))

  const [pax,     setPax]    = useState<Passenger[]>(initPax)
  const [active,  setActive] = useState(0)
  const [errors,  setErrors] = useState<FieldErrors>({})
  const [tried,   setTried]  = useState(false)
  const [meals,   setMeals]  = useState<string[]>(Array(count).fill('No preference'))

  const cur    = pax[active]
  const isLead = active === 0
  const seg    = selected?.segments[0]
  const segLast = selected ? selected.segments[selected.segments.length - 1] : null

  function update(idx: number, field: keyof Passenger, value: string) {
    setPax(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
    if (tried) setErrors(prev => ({ ...prev, [`${idx}_${field}`]: '' }))
  }

  function validate(): boolean {
    const errs: FieldErrors = {}
    pax.forEach((p, i) => {
      if (!p.firstName.trim())      errs[`${i}_firstName`]      = 'Required'
      if (!p.lastName.trim())       errs[`${i}_lastName`]       = 'Required'
      if (!p.dob)                   errs[`${i}_dob`]            = 'Required'
      if (!p.nationality)           errs[`${i}_nationality`]    = 'Required'
      if (!p.passportNo.trim())     errs[`${i}_passportNo`]     = 'Required'
      if (!p.passportExpiry)        errs[`${i}_passportExpiry`] = 'Required'
      if (i === 0 && !p.email?.trim())  errs[`${i}_email`]     = 'Required'
      if (i === 0 && !p.phone?.trim())  errs[`${i}_phone`]     = 'Required'
    })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleContinue() {
    setTried(true)
    // Switch to first pax with errors
    const firstErrPax = pax.findIndex((_, i) => {
      const p = pax[i]
      const lead = i === 0
      return !p.firstName || !p.lastName || !p.dob || !p.passportNo || !p.passportExpiry ||
        (lead && (!p.email || !p.phone))
    })
    if (!validate()) {
      if (firstErrPax !== -1) setActive(firstErrPax)
      return
    }
    setPassengers(pax)
    setStep('extras')
    router.push('/flights/extras')
  }

  function field(key: keyof Passenger, label: string, node: React.ReactNode, hint?: string) {
    const errKey = `${active}_${key}`
    const hasErr = tried && !!errors[errKey]
    return (
      <div>
        <label className="block text-[11px] font-bold text-[#0B1F3A]/50 uppercase tracking-wider mb-1.5">{label}</label>
        {node}
        {hasErr && <p className="text-red-500 text-[11px] mt-1 flex items-center gap-1"><span>⚠</span>{errors[errKey]}</p>}
        {!hasErr && hint && <p className="text-[10px] text-[#0B1F3A]/30 mt-1">{hint}</p>}
      </div>
    )
  }

  function inputCls(key: string) {
    const hasErr = tried && !!errors[`${active}_${key}`]
    return `w-full px-4 py-3 rounded-xl border text-sm text-[#0B1F3A] placeholder:text-[#0B1F3A]/25 focus:outline-none focus:ring-2 transition-all bg-white ${
      hasErr
        ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
        : 'border-[#0B1F3A]/10 focus:border-[#C9A84C] focus:ring-[#C9A84C]/15'
    }`
  }

  const seatTotal = seats.reduce((s, seat) => s + seat.priceGBP, 0)

  return (
    <div className="min-h-screen bg-[#FAF7F2]">

      {/* ── Emirates header ── */}
      <div className="bg-[#0B1F3A]">
        <div className="container-walz py-5">

          {/* Back + step */}
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => router.back()}
              className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/12 transition-all flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1">
              <p className="text-white/35 text-xs">Step 3 of 6</p>
              <p className="text-white font-semibold text-sm leading-tight">Traveller Details</p>
            </div>
            <div className="text-right">
              <p className="text-white/30 text-[10px]">{count} passenger{count > 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex gap-1 mb-6">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1 flex flex-col gap-1">
                <div className={`h-0.5 rounded-full transition-all ${i <= 2 ? 'bg-[#C9A84C]' : 'bg-white/10'}`} />
                <p className={`text-[9px] font-medium hidden sm:block ${i <= 2 ? 'text-[#C9A84C]/70' : 'text-white/15'}`}>{s}</p>
              </div>
            ))}
          </div>

          {/* Flight context */}
          {selected && seg && segLast && (
            <div className="bg-white/6 border border-white/8 rounded-2xl p-4 flex flex-wrap items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={seg.airlineLogo} alt={seg.airlineName}
                  className="w-6 h-6 object-contain"
                  onError={e => {
                    const img = e.currentTarget as HTMLImageElement
                    img.style.display = 'none'
                    ;(img.parentElement as HTMLElement).innerHTML = `<span class="text-white font-bold text-[10px]">${seg.airline}</span>`
                  }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">
                  {seg.departureCity} <span className="text-[#C9A84C]">→</span> {segLast.arrivalCity}
                </p>
                <p className="text-white/40 text-xs">{seg.airlineName} · {seg.flightNumber}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-center">
                  <p className="text-white font-bold text-sm tabular-nums">{formatTime(seg.departureTime)}</p>
                  <p className="text-white/30 text-[10px]">{seg.departureIata}</p>
                </div>
                <div className="text-center px-3">
                  <div className="h-px w-10 bg-white/20 relative">
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] text-white/25 whitespace-nowrap">
                      {formatDuration(selected.totalDuration)}
                    </span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-white font-bold text-sm tabular-nums">{formatTime(segLast.arrivalTime)}</p>
                  <p className="text-white/30 text-[10px]">{segLast.arrivalIata}</p>
                </div>
              </div>
              <div className="flex-shrink-0 bg-white/8 rounded-xl px-3 py-2 text-center">
                <p className="text-[#C9A84C] font-bold text-sm">{formatPrice(selected.price.total, selected.price.currency)}</p>
                <p className="text-white/25 text-[9px]">Total fare</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="container-walz py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* ── Left: form ── */}
          <div className="lg:col-span-2">
            <div className="mb-6">
              <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">Traveller details</h1>
              <p className="text-[#0B1F3A]/50 text-sm mt-1">
                Enter details exactly as they appear on each passenger&apos;s passport.
              </p>
            </div>

            {/* Passenger tabs */}
            {count > 1 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {pax.map((p, i) => {
                  const pct  = paxProgress(p, i === 0)
                  const done = pct === 100
                  return (
                    <button key={i} type="button" onClick={() => setActive(i)}
                      className={`relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border overflow-hidden ${
                        active === i
                          ? 'bg-[#0B1F3A] text-white border-transparent'
                          : done
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-white border-[#0B1F3A]/10 text-[#0B1F3A]/60 hover:border-[#0B1F3A]/20'
                      }`}>
                      {/* Completion bar */}
                      {active !== i && pct > 0 && pct < 100 && (
                        <div className="absolute bottom-0 left-0 h-0.5 bg-[#C9A84C]/50 transition-all" style={{ width: `${pct}%` }} />
                      )}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        active === i ? 'bg-white/15' : done ? 'bg-emerald-500 text-white' : 'bg-[#0B1F3A]/8'
                      }`}>
                        {done ? '✓' : i + 1}
                      </div>
                      <div className="text-left">
                        <p className="leading-tight">{p.firstName || `Passenger ${i + 1}`}</p>
                        {p.firstName && <p className="text-[10px] opacity-50 leading-tight">{p.lastName || 'No surname'}</p>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Form card */}
            <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">

              {/* Section: Personal info */}
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs">👤</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0B1F3A]">Personal information</p>
                    <p className="text-[10px] text-[#0B1F3A]/40">As it appears on your passport</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {field('title', 'Title', (
                    <select className={inputCls('title')} value={cur.title}
                      onChange={e => update(active, 'title', e.target.value)}>
                      {TITLES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  ))}
                  {field('firstName', 'First name *', (
                    <input className={inputCls('firstName')} placeholder="Given name"
                      value={cur.firstName} onChange={e => update(active, 'firstName', e.target.value)} />
                  ))}
                  {field('lastName', 'Last name *', (
                    <input className={inputCls('lastName')} placeholder="Family name"
                      value={cur.lastName} onChange={e => update(active, 'lastName', e.target.value)} />
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {field('dob', 'Date of birth *', (
                    <input type="date" className={inputCls('dob')}
                      value={cur.dob} onChange={e => update(active, 'dob', e.target.value)} />
                  ))}
                  {field('nationality', 'Nationality *', (
                    <select className={inputCls('nationality')} value={cur.nationality}
                      onChange={e => update(active, 'nationality', e.target.value)}>
                      {NATIONALITIES.map(n => <option key={n}>{n}</option>)}
                    </select>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-[#0B1F3A]/5 mx-6" />

              {/* Section: Travel document */}
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs">🛂</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0B1F3A]">Travel document</p>
                    <p className="text-[10px] text-[#0B1F3A]/40">Passport details — must be valid for the full journey</p>
                  </div>
                </div>

                {/* Passport card visual */}
                <div className="bg-[#0B1F3A] rounded-2xl p-4 mb-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/3 rounded-full -translate-y-1/2 translate-x-1/3" />
                  <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/3 rounded-full translate-y-1/2 -translate-x-1/4" />
                  <p className="text-[9px] font-bold text-[#C9A84C] uppercase tracking-widest mb-2">PASSPORT</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-white/30 text-[9px] uppercase tracking-wider">Surname</p>
                      <p className="text-white font-bold text-sm mt-0.5">{cur.lastName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-white/30 text-[9px] uppercase tracking-wider">Given name</p>
                      <p className="text-white font-bold text-sm mt-0.5">{cur.firstName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-white/30 text-[9px] uppercase tracking-wider">Passport No</p>
                      <p className="text-white font-mono text-sm mt-0.5 tracking-widest">{cur.passportNo || '— — — —'}</p>
                    </div>
                    <div>
                      <p className="text-white/30 text-[9px] uppercase tracking-wider">Expiry</p>
                      <p className="text-white font-mono text-sm mt-0.5">{cur.passportExpiry || '— —'}</p>
                    </div>
                    <div>
                      <p className="text-white/30 text-[9px] uppercase tracking-wider">Nationality</p>
                      <p className="text-white text-sm mt-0.5">{cur.nationality}</p>
                    </div>
                    <div>
                      <p className="text-white/30 text-[9px] uppercase tracking-wider">Date of birth</p>
                      <p className="text-white text-sm mt-0.5">{cur.dob || '— — —'}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {field('passportNo', 'Passport number *', (
                    <input className={`${inputCls('passportNo')} font-mono tracking-widest uppercase`}
                      placeholder="e.g. GB1234567"
                      value={cur.passportNo}
                      onChange={e => update(active, 'passportNo', e.target.value.toUpperCase())} />
                  ), 'Exactly as printed on the passport')}
                  {field('passportExpiry', 'Passport expiry date *', (
                    <input type="date" className={inputCls('passportExpiry')}
                      value={cur.passportExpiry}
                      onChange={e => update(active, 'passportExpiry', e.target.value)} />
                  ), 'Must be valid throughout your journey')}
                </div>
              </div>

              {/* Section: Contact (lead pax only) */}
              {isLead && (
                <>
                  <div className="border-t border-[#0B1F3A]/5 mx-6" />
                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-7 h-7 rounded-lg bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs">📨</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#0B1F3A]">Contact details</p>
                        <p className="text-[10px] text-[#0B1F3A]/40">For booking confirmation and travel updates</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {field('email', 'Email address *', (
                        <input type="email" className={inputCls('email')}
                          placeholder="your@email.com"
                          value={cur.email ?? ''}
                          onChange={e => update(active, 'email', e.target.value)} />
                      ), 'Booking confirmation sent here')}
                      {field('phone', 'Phone / WhatsApp *', (
                        <input type="tel" className={inputCls('phone')}
                          placeholder="+44 7700 900000"
                          value={cur.phone ?? ''}
                          onChange={e => update(active, 'phone', e.target.value)} />
                      ), 'For flight alerts and urgent updates')}
                    </div>
                  </div>
                </>
              )}

              {/* Section: Preferences (optional) */}
              <div className="border-t border-[#0B1F3A]/5 mx-6" />
              <div className="p-6 bg-[#FAF7F2] space-y-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-[#0B1F3A]/8 flex items-center justify-center flex-shrink-0">
                    <span className="text-[#0B1F3A]/50 text-xs">⚙</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">Preferences <span className="text-[#0B1F3A]/30 font-normal text-xs">(optional)</span></p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B1F3A]/40 uppercase tracking-wider mb-1.5">Meal preference</label>
                    <select className="w-full px-4 py-3 rounded-xl border border-[#0B1F3A]/10 bg-white text-sm text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/15 transition-all"
                      value={meals[active]}
                      onChange={e => setMeals(m => m.map((v, i) => i === active ? e.target.value : v))}>
                      {MEALS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B1F3A]/40 uppercase tracking-wider mb-1.5">Frequent flyer number</label>
                    <input className="w-full px-4 py-3 rounded-xl border border-[#0B1F3A]/10 bg-white text-sm text-[#0B1F3A] placeholder:text-[#0B1F3A]/25 focus:outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/15 transition-all"
                      placeholder="e.g. EK 123 456 789" />
                  </div>
                </div>
              </div>
            </div>

            {/* Pax navigation for multi-pax */}
            {count > 1 && (
              <div className="flex items-center justify-between mt-4">
                <button type="button"
                  onClick={() => setActive(i => Math.max(0, i - 1))}
                  disabled={active === 0}
                  className="px-4 py-2.5 rounded-xl bg-white border border-[#0B1F3A]/10 text-sm font-medium text-[#0B1F3A]/60 hover:border-[#0B1F3A]/20 disabled:opacity-30 transition-all">
                  ← Previous passenger
                </button>
                {active < count - 1 ? (
                  <button type="button"
                    onClick={() => setActive(i => Math.min(count - 1, i + 1))}
                    className="px-5 py-2.5 rounded-xl bg-[#0B1F3A] text-white text-sm font-semibold hover:bg-[#152D52] transition-all">
                    Next passenger →
                  </button>
                ) : (
                  <button type="button" onClick={handleContinue}
                    className="px-6 py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] transition-all shadow-sm shadow-[#C9A84C]/25">
                    Continue to extras →
                  </button>
                )}
              </div>
            )}

            {count === 1 && (
              <button type="button" onClick={handleContinue}
                className="mt-5 w-full py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-base hover:bg-[#E8C87A] transition-all shadow-sm shadow-[#C9A84C]/25">
                Continue to extras →
              </button>
            )}

            {/* Security note */}
            <div className="mt-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-[#0B1F3A]/3 border border-[#0B1F3A]/6">
              <span className="text-sm flex-shrink-0">🔒</span>
              <p className="text-[11px] text-[#0B1F3A]/40 leading-relaxed">
                Your personal details are encrypted and only shared with airlines and relevant authorities as required for travel. We never sell your data.
              </p>
            </div>
          </div>

          {/* ── Right: order summary ── */}
          <aside className="hidden lg:block space-y-4 sticky top-6">

            {/* Booking summary */}
            <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
              <div className="bg-[#0B1F3A] px-5 py-4">
                <p className="text-[10px] font-bold text-[#C9A84C]/80 uppercase tracking-widest">Booking summary</p>
                {selected && seg && segLast && (
                  <div className="mt-2">
                    <p className="text-white font-bold text-sm">
                      {seg.departureIata} <span className="text-[#C9A84C]">→</span> {segLast.arrivalIata}
                      {selected.returnSegments?.length ? (
                        <span className="text-[#C9A84C]"> + Return</span>
                      ) : null}
                    </p>
                    <p className="text-white/40 text-xs mt-0.5">{seg.airlineName} · {seg.cabinClass.replace('_', ' ')}</p>
                  </div>
                )}
              </div>

              <div className="p-5 space-y-4">
                {/* Passengers */}
                <div>
                  <p className="text-[10px] font-bold text-[#0B1F3A]/35 uppercase tracking-wider mb-2">Passengers</p>
                  <div className="space-y-1.5">
                    {pax.map((p, i) => {
                      const pct  = paxProgress(p, i === 0)
                      const done = pct === 100
                      const seat = seats.find(s => s.paxIndex === i)
                      return (
                        <div key={i} className="flex items-center gap-2.5">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${done ? 'bg-emerald-100 text-emerald-600' : 'bg-[#0B1F3A]/8 text-[#0B1F3A]/40'}`}>
                            {done ? '✓' : i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[#0B1F3A] truncate">
                              {p.firstName ? `${p.firstName} ${p.lastName}` : `Passenger ${i + 1}`}
                            </p>
                            {seat && (
                              <p className="text-[10px] text-[#0B1F3A]/40">Seat {seat.seatNumber}</p>
                            )}
                          </div>
                          {!done && (
                            <div className="flex-shrink-0 w-10">
                              <div className="h-1 bg-[#0B1F3A]/8 rounded-full overflow-hidden">
                                <div className="h-full bg-[#C9A84C] rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Price breakdown */}
                {selected && (
                  <div className="border-t border-[#0B1F3A]/5 pt-4">
                    <p className="text-[10px] font-bold text-[#0B1F3A]/35 uppercase tracking-wider mb-2.5">Price breakdown</p>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#0B1F3A]/50">Flight fare</span>
                        <span className="font-semibold text-[#0B1F3A]">{formatPrice(selected.price.total, selected.price.currency)}</span>
                      </div>
                      {seatTotal > 0 && (
                        <div className="flex justify-between">
                          <span className="text-[#0B1F3A]/50">Seat selection</span>
                          <span className="font-semibold text-[#0B1F3A]">+{formatPrice(seatTotal)}</span>
                        </div>
                      )}
                      <div className="border-t border-[#0B1F3A]/5 pt-2 flex justify-between">
                        <span className="font-bold text-[#0B1F3A]">Total so far</span>
                        <span className="font-bold text-[#0B1F3A]">{formatPrice(selected.price.total + seatTotal)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Trust badges */}
            <div className="bg-white rounded-2xl border border-black/5 p-4 grid grid-cols-2 gap-3">
              {[
                { icon: '🔒', label: 'SSL Encrypted' },
                { icon: '✈', label: 'IATA Partner' },
                { icon: '💬', label: '24/7 Support' },
                { icon: '💰', label: 'Price Match' },
              ].map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-base">{icon}</span>
                  <span className="text-[10px] font-medium text-[#0B1F3A]/40">{label}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
