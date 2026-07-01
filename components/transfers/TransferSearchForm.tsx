'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, ArrowRight, PlaneTakeoff, Building2 } from 'lucide-react'

const AIRPORTS = [
  { code: 'LHR', name: 'London Heathrow',         country: 'UK'           },
  { code: 'LGW', name: 'London Gatwick',           country: 'UK'           },
  { code: 'STN', name: 'London Stansted',          country: 'UK'           },
  { code: 'LTN', name: 'London Luton',             country: 'UK'           },
  { code: 'LCY', name: 'London City',              country: 'UK'           },
  { code: 'MAN', name: 'Manchester',               country: 'UK'           },
  { code: 'BHX', name: 'Birmingham',               country: 'UK'           },
  { code: 'EDI', name: 'Edinburgh',                country: 'UK'           },
  { code: 'GLA', name: 'Glasgow',                  country: 'UK'           },
  { code: 'BRS', name: 'Bristol',                  country: 'UK'           },
  { code: 'DXB', name: 'Dubai International',      country: 'UAE'          },
  { code: 'AUH', name: 'Abu Dhabi',                country: 'UAE'          },
  { code: 'PMI', name: 'Palma de Mallorca',        country: 'Spain'        },
  { code: 'BCN', name: 'Barcelona',                country: 'Spain'        },
  { code: 'MAD', name: 'Madrid Barajas',           country: 'Spain'        },
  { code: 'ALC', name: 'Alicante',                 country: 'Spain'        },
  { code: 'CDG', name: 'Paris Charles de Gaulle',  country: 'France'       },
  { code: 'ORY', name: 'Paris Orly',               country: 'France'       },
  { code: 'NCE', name: 'Nice Côte d\'Azur',        country: 'France'       },
  { code: 'AMS', name: 'Amsterdam Schiphol',       country: 'Netherlands'  },
  { code: 'FRA', name: 'Frankfurt',                country: 'Germany'      },
  { code: 'MUC', name: 'Munich',                   country: 'Germany'      },
  { code: 'FCO', name: 'Rome Fiumicino',           country: 'Italy'        },
  { code: 'MXP', name: 'Milan Malpensa',           country: 'Italy'        },
  { code: 'IST', name: 'Istanbul',                 country: 'Turkey'       },
  { code: 'ATH', name: 'Athens',                   country: 'Greece'       },
  { code: 'JNB', name: 'Johannesburg',             country: 'South Africa' },
  { code: 'CPT', name: 'Cape Town',                country: 'South Africa' },
  { code: 'NBO', name: 'Nairobi',                  country: 'Kenya'        },
  { code: 'LOS', name: 'Lagos',                    country: 'Nigeria'      },
  { code: 'ACC', name: 'Accra',                    country: 'Ghana'        },
  { code: 'DOH', name: 'Doha Hamad',               country: 'Qatar'        },
  { code: 'SIN', name: 'Singapore Changi',         country: 'Singapore'    },
  { code: 'BKK', name: 'Bangkok Suvarnabhumi',     country: 'Thailand'     },
  { code: 'JFK', name: 'New York JFK',             country: 'USA'          },
  { code: 'LAX', name: 'Los Angeles',              country: 'USA'          },
  { code: 'MIA', name: 'Miami',                    country: 'USA'          },
  { code: 'YYZ', name: 'Toronto Pearson',          country: 'Canada'       },
  { code: 'YVR', name: 'Vancouver',                country: 'Canada'       },
]

export interface TransferSearchParams {
  fromCode:  string
  fromName:  string
  toCode:    string
  toName:    string
  fromDate:  string
  fromTime:  string
  adults:    number
  children:  number
}

interface Props {
  onSearch?: (params: TransferSearchParams) => void
  loading?: boolean
}

function AirportPicker({
  label,
  value,
  onSelect,
}: {
  label: string
  value: { code: string; name: string } | null
  onSelect: (a: { code: string; name: string; country: string }) => void
}) {
  const [query, setQuery] = useState(value ? `${value.code} – ${value.name}` : '')
  const [open,  setOpen]  = useState(false)

  const filtered = query.length >= 1
    ? AIRPORTS.filter(a =>
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        a.code.toLowerCase().startsWith(query.toLowerCase()) ||
        a.country.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : AIRPORTS.slice(0, 8)

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">{label}</label>
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search airport or city…"
        className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C9A84C]"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 right-0 bg-[#0B1F3A] border border-white/15 rounded-xl shadow-2xl z-20 max-h-56 overflow-y-auto">
            {filtered.map(a => (
              <button
                key={a.code}
                type="button"
                onClick={() => {
                  setQuery(`${a.code} – ${a.name}`)
                  onSelect(a)
                  setOpen(false)
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-white/8 transition-colors border-b border-white/5 last:border-0"
              >
                <span className="font-bold text-[#C9A84C] text-xs mr-2">{a.code}</span>
                <span className="text-white text-sm">{a.name}</span>
                <span className="text-white/40 text-xs ml-2">{a.country}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-white/40 text-xs px-4 py-3 text-center">No airports found</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface DropOffOption {
  type: 'IATA' | 'ATLAS' | 'GPS'
  code: string
  name: string
}

interface HotelHit {
  code: string
  type: 'ATLAS' | 'GPS'
  name: string
  city: string
  country: string
}

function DropOffPicker({
  value,
  onSelect,
}: {
  value: DropOffOption | null
  onSelect: (opt: DropOffOption) => void
}) {
  const [query,    setQuery]  = useState(value ? value.name : '')
  const [open,     setOpen]   = useState(false)
  const [hotels,   setHotels] = useState<HotelHit[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const airportHits = query.length >= 1
    ? AIRPORTS.filter(a =>
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        a.code.toLowerCase().startsWith(query.toLowerCase()) ||
        a.country.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 4)
    : AIRPORTS.slice(0, 4)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    setOpen(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.length >= 3) {
      timerRef.current = setTimeout(() => {
        fetch(`/api/transfers/hotel-search?q=${encodeURIComponent(q)}`)
          .then(r => r.json())
          .then(d => setHotels(d.hotels ?? []))
          .catch(() => setHotels([]))
      }, 300)
    } else {
      setHotels([])
    }
  }

  const showAirports = airportHits.length > 0
  const showHotels   = hotels.length > 0
  const showEmpty    = !showAirports && !showHotels

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">
        Drop-off Location
      </label>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        placeholder="Search hotel, airport or city…"
        className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C9A84C]"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 right-0 bg-[#0B1F3A] border border-white/15 rounded-xl shadow-2xl z-20 max-h-64 overflow-y-auto">
            {showAirports && (
              <>
                <p className="text-white/30 text-[10px] font-semibold uppercase tracking-widest px-4 pt-2.5 pb-1">
                  Airports
                </p>
                {airportHits.map(a => (
                  <button
                    key={a.code}
                    type="button"
                    onClick={() => {
                      setQuery(`${a.code} – ${a.name}`)
                      onSelect({ type: 'IATA', code: a.code, name: a.name })
                      setOpen(false)
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/8 transition-colors border-b border-white/5 last:border-0 flex items-center gap-2"
                  >
                    <PlaneTakeoff className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
                    <span className="font-bold text-[#C9A84C] text-xs">{a.code}</span>
                    <span className="text-white text-sm">{a.name}</span>
                    <span className="text-white/40 text-xs ml-auto">{a.country}</span>
                  </button>
                ))}
              </>
            )}
            {showHotels && (
              <>
                <p className="text-white/30 text-[10px] font-semibold uppercase tracking-widest px-4 pt-2.5 pb-1">
                  Hotels
                </p>
                {hotels.map(h => (
                  <button
                    key={h.code}
                    type="button"
                    onClick={() => {
                      setQuery(h.name)
                      onSelect({ type: h.type, code: h.code, name: h.name })
                      setOpen(false)
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/8 transition-colors border-b border-white/5 last:border-0 flex items-center gap-2"
                  >
                    <Building2 className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
                    <span className="text-white text-sm flex-1 min-w-0 truncate">{h.name}</span>
                    {h.city && <span className="text-white/40 text-xs flex-shrink-0">{h.city}</span>}
                  </button>
                ))}
              </>
            )}
            {showEmpty && (
              <p className="text-white/40 text-xs px-4 py-3 text-center">
                {query.length >= 3 ? 'No results found' : 'Type to search…'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function TransferSearchForm({ loading }: Props) {
  const router = useRouter()

  const [from,     setFrom]     = useState<{ code: string; name: string } | null>(null)
  const [to,       setTo]       = useState<DropOffOption | null>(null)
  const [date,     setDate]     = useState('')
  const [time,     setTime]     = useState('10:00')
  const [adults,   setAdults]   = useState(2)
  const [children, setChildren] = useState(0)
  const [error,    setError]    = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!from)  { setError('Select a pickup airport.'); return }
    if (!to)    { setError('Select a drop-off airport.'); return }
    if (!date)  { setError('Select a travel date.'); return }
    setError(null)
    const qs = new URLSearchParams({
      from:     from.code,
      to:       to.code,
      toType:   to.type,
      date,
      time:     time || '10:00',
      adults:   String(adults),
      children: String(children),
    })
    router.push(`/transfers/results?${qs}`)
  }

  return (
    <form onSubmit={handleSearch} className="bg-white/8 border border-white/12 rounded-2xl p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AirportPicker
          label="Pickup Location"
          value={from}
          onSelect={a => setFrom({ code: a.code, name: a.name })}
        />
        <DropOffPicker
          value={to}
          onSelect={setTo}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">Date</label>
          <input
            type="date" min={today} value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-3 py-3 text-sm outline-none focus:border-[#C9A84C] [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">Time</label>
          <input
            type="time" value={time}
            onChange={e => setTime(e.target.value)}
            className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-3 py-3 text-sm outline-none focus:border-[#C9A84C] [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">Adults</label>
          <div className="flex items-center bg-white/10 border border-white/20 rounded-xl px-3 py-2 gap-2">
            <button type="button" onClick={() => setAdults(Math.max(1, adults - 1))} className="text-white/60 hover:text-white w-5 h-5 text-lg leading-none">−</button>
            <span className="text-white text-sm flex-1 text-center">{adults}</span>
            <button type="button" onClick={() => setAdults(Math.min(16, adults + 1))} className="text-white/60 hover:text-white w-5 h-5 text-lg leading-none">+</button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">Children</label>
          <div className="flex items-center bg-white/10 border border-white/20 rounded-xl px-3 py-2 gap-2">
            <button type="button" onClick={() => setChildren(Math.max(0, children - 1))} className="text-white/60 hover:text-white w-5 h-5 text-lg leading-none">−</button>
            <span className="text-white text-sm flex-1 text-center">{children}</span>
            <button type="button" onClick={() => setChildren(Math.min(8, children + 1))} className="text-white/60 hover:text-white w-5 h-5 text-lg leading-none">+</button>
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={loading || !from || !to}
        className="w-full bg-[#C9A84C] hover:bg-[#d4b05a] disabled:opacity-60 disabled:cursor-not-allowed text-[#0B1F3A] font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Search className="w-4 h-4" />
            Search Transfers
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  )
}
