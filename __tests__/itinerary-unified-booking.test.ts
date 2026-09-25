import {
  bookingClientTotal,
  bookingSupplierTotal,
  sumClientTotals,
  sumSupplierTotals,
  isUnifiedFlight,
  flightRouteLabel,
  journeyLabel,
  offerDedupeKey,
  findRowWithOffer,
  type UnifiedFlightBooking,
  type FlightJourney,
} from '@/lib/itinerary/unified-booking'

const seg = (from: string, to: string, no: string) => ({
  from, to, airline: 'Qatar Airways', iataCode: 'QR', flightNumber: no,
  date: '2026-12-01', time: '09:15', arrivalTime: '17:40',
})
const journey = (index: number, direction: FlightJourney['direction'], segs: ReturnType<typeof seg>[]): FlightJourney => ({
  index, direction, segments: segs, stops: segs.length - 1,
})
const booking = (over: Partial<UnifiedFlightBooking> = {}): UnifiedFlightBooking => ({
  id: 'b1', bookingKind: 'unified-flight', tripType: 'return',
  from: 'LHR', to: 'DOH', airline: 'Qatar Airways', iataCode: 'QR', flightNumber: 'QR1408',
  date: '2026-12-01', time: '09:15', arrivalTime: '17:40', class: 'Economy', pnr: '',
  cost: 2353, supplierCost: 2241, status: 'Pending', notes: '',
  journeys: [journey(0, 'outbound', [seg('LHR', 'DOH', 'QR1408')]), journey(1, 'return', [seg('DOH', 'LHR', 'QR1407')])],
  pricing: { currency: 'GBP', supplierTotal: 2241, markupPercent: 5, markupAmount: 112, clientTotal: 2353, source: 'research' },
  offer: { provider: 'duffel', providerOfferId: 'off_123', searchedAt: '2026-09-25T10:00:00Z', supplierCurrency: 'GBP', supplierTotal: 2241 },
  addedFrom: 'research',
  ...over,
})

describe('unified flight booking: one offer, one price', () => {
  it('a return booking is ONE row with two journeys and ONE total', () => {
    const b = booking()
    expect(isUnifiedFlight(b)).toBe(true)
    expect(b.journeys).toHaveLength(2)
    expect(sumClientTotals([b])).toBe(2353)
    expect(sumSupplierTotals([b])).toBe(2241)
  })

  it('the total is never multiplied by the number of journeys or segments', () => {
    const connecting = booking({
      journeys: [
        journey(0, 'outbound', [seg('LHR', 'DOH', 'QR1'), seg('DOH', 'SYD', 'QR2')]),
        journey(1, 'return', [seg('SYD', 'DOH', 'QR3'), seg('DOH', 'LHR', 'QR4')]),
      ],
    })
    expect(connecting.journeys.flatMap((j) => j.segments)).toHaveLength(4)
    expect(bookingClientTotal(connecting)).toBe(2353)
    expect(sumClientTotals([connecting])).toBe(2353)
  })

  it('multi-city: N journeys, one total', () => {
    const mc = booking({
      tripType: 'multi-city',
      journeys: [
        journey(0, 'leg', [seg('LHR', 'DOH', 'QR1')]),
        journey(1, 'leg', [seg('DOH', 'BKK', 'QR2')]),
        journey(2, 'leg', [seg('BKK', 'LHR', 'QR3')]),
      ],
    })
    expect(mc.journeys).toHaveLength(3)
    expect(sumClientTotals([mc])).toBe(2353)
    expect(flightRouteLabel(mc)).toBe('LHR → DOH → BKK → LHR')
    expect(mc.journeys.map(journeyLabel)).toEqual(['LEG 1', 'LEG 2', 'LEG 3'])
  })

  it('one-way: one journey, one price', () => {
    const ow = booking({ tripType: 'one-way', journeys: [journey(0, 'outbound', [seg('LHR', 'DOH', 'QR1408')])] })
    expect(ow.journeys).toHaveLength(1)
    expect(flightRouteLabel(ow)).toBe('LHR → DOH')
    expect(sumClientTotals([ow])).toBe(2353)
  })

  it('return route label and journey labels', () => {
    const b = booking()
    expect(flightRouteLabel(b)).toBe('LHR ⇄ DOH')
    expect(b.journeys.map(journeyLabel)).toEqual(['OUTBOUND', 'RETURN'])
  })

  it('margin is counted once: client total minus supplier total, per booking', () => {
    const b = booking()
    expect(sumClientTotals([b]) - sumSupplierTotals([b])).toBe(2353 - 2241)
  })

  it('two DIFFERENT bookings on the same route are two bookings (never merged)', () => {
    const a = booking({ id: 'a', offer: { ...booking().offer!, providerOfferId: 'off_A' } })
    const b = booking({ id: 'b', offer: { ...booking().offer!, providerOfferId: 'off_B' } })
    expect(sumClientTotals([a, b])).toBe(4706)
    expect(offerDedupeKey(a)).not.toBe(offerDedupeKey(b))
  })

  it('legacy per-leg rows are left as they are: each still contributes its own cost', () => {
    const legacyOut = { id: 'x1', from: 'LHR', to: 'DOH', airline: 'Qatar Airways', cost: 1000, supplierCost: 900 }
    const legacyRet = { id: 'x2', from: 'DOH', to: 'LHR', airline: 'Qatar Airways', cost: 500, supplierCost: 450 }
    expect(isUnifiedFlight(legacyOut)).toBe(false)
    expect(sumClientTotals([legacyOut, legacyRet])).toBe(1500)
  })

  it('tolerates junk: strings, missing, NaN', () => {
    expect(bookingClientTotal({ cost: '2353.50' })).toBe(2353.5)
    expect(bookingClientTotal({ cost: 'abc' })).toBe(0)
    expect(bookingSupplierTotal(null)).toBe(0)
    expect(sumClientTotals(undefined)).toBe(0)
  })
})

describe('duplicate protection key', () => {
  it('same supplier offer => same key; found among rows', () => {
    const rows = [booking({ id: 'a' })]
    expect(offerDedupeKey(rows[0])).toBe('duffel:off_123')
    expect(findRowWithOffer(rows as never, 'duffel', 'off_123')?.id).toBe('a')
    expect(findRowWithOffer(rows as never, 'duffel', 'off_999')).toBeNull()
  })
  it('rows without an offer snapshot have no key (manual/legacy never collide)', () => {
    expect(offerDedupeKey({ id: 'm1', cost: 100 })).toBeNull()
    expect(findRowWithOffer([{ id: 'm1' }, { id: 'm2' }], 'duffel', 'off_123')).toBeNull()
  })
})
