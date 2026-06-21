'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { TripType, CabinClass, PassengerCount } from '@/lib/flights/types'

const AIRPORTS = [
  { iata: 'LHR', name: 'Heathrow',               city: 'London',       country: 'United Kingdom' },
  { iata: 'LGW', name: 'Gatwick',                 city: 'London',       country: 'United Kingdom' },
  { iata: 'YYZ', name: 'Pearson International',   city: 'Toronto',      country: 'Canada'         },
  { iata: 'YUL', name: 'Montréal-Trudeau',         city: 'Montreal',     country: 'Canada'         },
  { iata: 'YVR', name: 'Vancouver International', city: 'Vancouver',    country: 'Canada'         },
  { iata: 'DXB', name: 'Dubai International',     city: 'Dubai',        country: 'UAE'            },
  { iata: 'AUH', name: 'Abu Dhabi International', city: 'Abu Dhabi',    country: 'UAE'            },
  { iata: 'LOS', name: 'Murtala Muhammed',        city: 'Lagos',        country: 'Nigeria'        },
  { iata: 'ABV', name: 'Nnamdi Azikiwe',          city: 'Abuja',        country: 'Nigeria'        },
  { iata: 'ACC', name: 'Kotoka International',    city: 'Accra',        country: 'Ghana'          },
  { iata: 'JFK', name: 'John F. Kennedy',         city: 'New York',     country: 'USA'            },
  { iata: 'EWR', name: 'Newark Liberty',          city: 'New York',     country: 'USA'            },
  { iata: 'ORD', name: "O'Hare International",    city: 'Chicago',      country: 'USA'            },
  { iata: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'USA'           },
  { iata: 'CDG', name: 'Charles de Gaulle',       city: 'Paris',        country: 'France'         },
  { iata: 'AMS', name: 'Schiphol',                city: 'Amsterdam',    country: 'Netherlands'    },
  { iata: 'FRA', name: 'Frankfurt Airport',       city: 'Frankfurt',    country: 'Germany'        },
  { iata: 'IST', name: 'Istanbul Airport',        city: 'Istanbul',     country: 'Turkey'         },
  { iata: 'DOH', name: 'Hamad International',     city: 'Doha',         country: 'Qatar'          },
  { iata: 'NBO', name: 'Jomo Kenyatta',           city: 'Nairobi',      country: 'Kenya'          },
  { iata: 'JNB', name: "O.R. Tambo",              city: 'Johannesburg', country: 'South Africa'   },
  { iata: 'CMN', name: 'Mohammed V',              city: 'Casablanca',   country: 'Morocco'        },
  { iata: 'ADD', name: 'Addis Ababa Bole',        city: 'Addis Ababa',  country: 'Ethiopia'       },
  { iata: 'SIN', name: 'Changi Airport',          city: 'Singapore',    country: 'Singapore'      },
  { iata: 'HKG', name: 'Hong Kong International', city: 'Hong Kong',    country: 'China'          },
]

const CABIN_LABELS: Record<CabinClass, string> = {
  ECONOMY:          'Economy',
  PREMIUM_ECONOMY:  'Premium Economy',
  BUSINESS:         'Business Class',
  FIRST:            'First Class',
}

type Airport = typeof AIRPORTS[number]

function filterAirports(q: string): Airport[] {
  const lq = q.toLowerCase()
  return AIRPORTS.filter(a =>
    a.iata.toLowerCase().includes(lq) ||
    a.city.toLowerCase().includes(lq) ||
    a.name.toLowerCase().includes(lq)
  ).slice(0, 6)
}

function AirportDropdown({ airports, onSelect }: { airports: Airport[]; onSelect: (a: Airport) => void }) {
  return (
    <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-black/5 z-50 overflow-hidden">
      {airports.map(a => (
        <button key={a.iata} type="button" onMouseDown={() => onSelect(a)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F5F2EE] transition-colors text-left">
          <span className="text-[#C9A84C] font-bold text-sm w-10 flex-shrink-0">{a.iata}</span>
          <div>
            <p className="text-sm font-medium text-[#0B1F3A]">{a.city}</p>
            <p className="text-xs text-[#0B1F3A]/40">{a.name} · {a.country}</p>
          </div>
        </button>
      ))}
    </div>
  )
}

function PassengerDropdown({ value, onChange, onClose }: { value: PassengerCount; onChange: (v: PassengerCount) => void; onClose: () => void }) {
  const adjust = (key: keyof PassengerCount, delta: number) => {
    const next = { ...value, [key]: Math.max(key === 'adults' ? 1 : 0, value[key] + delta) }
    if (next.adults + next.children + next.infants > 9) return
    onChange(next)
  }
  return (
    <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-black/5 z-50 p-4">
      {([['adults', 'Adults', '12+ years'], ['children', 'Children', '2–11 years'], ['infants', 'Infants', 'Under 2']] as const).map(([key, label, sub]) => (
        <div key={key} className="flex items-center justify-between py-3 border-b border-black/5 last:border-0">
          <div>
            <p className="text-sm font-medium text-[#0B1F3A]">{label}</p>
            <p className="text-xs text-[#0B1F3A]/40">{sub}</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => adjust(key, -1)}
              disabled={value[key] <= (key === 'adults' ? 1 : 0)}
              className="w-8 h-8 rounded-full border border-[#0B1F3A]/10 flex items-center justify-center text-[#0B1F3A]/60 hover:border-[#C9A84C] hover:text-[#C9A84C] transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              −
            </button>
            <span className="w-5 text-center text-sm font-semibold text-[#0B1F3A]">{value[key]}</span>
            <button type="button" onClick={() => adjust(key, 1)}
              className="w-8 h-8 rounded-full border border-[#0B1F3A]/10 flex items-center justify-center text-[#0B1F3A]/60 hover:border-[#C9A84C] hover:text-[#C9A84C] transition-all">
              +
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={onClose}
        className="w-full mt-3 py-2.5 rounded-xl bg-[#0B1F3A] text-white text-sm font-semibold hover:bg-[#081629] transition-colors">
        Done
      </button>
    </div>
  )
}

export function FlightSearchWidget() {
  const router = useRouter()
  const [tripType, setTripType] = useState<TripType>('round-trip')
  const [cabin,    setCabin]    = useState<CabinClass>('ECONOMY')
  const [pax,      setPax]      = useState<PassengerCount>({ adults: 1, children: 0, infants: 0 })

  const [from,     setFrom]     = useState('')
  const [fromCode, setFromCode] = useState('')
  const [to,       setTo]       = useState('')
  const [toCode,   setToCode]   = useState('')
  const [depart,   setDepart]   = useState('')
  const [ret,      setRet]      = useState('')

  const [fromSug,     setFromSug]     = useState<Airport[]>([])
  const [toSug,       setToSug]       = useState<Airport[]>([])
  const [showPax,     setShowPax]     = useState(false)
  const [showCabin,   setShowCabin]   = useState(false)
  const [errors,      setErrors]      = useState<Record<string, string>>({})
  const [hasSubmitted, setHasSubmitted] = useState(false)

  const paxRef   = useRef<HTMLDivElement>(null)
  const cabinRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (paxRef.current   && !paxRef.current.contains(e.target as Node))   setShowPax(false)
      if (cabinRef.current && !cabinRef.current.contains(e.target as Node)) setShowCabin(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const totalPax = pax.adults + pax.children + pax.infants
  const paxLabel = `${totalPax} Passenger${totalPax !== 1 ? 's' : ''}`

  function swapRoute() {
    setFrom(to);    setFromCode(toCode)
    setTo(from);    setToCode(fromCode)
    setFromSug([])
    setToSug([])
  }

  function validate() {
    setHasSubmitted(true)
    const e: Record<string, string> = {}
    if (!fromCode) e.from   = 'Enter departure airport'
    if (!toCode)   e.to     = 'Enter destination airport'
    if (!depart)   e.depart = 'Select departure date'
    if (tripType === 'round-trip' && !ret) e.return = 'Select return date'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSearch() {
    if (!validate()) return
    const params = new URLSearchParams({
      from: fromCode, to: toCode, depart,
      ...(tripType === 'round-trip' ? { return: ret } : {}),
      trip: tripType, cabin,
      adults: String(pax.adults), children: String(pax.children), infants: String(pax.infants),
    })
    router.push(`/flights/search?${params.toString()}`)
  }

  const fieldCls = (err?: string) =>
    `flex items-center gap-2 h-14 px-4 rounded-xl border bg-white transition-all ${err ? 'border-red-400' : 'border-[#0B1F3A]/10 focus-within:border-[#C9A84C] focus-within:ring-2 focus-within:ring-[#C9A84C]/10'}`

  return (
    <div id="search-widget" className="w-full bg-white/95 backdrop-blur-xl rounded-2xl lg:rounded-3xl shadow-2xl shadow-black/20 border border-white/60">
      {/* Top row — trip type + cabin + passengers */}
      <div className="px-5 lg:px-8 pt-5 pb-0 flex flex-wrap items-center justify-between gap-3">
        {/* Trip type */}
        <div className="flex gap-1 bg-[#F5F2EE] rounded-xl p-1">
          {(['round-trip', 'one-way', 'multi-city'] as TripType[]).map(t => (
            <button key={t} type="button" onClick={() => setTripType(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tripType === t ? 'bg-white text-[#0B1F3A] shadow-sm font-semibold' : 'text-[#0B1F3A]/50 hover:text-[#0B1F3A]'}`}>
              {t === 'round-trip' ? 'Round Trip' : t === 'one-way' ? 'One Way' : 'Multi-city'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Passengers — top row so it never gets squished */}
          <div className="relative" ref={paxRef}>
            <button type="button" onClick={() => { setShowPax(!showPax); setShowCabin(false) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#0B1F3A]/10 text-sm font-medium text-[#0B1F3A] hover:bg-[#F5F2EE] transition-all">
              <svg className="w-4 h-4 text-[#0B1F3A]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
              </svg>
              {paxLabel}
              <svg className="w-3 h-3 text-[#0B1F3A]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
              </svg>
            </button>
            {showPax && <PassengerDropdown value={pax} onChange={setPax} onClose={() => setShowPax(false)} />}
          </div>

          {/* Cabin */}
          <div className="relative" ref={cabinRef}>
            <button type="button" onClick={() => { setShowCabin(!showCabin); setShowPax(false) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#0B1F3A]/10 text-sm font-medium text-[#0B1F3A] hover:bg-[#F5F2EE] transition-all">
              ✈️ {CABIN_LABELS[cabin]}
              <svg className="w-3 h-3 text-[#0B1F3A]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
              </svg>
            </button>
            {showCabin && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-black/5 z-50 overflow-hidden">
                {(Object.entries(CABIN_LABELS) as [CabinClass, string][]).map(([val, label]) => (
                  <button key={val} type="button" onClick={() => { setCabin(val); setShowCabin(false) }}
                    className={`w-full text-left px-4 py-3 text-sm transition-colors ${cabin === val ? 'bg-[#C9A84C]/10 text-[#C9A84C] font-semibold' : 'text-[#0B1F3A] hover:bg-[#F5F2EE]'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fields grid */}
      <div className="px-5 lg:px-8 py-5 grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* FROM */}
        <div className="lg:col-span-3 relative">
          <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-1.5">From</label>
          <div className={fieldCls(errors.from)}>
            {hasSubmitted && errors.from ? (
              <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-[#C9A84C] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19l14-7L5 5v5l9 2-9 2v5z" />
              </svg>
            )}
            <div className="flex-1 min-w-0">
              {fromCode && <div className="text-[10px] text-[#0B1F3A]/40 leading-none mb-0.5">{fromCode}</div>}
              <input type="text" placeholder="City or airport" value={from}
                onChange={e => { setFrom(e.target.value); setFromCode(''); setFromSug(e.target.value ? filterAirports(e.target.value) : []) }}
                className="w-full bg-transparent outline-none text-sm font-medium text-[#0B1F3A] placeholder:text-[#0B1F3A]/30" />
            </div>
          </div>
          {errors.from && <p className="text-red-500 text-xs mt-1">{errors.from}</p>}
          {fromSug.length > 0 && <AirportDropdown airports={fromSug} onSelect={a => { setFrom(`${a.city} (${a.iata})`); setFromCode(a.iata); setFromSug([]) }} />}
        </div>

        {/* SWAP */}
        <div className="lg:col-span-1 flex items-end justify-center pb-1">
          <button type="button" onClick={swapRoute}
            className="w-10 h-10 rounded-full border border-[#0B1F3A]/10 bg-white flex items-center justify-center hover:border-[#C9A84C] hover:text-[#C9A84C] transition-all group"
            aria-label="Swap airports">
            <svg className="w-4 h-4 text-[#0B1F3A]/40 group-hover:text-[#C9A84C] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" />
            </svg>
          </button>
        </div>

        {/* TO */}
        <div className="lg:col-span-3 relative">
          <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-1.5">To</label>
          <div className={fieldCls(errors.to)}>
            <svg className="w-4 h-4 text-[#0B1F3A]/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657 13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              {toCode && <div className="text-[10px] text-[#0B1F3A]/40 leading-none mb-0.5">{toCode}</div>}
              <input type="text" placeholder="City or airport" value={to}
                onChange={e => { setTo(e.target.value); setToCode(''); setToSug(e.target.value ? filterAirports(e.target.value) : []) }}
                className="w-full bg-transparent outline-none text-sm font-medium text-[#0B1F3A] placeholder:text-[#0B1F3A]/30" />
            </div>
          </div>
          {errors.to && <p className="text-red-500 text-xs mt-1">{errors.to}</p>}
          {toSug.length > 0 && <AirportDropdown airports={toSug} onSelect={a => { setTo(`${a.city} (${a.iata})`); setToCode(a.iata); setToSug([]) }} />}
        </div>

        {/* DEPART */}
        <div className="lg:col-span-2">
          <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-1.5">Depart</label>
          <div className={fieldCls(errors.depart)}>
            <svg className="w-4 h-4 text-[#0B1F3A]/30 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
            </svg>
            <input type="date" value={depart} min={new Date().toISOString().split('T')[0]} onChange={e => setDepart(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm font-medium text-[#0B1F3A]" />
          </div>
          {errors.depart && <p className="text-red-500 text-xs mt-1">{errors.depart}</p>}
        </div>

        {/* RETURN (round-trip only) */}
        {tripType === 'round-trip' && (
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-1.5">Return</label>
            <div className={fieldCls(errors.return)}>
              <svg className="w-4 h-4 text-[#0B1F3A]/30 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
              </svg>
              <input type="date" value={ret} min={depart || new Date().toISOString().split('T')[0]} onChange={e => setRet(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm font-medium text-[#0B1F3A]" />
            </div>
            {errors.return && <p className="text-red-500 text-xs mt-1">{errors.return}</p>}
          </div>
        )}

        {/* SEARCH */}
        <div className={`${tripType === 'round-trip' ? 'lg:col-span-1' : 'lg:col-span-3'} flex items-end`}>
          <button type="button" onClick={handleSearch}
            className="w-full h-14 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#E8C87A] active:scale-[0.97] transition-all shadow-lg shadow-[#C9A84C]/25">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 10.607z" />
            </svg>
            Search
          </button>
        </div>
      </div>

      {/* Quick options strip */}
      <div className="px-5 lg:px-8 pb-4 flex flex-wrap items-center gap-4">
        {['🗓 Flexible dates', '✈️ Direct flights only', '🗺️ Nearby airports', '🧳 Baggage included'].map(opt => (
          <label key={opt} className="flex items-center gap-1.5 cursor-pointer group">
            <input type="checkbox" className="rounded border-[#0B1F3A]/20 accent-[#C9A84C]" />
            <span className="text-xs text-[#0B1F3A]/50 group-hover:text-[#0B1F3A] transition-colors">{opt}</span>
          </label>
        ))}
        <button type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('jade:open', { detail: { service: 'Flight', page: '/flights' } }))}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-[#C9A84C] hover:text-[#0B1F3A] transition-colors group">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Ask Jade AI ✈️
        </button>
      </div>
    </div>
  )
}
