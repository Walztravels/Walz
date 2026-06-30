import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'

// Curated airport-adjacent and city-centre hotels for Walz's key markets.
// type:'IATA' means the transfer destination is resolved via the nearest airport code.
// This is the reliable fallback because the Hotelbeds test API has no real hotel name data.
const STATIC_HOTELS: Array<{ code: string; type: 'IATA'; name: string; city: string; country: string }> = [
  // ── London Heathrow ──────────────────────────────────────────────────────
  { code: 'LHR', type: 'IATA', name: 'Hilton London Heathrow Airport Terminal 5', city: 'London', country: 'UK' },
  { code: 'LHR', type: 'IATA', name: 'Sofitel London Heathrow',                   city: 'London', country: 'UK' },
  { code: 'LHR', type: 'IATA', name: 'Radisson Blu Edwardian Heathrow',           city: 'London', country: 'UK' },
  { code: 'LHR', type: 'IATA', name: 'Novotel London Heathrow',                   city: 'London', country: 'UK' },
  { code: 'LHR', type: 'IATA', name: 'AC Hotel by Marriott London Heathrow',      city: 'London', country: 'UK' },
  { code: 'LHR', type: 'IATA', name: 'Holiday Inn Express Heathrow Terminal 4',   city: 'London', country: 'UK' },
  // ── London Gatwick ───────────────────────────────────────────────────────
  { code: 'LGW', type: 'IATA', name: 'Hilton London Gatwick Airport',             city: 'Crawley', country: 'UK' },
  { code: 'LGW', type: 'IATA', name: 'Novotel London Gatwick Airport',            city: 'Crawley', country: 'UK' },
  { code: 'LGW', type: 'IATA', name: 'Premier Inn London Gatwick Airport',        city: 'Crawley', country: 'UK' },
  // ── London Stansted ──────────────────────────────────────────────────────
  { code: 'STN', type: 'IATA', name: 'Hilton Garden Inn London Stansted Airport', city: 'Stansted', country: 'UK' },
  { code: 'STN', type: 'IATA', name: 'Radisson Blu London Stansted Airport',      city: 'Stansted', country: 'UK' },
  // ── London Luton ─────────────────────────────────────────────────────────
  { code: 'LTN', type: 'IATA', name: 'Hampton by Hilton London Luton Airport',   city: 'Luton', country: 'UK' },
  { code: 'LTN', type: 'IATA', name: 'Premier Inn London Luton Airport',          city: 'Luton', country: 'UK' },
  // ── Manchester ───────────────────────────────────────────────────────────
  { code: 'MAN', type: 'IATA', name: 'Hilton Manchester Airport',                 city: 'Manchester', country: 'UK' },
  { code: 'MAN', type: 'IATA', name: 'Radisson Blu Hotel Manchester Airport',     city: 'Manchester', country: 'UK' },
  // ── London Central (routed via LHR/Heathrow as transfer destination) ─────
  { code: 'LHR', type: 'IATA', name: 'The Langham London',                        city: 'London', country: 'UK' },
  { code: 'LHR', type: 'IATA', name: "Claridge's London",                         city: 'London', country: 'UK' },
  { code: 'LHR', type: 'IATA', name: 'The Ritz London',                           city: 'London', country: 'UK' },
  { code: 'LHR', type: 'IATA', name: 'Hilton London Metropole',                   city: 'London', country: 'UK' },
  { code: 'LHR', type: 'IATA', name: 'Park Lane Hotel London',                    city: 'London', country: 'UK' },
  { code: 'LHR', type: 'IATA', name: 'Marriott London Grosvenor Square',          city: 'London', country: 'UK' },
  { code: 'LHR', type: 'IATA', name: 'DoubleTree by Hilton London Victoria',      city: 'London', country: 'UK' },
  // ── Dubai ─────────────────────────────────────────────────────────────────
  { code: 'DXB', type: 'IATA', name: 'Atlantis The Palm Dubai',                   city: 'Dubai', country: 'UAE' },
  { code: 'DXB', type: 'IATA', name: 'Burj Al Arab Jumeirah',                     city: 'Dubai', country: 'UAE' },
  { code: 'DXB', type: 'IATA', name: 'Jumeirah Beach Hotel',                      city: 'Dubai', country: 'UAE' },
  { code: 'DXB', type: 'IATA', name: 'One&Only Royal Mirage Dubai',               city: 'Dubai', country: 'UAE' },
  { code: 'DXB', type: 'IATA', name: 'Hilton Dubai Al Habtoor City',              city: 'Dubai', country: 'UAE' },
  { code: 'DXB', type: 'IATA', name: 'Marriott Marquis City Center Dubai',        city: 'Dubai', country: 'UAE' },
  { code: 'DXB', type: 'IATA', name: 'DoubleTree by Hilton Dubai Al Jadaf',       city: 'Dubai', country: 'UAE' },
  { code: 'DXB', type: 'IATA', name: 'Waldorf Astoria Dubai Palm Jumeirah',       city: 'Dubai', country: 'UAE' },
  { code: 'DXB', type: 'IATA', name: 'Raffles The Palm Dubai',                    city: 'Dubai', country: 'UAE' },
  // ── Abu Dhabi ─────────────────────────────────────────────────────────────
  { code: 'AUH', type: 'IATA', name: 'Emirates Palace Mandarin Oriental Abu Dhabi', city: 'Abu Dhabi', country: 'UAE' },
  { code: 'AUH', type: 'IATA', name: 'Hilton Abu Dhabi Yas Island',               city: 'Abu Dhabi', country: 'UAE' },
  { code: 'AUH', type: 'IATA', name: 'Marriott Abu Dhabi',                        city: 'Abu Dhabi', country: 'UAE' },
  // ── Nairobi ───────────────────────────────────────────────────────────────
  { code: 'NBO', type: 'IATA', name: 'Villa Rosa Kempinski Nairobi',              city: 'Nairobi', country: 'Kenya' },
  { code: 'NBO', type: 'IATA', name: 'Hilton Nairobi',                            city: 'Nairobi', country: 'Kenya' },
  { code: 'NBO', type: 'IATA', name: 'Radisson Blu Hotel Nairobi Upper Hill',     city: 'Nairobi', country: 'Kenya' },
  { code: 'NBO', type: 'IATA', name: 'JW Marriott Hotel Nairobi',                 city: 'Nairobi', country: 'Kenya' },
  { code: 'NBO', type: 'IATA', name: 'Tribe Hotel Nairobi',                       city: 'Nairobi', country: 'Kenya' },
  // ── Lagos ────────────────────────────────────────────────────────────────
  { code: 'LOS', type: 'IATA', name: 'Eko Hotel & Suites Lagos',                  city: 'Lagos', country: 'Nigeria' },
  { code: 'LOS', type: 'IATA', name: 'Federal Palace Hotel Lagos',                city: 'Lagos', country: 'Nigeria' },
  { code: 'LOS', type: 'IATA', name: 'Radisson Blu Anchorage Hotel Lagos',        city: 'Lagos', country: 'Nigeria' },
  { code: 'LOS', type: 'IATA', name: 'Sheraton Lagos Hotel',                      city: 'Lagos', country: 'Nigeria' },
  { code: 'LOS', type: 'IATA', name: 'Four Points by Sheraton Lagos',             city: 'Lagos', country: 'Nigeria' },
  { code: 'LOS', type: 'IATA', name: 'Oriental Hotel Lagos',                      city: 'Lagos', country: 'Nigeria' },
  // ── Johannesburg ─────────────────────────────────────────────────────────
  { code: 'JNB', type: 'IATA', name: 'Hilton Sandton Johannesburg',               city: 'Johannesburg', country: 'South Africa' },
  { code: 'JNB', type: 'IATA', name: 'Radisson Blu Gautrain Sandton',             city: 'Johannesburg', country: 'South Africa' },
  { code: 'JNB', type: 'IATA', name: 'Marriott Johannesburg Melrose Arch',        city: 'Johannesburg', country: 'South Africa' },
  // ── Cape Town ─────────────────────────────────────────────────────────────
  { code: 'CPT', type: 'IATA', name: 'Cape Grace Cape Town',                      city: 'Cape Town', country: 'South Africa' },
  { code: 'CPT', type: 'IATA', name: 'Belmond Mount Nelson Hotel Cape Town',      city: 'Cape Town', country: 'South Africa' },
  { code: 'CPT', type: 'IATA', name: 'The Twelve Apostles Hotel Cape Town',       city: 'Cape Town', country: 'South Africa' },
  // ── Singapore ─────────────────────────────────────────────────────────────
  { code: 'SIN', type: 'IATA', name: 'Marina Bay Sands Singapore',                city: 'Singapore', country: 'Singapore' },
  { code: 'SIN', type: 'IATA', name: 'Hilton Singapore Orchard',                  city: 'Singapore', country: 'Singapore' },
  // ── Bangkok ───────────────────────────────────────────────────────────────
  { code: 'BKK', type: 'IATA', name: 'Mandarin Oriental Bangkok',                 city: 'Bangkok', country: 'Thailand' },
  { code: 'BKK', type: 'IATA', name: 'Anantara Riverside Bangkok Resort',         city: 'Bangkok', country: 'Thailand' },
]

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ hotels: [] })

  const ql = q.toLowerCase()

  // 1. Static matches — always reliable, real hotel names
  const staticMatches = STATIC_HOTELS.filter(h =>
    h.name.toLowerCase().includes(ql) ||
    h.city.toLowerCase().includes(ql) ||
    h.country.toLowerCase().includes(ql)
  ).slice(0, 6)

  // 2. Live API — augments with real production data when Hotelbeds credentials are upgraded
  //    (currently returns stub "Hotel" entries on the test API — filter those out)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let liveMatches: Array<{ code: string; type: 'ACCOM'; name: string; city: string; country: string }> = []
  if (q.length >= 3) {
    try {
      const data = await hotelbedsRequest('content', '/hotels', {
        params: { name: q, fields: 'basic', language: 'ENG', from: '1', to: '6' },
      })
      console.log('[transfer hotel-search] raw[0]:', JSON.stringify(data?.hotels?.[0] ?? null))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      liveMatches = (data.hotels ?? []).flatMap((h: any) => {
        const rawName = typeof h.name === 'object' ? (h.name?.content ?? '') : (h.name ?? '')
        // Discard test-env stub hotels (name literally "Hotel" or empty)
        if (!rawName || rawName.toLowerCase() === 'hotel' || rawName.length < 5) return []
        const rawCity = typeof h.city === 'object'
          ? (h.city?.content ?? h.destinationName ?? '')
          : (h.destinationName ?? '')
        return [{ code: String(h.code), type: 'ACCOM' as const, name: rawName, city: rawCity, country: h.countryCode ?? '' }]
      }).slice(0, 4)
    } catch {
      // Live API is optional — static list covers the primary use case
    }
  }

  // Merge: static first (always shown), live second (deduplicated by name)
  const seen = new Set(staticMatches.map(h => h.name.toLowerCase()))
  const merged = [
    ...staticMatches,
    ...liveMatches.filter(h => !seen.has(h.name.toLowerCase())),
  ].slice(0, 8)

  return NextResponse.json({ hotels: merged })
}
