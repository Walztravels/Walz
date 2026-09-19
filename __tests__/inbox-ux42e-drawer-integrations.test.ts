/**
 * UX-4.2b (Phase 2 — Agent E, CreateQuoteDrawer integration).
 *
 * Four backend contracts landed independently (already tested elsewhere —
 * see admin-travel-search-error-handling.test.ts for the flights/transfers
 * route fixes, activities-*-currency*.test.ts for the activities currency
 * plumbing, and inbox-ux42c-closing-fixes.test.ts for the hotel
 * price-change route shape). This file source-pins the CLIENT side of each
 * integration in CreateQuoteDrawer.tsx — same convention as every sibling
 * inbox-ux42*.test.ts file (the suite's default testEnvironment is 'node',
 * so React isn't rendered; the file's source is read and asserted on
 * directly).
 *
 *  A. Flight error surfacing — no client change needed; confirmed here.
 *  B. Airport/IATA selection — a real AirportDropdown-backed selection
 *     (extracted, same-contract, from FlightSearchWidget.tsx's read-only
 *     reference) replaces free-text flFrom/flTo.
 *  C. Multi-city trip type — widened to one-way/round-trip/multi-city with
 *     a leg-builder mirroring FlightSearchWidget.tsx's mcLegs pattern.
 *  D. Transfer graceful unavailability — TRANSFER_UNAVAILABLE (503) gets a
 *     calmer, distinct message pointing at the existing manual-item form.
 *  E. Hotel price-change acceptance — PRICE_CHANGED_REQUIRES_ACCEPTANCE
 *     (409) surfaces an explicit accept action; never auto-accepted.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const drawerSrc = read('app/admin/inbox/components/CreateQuoteDrawer.tsx')
const airportDropdownSrc = read('app/admin/inbox/components/AirportDropdown.tsx')

describe('Item F — activities search sends the quote currency (QA closing fix)', () => {
  it('searchActivitiesLive includes the quote currency in its query string, so Viator (which honors ?currency=) returns offers priced to match the quote', () => {
    const fnStart = drawerSrc.indexOf('async function searchActivitiesLive')
    const fnEnd = drawerSrc.indexOf('async function searchTransfersLive')
    expect(fnStart).toBeGreaterThan(-1)
    expect(fnEnd).toBeGreaterThan(fnStart)
    const fn = drawerSrc.slice(fnStart, fnEnd)
    // QA review found the server/lib currency plumbing (activities/route.ts
    // + lib/activities/*) was correctly built and tested, but this exact
    // call site was never updated to actually send it — closing that gap.
    expect(fn).toMatch(/new URLSearchParams\(\{[^}]*currency[^}]*\}\)/)
  })
})

describe('Item A — flight search error surfacing', () => {
  it('searchFlightsLive still surfaces the server-supplied error message as-is, never discarding it', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function searchFlightsLive'), drawerSrc.indexOf('async function searchHotelsLive'))
    expect(fn).toContain("setLiveError(data?.error ?? 'Flight search failed.')")
  })
})

describe('Item B — airport/IATA selection', () => {
  it('CreateQuoteDrawer imports AirportDropdown/fetchAirportSuggestions from a same-contract extraction, not from the read-only FlightSearchWidget.tsx', () => {
    expect(drawerSrc).toContain("import { AirportDropdown, fetchAirportSuggestions, type ApiAirport } from '@/app/admin/inbox/components/AirportDropdown'")
    expect(drawerSrc).not.toContain("from '@/components/flights/FlightSearchWidget'")
  })

  it('the extracted AirportDropdown has the exact same prop contract as FlightSearchWidget.tsx\'s ({ airports, onSelect }) and hits the same /api/places lookup', () => {
    expect(airportDropdownSrc).toContain('export function AirportDropdown({ airports, onSelect }: { airports: ApiAirport[]; onSelect: (a: ApiAirport) => void })')
    expect(airportDropdownSrc).toContain('fetch(`/api/places?q=${encodeURIComponent(q)}`)')
  })

  it('flFrom/flTo are resolved IATA codes populated ONLY via a selection handler, not the raw input onChange', () => {
    expect(drawerSrc).toContain('function selectFlFrom(a: ApiAirport)')
    expect(drawerSrc).toContain('function selectFlTo(a: ApiAirport)')
    expect(drawerSrc).toContain('setFlFrom(a.code)')
    expect(drawerSrc).toContain('setFlTo(a.code)')
    // The raw query-change handlers clear the resolved code so a half-typed
    // query can never be sent to the search route as though it were a code.
    expect(drawerSrc).toContain("setFlFromQuery(v); setFlFrom('')")
    expect(drawerSrc).toContain("setFlToQuery(v); setFlTo('')")
  })

  it('the flight search form renders AirportDropdown for both the single from/to fields and each multi-city leg', () => {
    const occurrences = drawerSrc.split('<AirportDropdown airports=').length - 1
    // 2 (single from/to) + 2 per multi-city leg (from/to) = 4
    expect(occurrences).toBe(4)
  })
})

describe('Item C — multi-city trip type', () => {
  it('trip type is widened to one-way | round-trip | multi-city (was two options)', () => {
    expect(drawerSrc).toContain("useState<'one-way' | 'round-trip' | 'multi-city'>('one-way')")
    const fn = drawerSrc.slice(drawerSrc.indexOf('{liveTab === \'flight\''), drawerSrc.indexOf('{liveTab === \'hotel\''))
    expect(fn).toContain('<option value="one-way">One-way</option>')
    expect(fn).toContain('<option value="round-trip">Return</option>')
    expect(fn).toContain('<option value="multi-city">Multi-city</option>')
  })

  it('reuses the exact same multi-city leg cap (5) and min-legs (2) as FlightSearchWidget.tsx\'s addMcLeg/removeMcLeg', () => {
    expect(drawerSrc).toContain('const MC_MAX_LEGS = 5')
    expect(drawerSrc).toContain('if (mcLegs.length >= MC_MAX_LEGS) return')
    expect(drawerSrc).toContain('if (mcLegs.length <= 2) return')
    expect(drawerSrc).toContain('useState<FlLeg[]>([emptyFlLeg(), emptyFlLeg()])')
  })

  it('updateMcLeg auto-fills the next leg\'s origin from the current leg\'s destination, same as FlightSearchWidget.tsx', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('function updateMcLeg'), drawerSrc.indexOf('function addMcLeg'))
    expect(fn).toContain('if (patch.toCode && i < prev.length - 1)')
    expect(fn).toContain('next[i + 1] = { ...next[i + 1], from: next[i].to, fromCode: patch.toCode }')
  })

  it('searchFlightsLive sends {trip: "multi-city", segments, cabin, adults} to the SAME /api/admin/travel-search/flights route — no backend change needed', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function searchFlightsLive'), drawerSrc.indexOf('async function searchHotelsLive'))
    expect(fn).toContain("trip: 'multi-city'")
    expect(fn).toContain('segments: mcLegs.map(l => ({ from: l.fromCode, to: l.toCode, date: l.depart }))')
    expect(fn).toContain("cabin: flCabin, adults: flAdults")
    // Exactly one fetch call site in this function — multi-city and
    // one-way/round-trip share it (only the request body differs).
    const fetchOccurrences = fn.split("fetch('/api/admin/travel-search/flights'").length - 1
    expect(fetchOccurrences).toBe(1)
  })

  it('a multi-city search with an incomplete leg is blocked client-side before any fetch', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function searchFlightsLive'), drawerSrc.indexOf('async function searchHotelsLive'))
    const guardIdx = fn.indexOf('Every leg needs an origin, destination and date.')
    const fetchIdx = fn.indexOf("fetch('/api/admin/travel-search/flights'")
    expect(guardIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(fetchIdx)
  })
})

describe('Item D — transfer graceful unavailability', () => {
  it('a TRANSFER_UNAVAILABLE (503) response is distinguished from the generic liveError with a calmer message pointing at the manual line-item form', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function searchTransfersLive'), drawerSrc.indexOf('// ── UX-4.2b — pending offer'))
    expect(fn).toContain("data?.code === 'TRANSFER_UNAVAILABLE'")
    expect(fn).toContain('setTransferUnavailable(')
    expect(fn).toContain('temporarily unavailable')
    expect(fn).toContain('manually')
  })

  it('the transfer search fetch stays wrapped in try/catch — a network failure cannot crash the drawer or block the rest of the quote', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function searchTransfersLive'), drawerSrc.indexOf('// ── UX-4.2b — pending offer'))
    expect(fn).toMatch(/try\s*{[\s\S]*}\s*catch\s*{[\s\S]*}\s*finally\s*{/)
  })

  it('the manual line-item form (addItem/itemTitle/itemPrice) is untouched and remains the documented fallback', () => {
    expect(drawerSrc).toContain('function addItem()')
    expect(drawerSrc).toContain("if (!itemTitle.trim() || !isValidAmountMajor(Number(itemPrice))) return")
  })

  it('the transferUnavailable banner renders distinctly (role="status", not role="alert" / red liveError styling)', () => {
    const idx = drawerSrc.indexOf('{transferUnavailable && (')
    expect(idx).toBeGreaterThan(-1)
    const block = drawerSrc.slice(idx, idx + 300)
    expect(block).toContain('role="status"')
  })
})

describe('Item E — hotel price-change acceptance', () => {
  it('confirmAddPending branches on PRICE_CHANGED_REQUIRES_ACCEPTANCE (409) and stages a priceChange prompt instead of a flat rejection', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function confirmAddPending'), drawerSrc.indexOf('function cancelPriceChange'))
    expect(fn).toContain("data?.code === 'PRICE_CHANGED_REQUIRES_ACCEPTANCE'")
    expect(fn).toContain('setPriceChange({')
    expect(fn).toContain('newNetMinor: Number(data.newNetMinor)')
    expect(fn).toContain('newSellingPriceMinor: Number(data.newSellingPriceMinor)')
  })

  it('acceptPriceChange resubmits the SAME add-to-quote payload but with new*Minor values in place of the original cost/markup/serviceFee/sellingPrice', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('async function acceptPriceChange'), drawerSrc.indexOf('async function handleCreate'))
    expect(fn).toContain('buildAttachPayload(qid, pending, newNetMinor, newMarkupMinor, newServiceFeeMinor, newSellingPriceMinor)')
  })

  it('there is exactly ONE /add-to-quote fetch call site shared by confirmAddPending and acceptPriceChange (via postAddToQuote), not a duplicated call', () => {
    const occurrences = drawerSrc.split("fetch('/api/admin/travel-search/add-to-quote'").length - 1
    expect(occurrences).toBe(1)
    expect(drawerSrc).toContain('async function postAddToQuote(payload: AddToQuotePayload)')
  })

  it('acceptance is never automatic — it requires an explicit staff click on "Accept new price"', () => {
    expect(drawerSrc).not.toMatch(/priceChange\s*&&\s*void acceptPriceChange\(\)/)
    const idx = drawerSrc.indexOf('onClick={() => void acceptPriceChange()}')
    expect(idx).toBeGreaterThan(-1)
    const btn = drawerSrc.slice(idx, drawerSrc.indexOf('</button>', idx))
    expect(btn).toContain('Accept new price')
  })

  it('the price-change prompt formats amounts using the same fmtMinor helper used elsewhere in this file for prices', () => {
    const idx = drawerSrc.indexOf("This rate&apos;s price has changed from")
    expect(idx).toBeGreaterThan(-1)
    const block = drawerSrc.slice(idx - 50, idx + 250)
    expect(block).toContain('fmtMinor(priceChange.oldSellingPriceMinor, priceChange.currency)')
    expect(block).toContain('fmtMinor(priceChange.newSellingPriceMinor, priceChange.currency)')
  })

  it('a fresh pending offer (openPending) clears any stale priceChange prompt', () => {
    const fn = drawerSrc.slice(drawerSrc.indexOf('function openPending'), drawerSrc.indexOf('async function revalidateFlight'))
    expect(fn).toContain('setPriceChange(null)')
  })
})
