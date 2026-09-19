'use client'

// Airport/IATA selection — reused contract, not a new supplier integration.
//
// components/flights/FlightSearchWidget.tsx (the full public flight search
// widget) already has this exact control — a small suggestions dropdown fed
// by GET /api/places?q=<text> — but it's a module-private function defined
// inline there (not exported), and that file is a read-only reference for
// this drawer (UX-4.2b Agent E scope). This is a same-contract extraction:
// identical props ({ airports, onSelect }), identical shape (ApiAirport),
// identical /api/places lookup — so CreateQuoteDrawer.tsx can force a real
// airport selection (a resolved IATA code, not raw keystrokes) without
// touching FlightSearchWidget.tsx.

export interface ApiAirport { code: string; city: string; name: string; country: string }

export function AirportDropdown({ airports, onSelect }: { airports: ApiAirport[]; onSelect: (a: ApiAirport) => void }) {
  return (
    <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-white rounded-xl shadow-xl border border-walz-border z-50 overflow-hidden">
      {airports.map(a => (
        <button key={a.code} type="button" onMouseDown={() => onSelect(a)}
          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-walz-off-white transition-colors text-left">
          <span className="text-walz-gold font-bold text-xs w-9 flex-shrink-0">{a.code}</span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-walz-deep-navy truncate">{a.city}</p>
            <p className="text-[10px] text-walz-muted-strong truncate">{a.name} · {a.country}</p>
          </div>
        </button>
      ))}
    </div>
  )
}

// Same endpoint FlightSearchWidget.tsx's fetchAirports()/fetchMcAirports()
// call — no new supplier/lookup infrastructure introduced here.
export async function fetchAirportSuggestions(q: string): Promise<ApiAirport[]> {
  if (q.trim().length < 2) return []
  try {
    const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`)
    const data = await res.json() as { data?: ApiAirport[] }
    return data.data ?? []
  } catch {
    return []
  }
}
