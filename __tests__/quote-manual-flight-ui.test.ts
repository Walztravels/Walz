/**
 * QUOTE BUILDER V1.4 — Agent C (Manual Flight Entry).
 * Source-assertion tests for the desktop/mobile ManualItemPanel.tsx UI and
 * useQuoteBuilderState.ts's manual-flight additions — following this
 * codebase's existing pattern for quote-builder UI/hook source pins (see
 * e.g. __tests__/inbox-ux42-quote-builder-v1.2-consistency.test.ts and
 * __tests__/inbox-ux42-create-quote.test.ts), since this test environment
 * is 'node' (no jsdom/RTL) and the hook's fetch/router/context surface is
 * too broad to usefully render in isolation.
 */
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const hookSrc = read('app/admin/inbox/components/quote-builder/useQuoteBuilderState.ts')
const desktopSrc = read('app/admin/inbox/components/quote-builder/desktop/panels/ManualItemPanel.tsx')
const mobileSrc = read('app/admin/inbox/components/quote-builder/mobile/panels/ManualItemPanel.tsx')
const routeSrc = read('app/api/admin/quotes/[id]/items/route.ts')

describe('useQuoteBuilderState.ts — manual flight entry additions', () => {
  it('defines the 4-value cabin constant locally (not imported from FlightPanel/live-search)', () => {
    expect(hookSrc).toMatch(/export const MANUAL_FLIGHT_CABINS = \['economy', 'premium_economy', 'business', 'first'\] as const/)
  })

  it('caps manual multi-city legs (mirrors the live-search MC_MAX_LEGS convention)', () => {
    expect(hookSrc).toMatch(/export const MAX_MANUAL_FLIGHT_LEGS = 5/)
  })

  it('derives trip type from leg count: 1 -> one-way, 2 -> round-trip, 3+ -> multi-city', () => {
    expect(hookSrc).toMatch(
      /mfLegs\.length === 1 \? 'one-way' : mfLegs\.length === 2 \? 'round-trip' : 'multi-city'/,
    )
  })

  it('addManualFlightItem posts to the new per-quote items route, not the deferred items[] draft array', () => {
    expect(hookSrc).toMatch(/async function addManualFlightItem\(\)/)
    expect(hookSrc).toMatch(/fetch\(`\/api\/admin\/quotes\/\$\{qid\}\/items`, \{/)
  })

  it('ensures a quote exists first, exactly like confirmAddPending does for live-search attaches', () => {
    const fnStart = hookSrc.indexOf('async function addManualFlightItem()')
    const fnBody = hookSrc.slice(fnStart, fnStart + 2000)
    expect(fnBody).toMatch(/let qid = quote\?\.id \?\? null/)
    expect(fnBody).toMatch(/handleCreate\(\{ allowEmptyItems: true \}\)/)
  })

  it('currency sent to the server is the quote\'s own `currency` state, not a hardcoded default', () => {
    const fnStart = hookSrc.indexOf('async function addManualFlightItem()')
    const fnBody = hookSrc.slice(fnStart, fnStart + 2000)
    expect(fnBody).toMatch(/costMinor, sellingPriceMinor, currency,/)
  })

  it('a successful add pushes into the SAME attachedLive list live-search flights use (type: \'flight\')', () => {
    const fnStart = hookSrc.indexOf('async function addManualFlightItem()')
    const fnBody = hookSrc.slice(fnStart, fnStart + 3000)
    expect(fnBody).toMatch(/setAttachedLive\(prev => \[\.\.\.prev, \{/)
    expect(fnBody).toMatch(/type: 'flight',/)
  })

  it('mfRemoveLeg refuses to remove leg 0 (outbound is mandatory)', () => {
    expect(hookSrc).toMatch(/function mfRemoveLeg\(i: number\) \{\s*\n\s*if \(i === 0\) return/)
  })

  it('mfAddLeg respects the leg cap', () => {
    const fnStart = hookSrc.indexOf('function mfAddLeg()')
    const fnBody = hookSrc.slice(fnStart, fnStart + 300)
    expect(fnBody).toMatch(/if \(prev\.length >= MAX_MANUAL_FLIGHT_LEGS\) return prev/)
  })

  it('resets all manual-flight form state on resetAndOpen (no stale data across quote-builder sessions)', () => {
    const fnStart = hookSrc.indexOf('const resetAndOpen = useCallback')
    const fnEnd = hookSrc.indexOf('}, [loadRecent])')
    const fnBody = hookSrc.slice(fnStart, fnEnd)
    expect(fnBody).toMatch(/setMfLegs\(\[emptyManualFlightLeg\(\)\]\)/)
    expect(fnBody).toMatch(/setMfAirline\(''\)/)
  })

  it('exposes the new manual-flight state/functions from the hook\'s return object', () => {
    const returnIdx = hookSrc.lastIndexOf('return {')
    const returnBody = hookSrc.slice(returnIdx)
    for (const key of ['mfAirline', 'mfCabin', 'mfLegs', 'mfUpdateLeg', 'mfAddLeg', 'mfRemoveLeg', 'mfBusy', 'mfError', 'addManualFlightItem']) {
      expect(returnBody).toContain(key)
    }
  })
})

describe.each([
  ['desktop', () => desktopSrc],
  ['mobile', () => mobileSrc],
])('%s ManualItemPanel.tsx — flight-specific structured form', (_label, getSrc) => {
  it('branches on itemType === \'flight\' rather than always rendering the generic price-only field', () => {
    const src = getSrc()
    expect(src).toMatch(/const isFlight = itemType === 'flight'/)
    expect(src).toMatch(/!isFlight &&/)
  })

  it('imports the local cabin constant and leg cap from the hook (not from FlightPanel.tsx)', () => {
    const src = getSrc()
    expect(src).toMatch(/MANUAL_FLIGHT_CABINS/)
    expect(src).toMatch(/MAX_MANUAL_FLIGHT_LEGS/)
    expect(src).not.toMatch(/from ['"].*FlightPanel/)
  })

  it('renders one journey section per leg with date/time/flight-number/airport fields', () => {
    const src = getSrc()
    expect(src).toMatch(/mfLegs\.map\(\(leg, i\) => /)
    expect(src).toMatch(/originCode/)
    expect(src).toMatch(/destinationCode/)
    expect(src).toMatch(/departDate/)
    expect(src).toMatch(/departTime/)
    expect(src).toMatch(/arriveDate/)
    expect(src).toMatch(/arriveTime/)
    expect(src).toMatch(/flightNumber/)
  })

  it('shows "+ Add Return" only at 1 leg, and "+ Add Leg" once 2+ legs exist (up to the cap)', () => {
    const src = getSrc()
    expect(src).toMatch(/mfLegs\.length === 1 &&[\s\S]{0,200}\+ Add Return/)
    expect(src).toMatch(/mfLegs\.length >= 2 && mfLegs\.length < MAX_MANUAL_FLIGHT_LEGS[\s\S]{0,200}\+ Add Leg/)
  })

  it('never offers to remove leg 0 (outbound), only later legs', () => {
    const src = getSrc()
    expect(src).toMatch(/\{i > 0 && \(/)
    expect(src).toMatch(/mfRemoveLeg\(i\)/)
  })

  it('submits through addManualFlightItem when itemType is flight, addItem otherwise', () => {
    const src = getSrc()
    expect(src).toMatch(/onClick=\{isFlight \? addManualFlightItem : addItem\}/)
  })

  it('shows supplier cost / selling price / currency fields, defaulting currency to the quote\'s own', () => {
    const src = getSrc()
    expect(src).toMatch(/mfCostMajor/)
    expect(src).toMatch(/mfPriceMajor/)
    expect(src).toMatch(/\{currency\}/)
  })

  it('surfaces a server/validation error to staff (mfError)', () => {
    const src = getSrc()
    expect(src).toMatch(/mfError && /)
  })
})

describe('app/api/admin/quotes/[id]/items/route.ts — scope and safety documentation', () => {
  it('documents that duffelOfferId is always null (no supplier offer for a manual entry)', () => {
    expect(routeSrc).toMatch(/duffelOfferId: null/)
  })

  it('only handles type "flight" / sourceType "manual" today (documented, explicit scope)', () => {
    expect(routeSrc).toMatch(/Only type "flight" is supported by this endpoint\./)
  })
})
