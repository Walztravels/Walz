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
// QUOTE BUILDER V1.2 step 1: all four items' underlying business logic
// (search functions, airport selection, multi-city legs, pending-offer
// pricing/revalidation/attach) was mechanically extracted, unchanged, out
// of CreateQuoteDrawer.tsx into this hook. Assertions on that logic below
// now read hookSrc.
const hookSrc = read('app/admin/inbox/components/quote-builder/useQuoteBuilderState.ts')
// QUOTE BUILDER V1.2 step 2/3: CreateQuoteDrawer.tsx now renders no
// workspace JSX of its own (see its own header comment) — every field/
// button/banner below moved into the desktop/tablet/mobile workspace
// trees. Assertions on that JSX read the specific tree file(s) it now
// lives in, checking the SAME invariant in every tree that independently
// renders it (never narrowed to a single breakpoint just because it's
// easier).
const desktopFlightPanelSrc = read('app/admin/inbox/components/quote-builder/desktop/panels/FlightPanel.tsx')
const desktopMultiCityLegsSrc = read('app/admin/inbox/components/quote-builder/desktop/panels/MultiCityLegsDesktop.tsx')
const mobileFlightPanelSrc = read('app/admin/inbox/components/quote-builder/mobile/panels/FlightPanel.tsx')
const mobileMultiCityCardsSrc = read('app/admin/inbox/components/quote-builder/mobile/MultiCityMobileCards.tsx')
const desktopTransferPanelSrc = read('app/admin/inbox/components/quote-builder/desktop/panels/TransferPanel.tsx')
const mobileTransferPanelSrc = read('app/admin/inbox/components/quote-builder/mobile/panels/TransferPanel.tsx')
const desktopSelectPriceSrc = read('app/admin/inbox/components/quote-builder/desktop/SelectPricePanel.tsx')
const mobileSelectPriceSrc = read('app/admin/inbox/components/quote-builder/mobile/SelectPricePanel.tsx')

describe('Item F — activities search sends the quote currency (QA closing fix)', () => {
  it('searchActivitiesLive includes the quote currency in its query string, so Viator (which honors ?currency=) returns offers priced to match the quote', () => {
    const fnStart = hookSrc.indexOf('async function searchActivitiesLive')
    const fnEnd = hookSrc.indexOf('async function searchTransfersLive')
    expect(fnStart).toBeGreaterThan(-1)
    expect(fnEnd).toBeGreaterThan(fnStart)
    const fn = hookSrc.slice(fnStart, fnEnd)
    // QA review found the server/lib currency plumbing (activities/route.ts
    // + lib/activities/*) was correctly built and tested, but this exact
    // call site was never updated to actually send it — closing that gap.
    expect(fn).toMatch(/new URLSearchParams\(\{[^}]*currency[^}]*\}\)/)
  })
})

describe('Item A — flight search error surfacing', () => {
  it('searchFlightsLive still surfaces the server-supplied error message as-is, never discarding it', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function searchFlightsLive'), hookSrc.indexOf('async function searchHotelsLive'))
    expect(fn).toContain("setLiveError(data?.error ?? 'Flight search failed.')")
  })
})

describe('Item B — airport/IATA selection', () => {
  it('the flight panels import AirportDropdown for their JSX (desktop + mobile, each split further into a single-leg panel and a multi-city-legs component) and useQuoteBuilderState imports fetchAirportSuggestions/ApiAirport for its search logic — none of them reach into the read-only FlightSearchWidget.tsx', () => {
    // QUOTE BUILDER V1.2: this import now lives in FOUR JSX files (desktop
    // FlightPanel + MultiCityLegsDesktop, mobile FlightPanel +
    // MultiCityMobileCards) instead of one CreateQuoteDrawer.tsx — the
    // hook still only calls fetchAirportSuggestions()/uses the ApiAirport
    // type, and CreateQuoteDrawer.tsx itself renders no AirportDropdown at
    // all any more (it renders no workspace JSX — see its own header
    // comment). Neither the hook nor any of the four JSX files reaches
    // into FlightSearchWidget.tsx.
    for (const src of [desktopFlightPanelSrc, desktopMultiCityLegsSrc, mobileFlightPanelSrc, mobileMultiCityCardsSrc]) {
      expect(src).toContain("import { AirportDropdown } from '@/app/admin/inbox/components/AirportDropdown'")
      expect(src).not.toContain("from '@/components/flights/FlightSearchWidget'")
    }
    expect(drawerSrc).not.toContain('AirportDropdown')
    expect(hookSrc).toContain("import { fetchAirportSuggestions, type ApiAirport } from '@/app/admin/inbox/components/AirportDropdown'")
    expect(hookSrc).not.toContain("from '@/components/flights/FlightSearchWidget'")
  })

  it('the extracted AirportDropdown has the exact same prop contract as FlightSearchWidget.tsx\'s ({ airports, onSelect }) and hits the same /api/places lookup', () => {
    expect(airportDropdownSrc).toContain('export function AirportDropdown({ airports, onSelect }: { airports: ApiAirport[]; onSelect: (a: ApiAirport) => void })')
    expect(airportDropdownSrc).toContain('fetch(`/api/places?q=${encodeURIComponent(q)}`)')
  })

  it('flFrom/flTo are resolved IATA codes populated ONLY via a selection handler, not the raw input onChange', () => {
    expect(hookSrc).toContain('function selectFlFrom(a: ApiAirport)')
    expect(hookSrc).toContain('function selectFlTo(a: ApiAirport)')
    expect(hookSrc).toContain('setFlFrom(a.code)')
    expect(hookSrc).toContain('setFlTo(a.code)')
    // The raw query-change handlers clear the resolved code so a half-typed
    // query can never be sent to the search route as though it were a code.
    expect(hookSrc).toContain("setFlFromQuery(v); setFlFrom('')")
    expect(hookSrc).toContain("setFlToQuery(v); setFlTo('')")
  })

  it('the flight search form renders AirportDropdown for both the single from/to fields and each multi-city leg — true independently in BOTH the desktop and mobile trees (tablet reuses the mobile files unmodified)', () => {
    // Originally one file, one count of 4 (2 single from/to + 2 per
    // multi-city leg). QUOTE BUILDER V1.2 split each breakpoint's flight
    // search into a single-leg panel plus a dedicated multi-city-legs
    // component, so the SAME 2+2=4 invariant is now checked per pair of
    // files, once for desktop and once for mobile — never narrowed to only
    // one breakpoint.
    const desktopOccurrences = desktopFlightPanelSrc.split('<AirportDropdown airports=').length - 1
      + desktopMultiCityLegsSrc.split('<AirportDropdown airports=').length - 1
    const mobileOccurrences = mobileFlightPanelSrc.split('<AirportDropdown airports=').length - 1
      + mobileMultiCityCardsSrc.split('<AirportDropdown airports=').length - 1
    expect(desktopOccurrences).toBe(4)
    expect(mobileOccurrences).toBe(4)
  })
})

describe('Item C — multi-city trip type', () => {
  it('trip type is widened to one-way | round-trip | multi-city (was two options)', () => {
    // The flTrip state declaration lives in useQuoteBuilderState.ts
    // (unchanged). QUOTE BUILDER V1.2: the <select> options rendering it
    // moved into the desktop and mobile FlightPanel.tsx trees (tablet
    // reuses the mobile one) — checked in both, not just one.
    expect(hookSrc).toContain("useState<'one-way' | 'round-trip' | 'multi-city'>('one-way')")
    for (const src of [desktopFlightPanelSrc, mobileFlightPanelSrc]) {
      expect(src).toContain('<option value="one-way">One-way</option>')
      expect(src).toContain('<option value="round-trip">Return</option>')
      expect(src).toContain('<option value="multi-city">Multi-city</option>')
    }
  })

  it('reuses the exact same multi-city leg cap (5) and min-legs (2) as FlightSearchWidget.tsx\'s addMcLeg/removeMcLeg', () => {
    expect(hookSrc).toContain('export const MC_MAX_LEGS = 5')
    expect(hookSrc).toContain('if (mcLegs.length >= MC_MAX_LEGS) return')
    expect(hookSrc).toContain('if (mcLegs.length <= 2) return')
    expect(hookSrc).toContain('useState<FlLeg[]>([emptyFlLeg(), emptyFlLeg()])')
  })

  it('updateMcLeg auto-fills the next leg\'s origin from the current leg\'s destination, same as FlightSearchWidget.tsx', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('function updateMcLeg'), hookSrc.indexOf('function addMcLeg'))
    expect(fn).toContain('if (patch.toCode && i < prev.length - 1)')
    expect(fn).toContain('next[i + 1] = { ...next[i + 1], from: next[i].to, fromCode: patch.toCode }')
  })

  it('searchFlightsLive sends {trip: "multi-city", segments, cabin, adults} to the SAME /api/admin/travel-search/flights route — no backend change needed', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function searchFlightsLive'), hookSrc.indexOf('async function searchHotelsLive'))
    expect(fn).toContain("trip: 'multi-city'")
    expect(fn).toContain('segments: mcLegs.map(l => ({ from: l.fromCode, to: l.toCode, date: l.depart }))')
    expect(fn).toContain("cabin: flCabin, adults: flAdults")
    // Exactly one fetch call site in this function — multi-city and
    // one-way/round-trip share it (only the request body differs).
    const fetchOccurrences = fn.split("fetch('/api/admin/travel-search/flights'").length - 1
    expect(fetchOccurrences).toBe(1)
  })

  it('a multi-city search with an incomplete leg is blocked client-side before any fetch', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function searchFlightsLive'), hookSrc.indexOf('async function searchHotelsLive'))
    const guardIdx = fn.indexOf('Every leg needs an origin, destination and date.')
    const fetchIdx = fn.indexOf("fetch('/api/admin/travel-search/flights'")
    expect(guardIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(fetchIdx)
  })
})

describe('Item D — transfer graceful unavailability', () => {
  it('a TRANSFER_UNAVAILABLE (503) response is distinguished from the generic liveError with a calmer message pointing at the manual line-item form', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function searchTransfersLive'), hookSrc.indexOf('// ── UX-4.2b — pending offer'))
    expect(fn).toContain("data?.code === 'TRANSFER_UNAVAILABLE'")
    expect(fn).toContain('setTransferUnavailable(')
    expect(fn).toContain('temporarily unavailable')
    expect(fn).toContain('manually')
  })

  it('the transfer search fetch stays wrapped in try/catch — a network failure cannot crash the drawer or block the rest of the quote', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function searchTransfersLive'), hookSrc.indexOf('// ── UX-4.2b — pending offer'))
    expect(fn).toMatch(/try\s*{[\s\S]*}\s*catch\s*{[\s\S]*}\s*finally\s*{/)
  })

  it('the manual line-item form (addItem/itemTitle/itemPrice) is untouched and remains the documented fallback', () => {
    expect(hookSrc).toContain('function addItem()')
    expect(hookSrc).toContain("if (!itemTitle.trim() || !isValidAmountMajor(Number(itemPrice))) return")
  })

  it('the transferUnavailable banner renders distinctly (role="status", not role="alert" / red liveError styling) — true independently in BOTH the desktop and mobile Transfer panels (tablet reuses the mobile one)', () => {
    for (const src of [desktopTransferPanelSrc, mobileTransferPanelSrc]) {
      const idx = src.indexOf('{transferUnavailable && (')
      expect(idx).toBeGreaterThan(-1)
      const block = src.slice(idx, idx + 300)
      expect(block).toContain('role="status"')
    }
  })
})

describe('Item E — hotel price-change acceptance', () => {
  it('confirmAddPending branches on PRICE_CHANGED_REQUIRES_ACCEPTANCE (409) and stages a priceChange prompt instead of a flat rejection', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function confirmAddPending'), hookSrc.indexOf('function cancelPriceChange'))
    expect(fn).toContain("data?.code === 'PRICE_CHANGED_REQUIRES_ACCEPTANCE'")
    expect(fn).toContain('setPriceChange({')
    expect(fn).toContain('newNetMinor: Number(data.newNetMinor)')
    expect(fn).toContain('newSellingPriceMinor: Number(data.newSellingPriceMinor)')
  })

  it('acceptPriceChange resubmits the SAME add-to-quote payload but with new*Minor values in place of the original cost/markup/serviceFee/sellingPrice', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('async function acceptPriceChange'), hookSrc.indexOf('async function handleCreate'))
    expect(fn).toContain('buildAttachPayload(qid, pending, newNetMinor, newMarkupMinor, newServiceFeeMinor, newSellingPriceMinor)')
  })

  it('there is exactly ONE /add-to-quote fetch call site shared by confirmAddPending and acceptPriceChange (via postAddToQuote), not a duplicated call', () => {
    const occurrences = hookSrc.split("fetch('/api/admin/travel-search/add-to-quote'").length - 1
    expect(occurrences).toBe(1)
    expect(hookSrc).toContain('async function postAddToQuote(payload: AddToQuotePayload)')
  })

  it('acceptance is never automatic — it requires an explicit staff click on "Accept new price" — true independently in BOTH the desktop and mobile Select & Price panels (tablet reuses the mobile one)', () => {
    // QUOTE BUILDER V1.2: the whole Select & Price pending-offer block
    // (including this acceptance button) moved out of CreateQuoteDrawer.tsx
    // (which no longer references priceChange/acceptPriceChange at all)
    // into a dedicated panel built independently for desktop and mobile.
    // Desktop destructures `acceptPriceChange` off `state` directly; mobile
    // calls it as `state.acceptPriceChange()` — both are checked with the
    // call site's actual spelling rather than forcing one convention.
    expect(drawerSrc).not.toContain('acceptPriceChange')
    expect(desktopSelectPriceSrc).not.toMatch(/priceChange\s*&&\s*void acceptPriceChange\(\)/)
    const desktopIdx = desktopSelectPriceSrc.indexOf('onClick={() => void acceptPriceChange()}')
    expect(desktopIdx).toBeGreaterThan(-1)
    expect(desktopSelectPriceSrc.slice(desktopIdx, desktopSelectPriceSrc.indexOf('</button>', desktopIdx))).toContain('Accept new price')

    expect(mobileSelectPriceSrc).not.toMatch(/priceChange\s*&&\s*void state\.acceptPriceChange\(\)/)
    const mobileIdx = mobileSelectPriceSrc.indexOf('onClick={() => void state.acceptPriceChange()}')
    expect(mobileIdx).toBeGreaterThan(-1)
    expect(mobileSelectPriceSrc.slice(mobileIdx, mobileSelectPriceSrc.indexOf('</button>', mobileIdx))).toContain('Accept new price')
  })

  it('the price-change prompt formats amounts using the same fmtMinor helper used elsewhere for prices — true independently in BOTH the desktop and mobile Select & Price panels', () => {
    for (const src of [desktopSelectPriceSrc, mobileSelectPriceSrc]) {
      const idx = src.indexOf("This rate&apos;s price has changed from")
      expect(idx).toBeGreaterThan(-1)
      const block = src.slice(idx - 50, idx + 250)
      expect(block).toContain('fmtMinor(priceChange.oldSellingPriceMinor, priceChange.currency)')
      expect(block).toContain('fmtMinor(priceChange.newSellingPriceMinor, priceChange.currency)')
    }
  })

  it('a fresh pending offer (openPending) clears any stale priceChange prompt', () => {
    const fn = hookSrc.slice(hookSrc.indexOf('function openPending'), hookSrc.indexOf('async function revalidateFlight'))
    expect(fn).toContain('setPriceChange(null)')
  })
})
