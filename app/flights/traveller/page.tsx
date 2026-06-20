'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFlightStore } from '@/store/flightStore'
import type { Passenger } from '@/lib/flights/types'

const STEPS = ['Search', 'Seats', 'Travellers', 'Extras', 'Review', 'Pay']
const TITLES = ['Mr', 'Mrs', 'Ms', 'Dr'] as const
const NATIONALITIES = ['British', 'Nigerian', 'Ghanaian', 'American', 'Canadian', 'South African', 'Kenyan', 'French', 'German', 'Italian', 'Spanish', 'Dutch', 'Swedish', 'Australian', 'Emirati', 'Indian', 'Chinese']

function blankPassenger(id: string, isLead: boolean): Passenger {
  return {
    id,
    type:           'adult',
    title:          'Mr',
    firstName:      '',
    lastName:       '',
    dob:            '',
    nationality:    'British',
    passportNo:     '',
    passportExpiry: '',
    email:          isLead ? '' : undefined,
    phone:          isLead ? '' : undefined,
  }
}

interface FieldErrors { [key: string]: string }

export default function TravellerPage() {
  const router = useRouter()
  const { passengers: storedPax, setPassengers, setStep, passengerCount, search } = useFlightStore()
  const count = passengerCount()

  const initPax = storedPax.length === count
    ? storedPax
    : Array.from({ length: count }, (_, i) => blankPassenger(`pax_${i + 1}`, i === 0))

  const [pax,      setPax]      = useState<Passenger[]>(initPax)
  const [active,   setActive]   = useState(0)
  const [errors,   setErrors]   = useState<FieldErrors>({})
  const [tried,    setTried]    = useState(false)

  function update(idx: number, field: keyof Passenger, value: string) {
    setPax(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
    if (tried) setErrors(prev => ({ ...prev, [`${idx}_${field}`]: '' }))
  }

  function validate(): boolean {
    const newErrors: FieldErrors = {}
    pax.forEach((p, i) => {
      if (!p.firstName.trim())      newErrors[`${i}_firstName`]      = 'Required'
      if (!p.lastName.trim())       newErrors[`${i}_lastName`]       = 'Required'
      if (!p.dob)                   newErrors[`${i}_dob`]            = 'Required'
      if (!p.nationality)           newErrors[`${i}_nationality`]    = 'Required'
      if (!p.passportNo.trim())     newErrors[`${i}_passportNo`]     = 'Required'
      if (!p.passportExpiry)        newErrors[`${i}_passportExpiry`] = 'Required'
      if (i === 0 && !p.email?.trim())  newErrors[`${i}_email`]     = 'Required'
      if (i === 0 && !p.phone?.trim())  newErrors[`${i}_phone`]     = 'Required'
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleContinue() {
    setTried(true)
    if (!validate()) return
    setPassengers(pax)
    setStep('extras')
    router.push('/flights/extras')
  }

  const cur = pax[active]
  const isLead = active === 0

  function fieldCls(key: string) {
    const base = 'w-full px-4 py-2.5 rounded-xl border text-sm text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 transition-all'
    return errors[`${active}_${key}`] ? `${base} border-red-400 bg-red-50` : `${base} border-black/10 bg-white`
  }

  function err(key: string) {
    const e = errors[`${active}_${key}`]
    return e ? <p className="text-red-500 text-[11px] mt-1">{e}</p> : null
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Step header */}
      <div className="bg-[#0B1F3A]">
        <div className="container-walz py-5">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => router.back()} className="text-white/40 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <p className="text-white/60 text-sm">Step 3 of 6 · Traveller Details</p>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-all ${i <= 2 ? 'bg-[#C9A84C]' : 'bg-white/10'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="container-walz py-8">
        <div className="flex gap-8">
          {/* Main form */}
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold text-[#0B1F3A] mb-1">Traveller details</h1>
            <p className="text-[#0B1F3A]/50 text-sm mb-6">Enter passport-quality details for each traveller.</p>

            {/* Pax tabs */}
            {count > 1 && (
              <div className="flex gap-2 mb-6">
                {pax.map((p, i) => (
                  <button key={i} type="button" onClick={() => setActive(i)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      active === i
                        ? 'bg-[#0B1F3A] text-white'
                        : 'bg-white border border-black/10 text-[#0B1F3A]/60 hover:border-[#0B1F3A]/20'
                    }`}>
                    Passenger {i + 1}
                    {p.firstName && <span className="ml-1.5 opacity-60">({p.firstName})</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Form */}
            <div className="bg-white rounded-2xl border border-black/5 p-6 space-y-5">
              {/* Name row */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label-walz">Title</label>
                  <select className={fieldCls('title')} value={cur.title}
                    onChange={e => update(active, 'title', e.target.value)}>
                    {TITLES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-walz">First name *</label>
                  <input className={fieldCls('firstName')} placeholder="As on passport"
                    value={cur.firstName} onChange={e => update(active, 'firstName', e.target.value)} />
                  {err('firstName')}
                </div>
                <div>
                  <label className="label-walz">Last name *</label>
                  <input className={fieldCls('lastName')} placeholder="As on passport"
                    value={cur.lastName} onChange={e => update(active, 'lastName', e.target.value)} />
                  {err('lastName')}
                </div>
              </div>

              {/* DOB + Nationality */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-walz">Date of birth *</label>
                  <input type="date" className={fieldCls('dob')}
                    value={cur.dob} onChange={e => update(active, 'dob', e.target.value)} />
                  {err('dob')}
                </div>
                <div>
                  <label className="label-walz">Nationality *</label>
                  <select className={fieldCls('nationality')} value={cur.nationality}
                    onChange={e => update(active, 'nationality', e.target.value)}>
                    {NATIONALITIES.map(n => <option key={n}>{n}</option>)}
                  </select>
                  {err('nationality')}
                </div>
              </div>

              {/* Passport */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-walz">Passport number *</label>
                  <input className={fieldCls('passportNo')} placeholder="e.g. 123456789"
                    value={cur.passportNo} onChange={e => update(active, 'passportNo', e.target.value.toUpperCase())} />
                  {err('passportNo')}
                </div>
                <div>
                  <label className="label-walz">Passport expiry *</label>
                  <input type="date" className={fieldCls('passportExpiry')}
                    value={cur.passportExpiry} onChange={e => update(active, 'passportExpiry', e.target.value)} />
                  {err('passportExpiry')}
                </div>
              </div>

              {/* Lead pax only */}
              {isLead && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-black/5">
                  <div>
                    <label className="label-walz">Email address *</label>
                    <input type="email" className={fieldCls('email')} placeholder="For booking confirmation"
                      value={cur.email ?? ''} onChange={e => update(active, 'email', e.target.value)} />
                    {err('email')}
                  </div>
                  <div>
                    <label className="label-walz">Phone / WhatsApp *</label>
                    <input type="tel" className={fieldCls('phone')} placeholder="+44 7700 900000"
                      value={cur.phone ?? ''} onChange={e => update(active, 'phone', e.target.value)} />
                    {err('phone')}
                  </div>
                </div>
              )}

              {/* Frequent flyer */}
              <div className="pt-2 border-t border-black/5">
                <label className="label-walz">Frequent flyer number (optional)</label>
                <input className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-white text-sm text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20"
                  placeholder="Airline + number, e.g. QR 12345678" />
              </div>
            </div>

            <button type="button" onClick={handleContinue}
              className="mt-6 w-full py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-base hover:bg-[#E8C87A] transition-all">
              Continue to extras →
            </button>
          </div>

          {/* Order summary sidebar */}
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-black/5 p-5 sticky top-6">
              <p className="text-xs font-bold text-[#0B1F3A]/40 uppercase tracking-wider mb-4">Order Summary</p>
              {storedPax.length === 0 ? (
                <p className="text-sm text-[#0B1F3A]/40">Fill in traveller details</p>
              ) : (
                <div className="space-y-2">
                  {pax.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#0B1F3A]/10 flex items-center justify-center text-xs font-bold text-[#0B1F3A]/60">{i + 1}</div>
                      <div>
                        <p className="text-sm font-medium text-[#0B1F3A]">{p.firstName || `Passenger ${i + 1}`} {p.lastName}</p>
                        <p className="text-[11px] text-[#0B1F3A]/40 capitalize">{p.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
