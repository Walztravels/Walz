/**
 * Tests for:
 * A. Client Component Pricing (PublicProposalDTO.componentPrices + booking clientPrice)
 * B. Pricing Tab UX (PricingTab logic helpers)
 *
 * Security invariants:
 * - supplierCost NEVER in PublicProposalDTO
 * - netRate NEVER in PublicProposalDTO
 * - markup NEVER in PublicProposalDTO
 * - margin NEVER in PublicProposalDTO
 * - commission NEVER in PublicProposalDTO
 */

// ─── Types under test ─────────────────────────────────────────────────────────

interface ProposalFlight {
  airline?: string; from?: string; to?: string; clientPrice?: number
}
interface ProposalHotel  { name?: string; clientPrice?: number }
interface ProposalTransfer { type?: string; from?: string; to?: string; clientPrice?: number }
interface ProposalTour   { name?: string; clientPrice?: number }
interface ProposalTrain  { from?: string; to?: string; clientPrice?: number }
interface ProposalFerry  { from?: string; to?: string; clientPrice?: number }

interface ComponentPrices {
  flights?: number; hotels?: number; transfers?: number
  tours?: number; trains?: number; ferries?: number
}

interface PublicProposalDTO {
  totalPrice?: number
  currency: string
  componentPrices?: ComponentPrices
  flights: ProposalFlight[]
  hotels: ProposalHotel[]
  transfers: ProposalTransfer[]
  tours: ProposalTour[]
  trains: ProposalTrain[]
  ferries: ProposalFerry[]
  // FORBIDDEN fields — must not exist in this type
  // supplierCost, netRate, markup, margin, commission
  priceBreakdown: { item: string; description?: string; cost: number }[]
}

// ─── Serializer logic (pure re-implementation of the DTO builder logic) ───────

function buildRawBooking<T extends object>(items: (T & { supplierCost?: number; netRate?: number; markup?: number })[]) {
  return items
}

const _sumClientPrice = (arr: { cost?: number | null }[]) => {
  const total = arr.reduce((s, x) => s + (x.cost ?? 0), 0)
  return total > 0 ? total : undefined
}

function buildComponentPrices(raw: {
  flights: { cost?: number | null }[]
  hotels: { cost?: number | null }[]
  transfers: { cost?: number | null }[]
  tours: { cost?: number | null }[]
  trains: { cost?: number | null }[]
  ferries: { cost?: number | null }[]
}): ComponentPrices | undefined {
  const cp = {
    flights:   _sumClientPrice(raw.flights),
    hotels:    _sumClientPrice(raw.hotels),
    transfers: _sumClientPrice(raw.transfers),
    tours:     _sumClientPrice(raw.tours),
    trains:    _sumClientPrice(raw.trains),
    ferries:   _sumClientPrice(raw.ferries),
  }
  return Object.values(cp).some(v => v != null) ? cp : undefined
}

function buildClientPrice(cost: number | null | undefined): number | undefined {
  return cost != null && cost > 0 ? cost : undefined
}

// ─── Pricing Tab helpers ──────────────────────────────────────────────────────

function derivedTotal(bookingCostTotal: number, manualRowsTotal: number): number {
  return bookingCostTotal + manualRowsTotal
}

function displayTotal(override: string, derived: number): number {
  return override !== '' ? Number(override) : derived
}

function autoBalance(total: number, deposit: number): number {
  return Math.max(0, total - deposit)
}

function bookingComponents(raw: {
  flights: { cost?: number | null }[]
  hotels: { cost?: number | null }[]
  transfers: { cost?: number | null }[]
  tours: { cost?: number | null }[]
  trains: { cost?: number | null }[]
  ferries: { cost?: number | null }[]
}): { label: string; total: number }[] {
  const sum = (arr: { cost?: number | null }[]) => arr.reduce((s, x) => s + (x.cost ?? 0), 0)
  return [
    { label: 'Flights',            total: sum(raw.flights) },
    { label: 'Hotels',             total: sum(raw.hotels) },
    { label: 'Transfers',          total: sum(raw.transfers) },
    { label: 'Tours & Activities', total: sum(raw.tours) },
    { label: 'Trains',             total: sum(raw.trains) },
    { label: 'Ferries',            total: sum(raw.ferries) },
  ].filter(c => c.total > 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// A. CLIENT COMPONENT PRICING — DTO field tests
// ─────────────────────────────────────────────────────────────────────────────

describe('A. PublicProposalDTO componentPrices', () => {

  test('A1. buildComponentPrices returns hotel total when hotels have cost', () => {
    const cp = buildComponentPrices({
      flights: [],
      hotels: [{ cost: 1200 }, { cost: 400 }],
      transfers: [], tours: [], trains: [], ferries: [],
    })
    expect(cp?.hotels).toBe(1600)
  })

  test('A2. buildComponentPrices returns flights total', () => {
    const cp = buildComponentPrices({
      flights: [{ cost: 800 }, { cost: 650 }],
      hotels: [], transfers: [], tours: [], trains: [], ferries: [],
    })
    expect(cp?.flights).toBe(1450)
  })

  test('A3. buildComponentPrices returns transfers total', () => {
    const cp = buildComponentPrices({
      flights: [], hotels: [],
      transfers: [{ cost: 150 }, { cost: 314 }],
      tours: [], trains: [], ferries: [],
    })
    expect(cp?.transfers).toBe(464)
  })

  test('A4. buildComponentPrices returns tours total', () => {
    const cp = buildComponentPrices({
      flights: [], hotels: [], transfers: [],
      tours: [{ cost: 100 }, { cost: 130 }],
      trains: [], ferries: [],
    })
    expect(cp?.tours).toBe(230)
  })

  test('A5. buildComponentPrices returns trains total', () => {
    const cp = buildComponentPrices({
      flights: [], hotels: [], transfers: [], tours: [],
      trains: [{ cost: 220 }],
      ferries: [],
    })
    expect(cp?.trains).toBe(220)
  })

  test('A6. buildComponentPrices returns ferries total', () => {
    const cp = buildComponentPrices({
      flights: [], hotels: [], transfers: [], tours: [], trains: [],
      ferries: [{ cost: 175 }],
    })
    expect(cp?.ferries).toBe(175)
  })

  test('A7. buildComponentPrices returns undefined when all bookings have zero cost', () => {
    const cp = buildComponentPrices({
      flights: [{ cost: 0 }], hotels: [{ cost: null }],
      transfers: [], tours: [], trains: [], ferries: [],
    })
    expect(cp).toBeUndefined()
  })

  test('A8. buildComponentPrices returns undefined for empty arrays', () => {
    const cp = buildComponentPrices({
      flights: [], hotels: [], transfers: [], tours: [], trains: [], ferries: [],
    })
    expect(cp).toBeUndefined()
  })

  test('A9. category with zero total is omitted (undefined, not 0)', () => {
    const cp = buildComponentPrices({
      flights: [{ cost: 500 }],
      hotels: [{ cost: 0 }],
      transfers: [], tours: [], trains: [], ferries: [],
    })
    expect(cp?.flights).toBe(500)
    expect(cp?.hotels).toBeUndefined()
  })

  test('A10. mixed null/undefined cost treated as zero', () => {
    const cp = buildComponentPrices({
      flights: [],
      hotels: [{ cost: null }, { cost: undefined }, { cost: 600 }],
      transfers: [], tours: [], trains: [], ferries: [],
    })
    expect(cp?.hotels).toBe(600)
  })

  test('A11. WALZ-HA8H86 scenario: hotels 1600, transfers 464, tours 230 = total 2294', () => {
    const cp = buildComponentPrices({
      flights: [],
      hotels: [{ cost: 1600 }],
      transfers: [{ cost: 464 }],
      tours: [{ cost: 230 }],
      trains: [], ferries: [],
    })
    const total = (cp?.hotels ?? 0) + (cp?.transfers ?? 0) + (cp?.tours ?? 0)
    expect(total).toBe(2294)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// B. clientPrice on individual booking items
// ─────────────────────────────────────────────────────────────────────────────

describe('B. booking.clientPrice serialization', () => {

  test('B1. buildClientPrice returns value when cost > 0', () => {
    expect(buildClientPrice(1200)).toBe(1200)
  })

  test('B2. buildClientPrice returns undefined for null cost', () => {
    expect(buildClientPrice(null)).toBeUndefined()
  })

  test('B3. buildClientPrice returns undefined for undefined cost', () => {
    expect(buildClientPrice(undefined)).toBeUndefined()
  })

  test('B4. buildClientPrice returns undefined for zero cost (not shown on proposal)', () => {
    expect(buildClientPrice(0)).toBeUndefined()
  })

  test('B5. buildClientPrice returns undefined for negative cost', () => {
    expect(buildClientPrice(-50)).toBeUndefined()
  })

  test('B6. hotel clientPrice correctly mapped', () => {
    const h: ProposalHotel = { name: 'Grand Hyatt', clientPrice: buildClientPrice(1600) }
    expect(h.clientPrice).toBe(1600)
  })

  test('B7. transfer clientPrice correctly mapped', () => {
    const t: ProposalTransfer = { type: 'Private', clientPrice: buildClientPrice(464) }
    expect(t.clientPrice).toBe(464)
  })

  test('B8. tour clientPrice correctly mapped', () => {
    const t: ProposalTour = { name: 'Safari', clientPrice: buildClientPrice(230) }
    expect(t.clientPrice).toBe(230)
  })

  test('B9. flight clientPrice correctly mapped', () => {
    const f: ProposalFlight = { airline: 'BA', from: 'LHR', to: 'ABV', clientPrice: buildClientPrice(800) }
    expect(f.clientPrice).toBe(800)
  })

  test('B10. train clientPrice correctly mapped', () => {
    const t: ProposalTrain = { from: 'London', to: 'Paris', clientPrice: buildClientPrice(220) }
    expect(t.clientPrice).toBe(220)
  })

  test('B11. ferry clientPrice correctly mapped', () => {
    const f: ProposalFerry = { from: 'Dover', to: 'Calais', clientPrice: buildClientPrice(175) }
    expect(f.clientPrice).toBe(175)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// C. SECURITY — forbidden fields must never appear in PublicProposalDTO
// ─────────────────────────────────────────────────────────────────────────────

describe('C. Security — forbidden fields absent from PublicProposalDTO', () => {

  const FORBIDDEN_FIELDS = ['supplierCost', 'netRate', 'markup', 'margin', 'commission',
    'wholesale_cost', 'internalMargin', 'internal_margin']

  function buildSafeDTO(rawHotel: Record<string, unknown>): PublicProposalDTO {
    // Simulates the serializer: only whitelisted fields pass through
    return {
      currency: 'GBP',
      totalPrice: 2294,
      componentPrices: { hotels: 1600 },
      flights: [],
      hotels: [{
        name: rawHotel.name as string | undefined,
        clientPrice: rawHotel.cost != null && (rawHotel.cost as number) > 0
          ? rawHotel.cost as number
          : undefined,
        // supplierCost, netRate, etc. deliberately NOT mapped
      }],
      transfers: [], tours: [], trains: [], ferries: [],
      priceBreakdown: [],
    }
  }

  test('C1. supplierCost absent from hotel in DTO', () => {
    const raw = { name: 'Grand Hyatt', cost: 1600, supplierCost: 900 }
    const dto = buildSafeDTO(raw)
    expect(JSON.stringify(dto)).not.toContain('supplierCost')
  })

  test('C2. netRate absent from hotel in DTO', () => {
    const raw = { name: 'Grand Hyatt', cost: 1600, netRate: 850 }
    const dto = buildSafeDTO(raw)
    expect(JSON.stringify(dto)).not.toContain('netRate')
  })

  test('C3. markup absent from hotel in DTO', () => {
    const raw = { name: 'Grand Hyatt', cost: 1600, markup: 0.25 }
    const dto = buildSafeDTO(raw)
    expect(JSON.stringify(dto)).not.toContain('markup')
  })

  test('C4. margin absent from hotel in DTO', () => {
    const raw = { name: 'Grand Hyatt', cost: 1600, margin: 700 }
    const dto = buildSafeDTO(raw)
    expect(JSON.stringify(dto)).not.toContain('"margin"')
  })

  test('C5. commission absent from hotel in DTO', () => {
    const raw = { name: 'Grand Hyatt', cost: 1600, commission: 160 }
    const dto = buildSafeDTO(raw)
    expect(JSON.stringify(dto)).not.toContain('commission')
  })

  test('C6. wholesale_cost absent from hotel in DTO', () => {
    const raw = { name: 'Grand Hyatt', cost: 1600, wholesale_cost: 750 }
    const dto = buildSafeDTO(raw)
    expect(JSON.stringify(dto)).not.toContain('wholesale_cost')
  })

  test('C7. componentPrices only contains client selling price totals — never supplier totals', () => {
    const cp = buildComponentPrices({
      flights: [], hotels: [{ cost: 1600 }], transfers: [], tours: [], trains: [], ferries: [],
    })
    const str = JSON.stringify(cp)
    FORBIDDEN_FIELDS.forEach(f => expect(str).not.toContain(f))
    expect(cp?.hotels).toBe(1600)
  })

  test('C8. DTO JSON does not contain any forbidden field name', () => {
    const raw = { name: 'Hotel', cost: 1200, supplierCost: 800, netRate: 750, markup: 0.25, margin: 450, commission: 60 }
    const dto = buildSafeDTO(raw)
    const serialized = JSON.stringify(dto)
    FORBIDDEN_FIELDS.forEach(f => {
      expect(serialized).not.toContain(f)
    })
  })

  test('C9. clientPrice is the only price-like field on ProposalHotel', () => {
    const h: ProposalHotel = { name: 'Test', clientPrice: 500 }
    const keys = Object.keys(h)
    const priceKeys = keys.filter(k => k !== 'name' && k !== 'clientPrice')
    expect(priceKeys).toHaveLength(0)
  })

  test('C10. internalMargin absent from DTO', () => {
    const dto: PublicProposalDTO = {
      currency: 'GBP', flights: [], hotels: [], transfers: [], tours: [], trains: [], ferries: [], priceBreakdown: []
    }
    expect(JSON.stringify(dto)).not.toContain('internalMargin')
    expect(JSON.stringify(dto)).not.toContain('internal_margin')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// D. Investment section display logic
// ─────────────────────────────────────────────────────────────────────────────

describe('D. Investment section display logic', () => {

  test('D1. hasComponents true when componentPrices has at least one positive value', () => {
    const cp: ComponentPrices = { hotels: 1600 }
    const hasComponents = Object.values(cp).some(v => (v ?? 0) > 0)
    expect(hasComponents).toBe(true)
  })

  test('D2. hasComponents false when componentPrices is empty', () => {
    const cp: ComponentPrices = {}
    const hasComponents = Object.values(cp).some(v => (v ?? 0) > 0)
    expect(hasComponents).toBe(false)
  })

  test('D3. hasComponents false when componentPrices is undefined', () => {
    const cp: ComponentPrices | undefined = undefined
    const hasComponents = cp != null
    expect(hasComponents).toBe(false)
  })

  test('D4. shows correct category labels: hotels, transfers, tours', () => {
    const LABELS: Record<string, string> = {
      flights: 'Flights', hotels: 'Hotels', transfers: 'Transfers',
      tours: 'Tours & Activities', trains: 'Trains', ferries: 'Ferries',
    }
    expect(LABELS['hotels']).toBe('Hotels')
    expect(LABELS['transfers']).toBe('Transfers')
    expect(LABELS['tours']).toBe('Tours & Activities')
  })

  test('D5. reconciliation: component totals sum matches totalPrice', () => {
    const cp: ComponentPrices = { hotels: 1600, transfers: 464, tours: 230 }
    const autoTotal = Object.values(cp).reduce((s, v) => s + (v ?? 0), 0)
    expect(autoTotal).toBe(2294)
  })

  test('D6. priceBreakdown adjustments shown separately when componentPrices also present', () => {
    // Component breakdown PLUS manual adjustments should both appear
    const cp: ComponentPrices = { hotels: 1600, transfers: 464 }
    const breakdown = [{ item: 'Service fee', cost: 100 }]
    const hasComponents = Object.values(cp).some(v => (v ?? 0) > 0)
    const hasBreakdown = breakdown.length > 0
    expect(hasComponents).toBe(true)
    expect(hasBreakdown).toBe(true)
    // Both should display — not mutually exclusive
  })

  test('D7. simple total card shown only when no componentPrices AND no priceBreakdown', () => {
    const shouldShowSimpleTotal = (hasComponents: boolean, breakdownLen: number) => !hasComponents && breakdownLen === 0
    expect(shouldShowSimpleTotal(false, 0)).toBe(true)
    expect(shouldShowSimpleTotal(true, 0)).toBe(false)
    expect(shouldShowSimpleTotal(false, 2)).toBe(false)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// E. Pricing Tab UX helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('E. Pricing Tab derived calculations', () => {

  test('E1. derivedTotal = bookingCostTotal + manualRowsTotal', () => {
    expect(derivedTotal(2294, 0)).toBe(2294)
    expect(derivedTotal(2000, 100)).toBe(2100)
    expect(derivedTotal(1500, -200)).toBe(1300)
  })

  test('E2. displayTotal uses override when set', () => {
    expect(displayTotal('3000', 2294)).toBe(3000)
  })

  test('E3. displayTotal uses derivedTotal when override blank', () => {
    expect(displayTotal('', 2294)).toBe(2294)
  })

  test('E4. autoBalance = max(0, total - deposit)', () => {
    expect(autoBalance(2294, 500)).toBe(1794)
    expect(autoBalance(500, 500)).toBe(0)
    expect(autoBalance(400, 500)).toBe(0) // no negative balance
  })

  test('E5. bookingComponents filters out zero-total categories', () => {
    const components = bookingComponents({
      flights: [{ cost: 800 }],
      hotels: [{ cost: 0 }],
      transfers: [], tours: [], trains: [], ferries: [],
    })
    expect(components).toHaveLength(1)
    expect(components[0].label).toBe('Flights')
  })

  test('E6. bookingComponents includes all six categories when all non-zero', () => {
    const components = bookingComponents({
      flights: [{ cost: 100 }], hotels: [{ cost: 200 }], transfers: [{ cost: 50 }],
      tours: [{ cost: 75 }], trains: [{ cost: 30 }], ferries: [{ cost: 20 }],
    })
    expect(components).toHaveLength(6)
  })

  test('E7. bookingComponents returns empty when all bookings have zero cost', () => {
    const components = bookingComponents({
      flights: [{ cost: 0 }], hotels: [], transfers: [], tours: [], trains: [], ferries: [],
    })
    expect(components).toHaveLength(0)
  })

  test('E8. handleSave uses derivedTotal when override blank', () => {
    const derived = derivedTotal(2294, 0)
    const savedTotal = (override: string) => override !== '' ? Number(override) : (derived > 0 ? derived : null)
    expect(savedTotal('')).toBe(2294)
    expect(savedTotal('2500')).toBe(2500)
    expect(savedTotal('')).not.toBeNull()
  })

  test('E9. deposit cleared when depositEnabled is false', () => {
    const getDeposit = (enabled: boolean, depositStr: string) => enabled && depositStr !== '' ? Number(depositStr) : null
    expect(getDeposit(false, '500')).toBeNull()
    expect(getDeposit(true, '500')).toBe(500)
  })

  test('E10. balance due date still saved when deposit disabled', () => {
    // Balance due is separate from deposit — should still persist
    const getBalanceDue = (balanceDue: string) => balanceDue || null
    expect(getBalanceDue('2026-09-01')).toBe('2026-09-01')
    expect(getBalanceDue('')).toBeNull()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// F. Multi-currency support
// ─────────────────────────────────────────────────────────────────────────────

describe('F. Multi-currency component pricing', () => {

  const currencies = ['GBP', 'NGN', 'GHS', 'CAD', 'USD', 'EUR', 'AED', 'ZAR']

  test('F1. componentPrices are currency-agnostic raw amounts', () => {
    // Amounts are stored as plain numbers; currency comes from DTO.currency
    const cp = buildComponentPrices({ flights: [], hotels: [{ cost: 5000000 }], transfers: [], tours: [], trains: [], ferries: [] })
    expect(cp?.hotels).toBe(5000000) // e.g. ₦5,000,000
  })

  currencies.forEach(cur => {
    test(`F2. currency '${cur}' is a valid DTO.currency value`, () => {
      const dto: PublicProposalDTO = {
        currency: cur,
        flights: [], hotels: [], transfers: [], tours: [], trains: [], ferries: [],
        priceBreakdown: [],
      }
      expect(dto.currency).toBe(cur)
    })
  })

  test('F3. fmtMoney handles GHS amounts', () => {
    // fmtMoney(5000000, 'GHS') should include GHS or ₵ symbol — pure display logic
    const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$', NGN: '₦', GHS: 'GH₵', ZAR: 'R' }
    const fmtMoney = (amount: number, currency: string) => {
      const s = SYM[currency?.toUpperCase()] ?? (currency + ' ')
      return `${s}${amount.toLocaleString('en-GB')}`
    }
    expect(fmtMoney(1600, 'GHS')).toContain('GH₵')
    expect(fmtMoney(1600, 'NGN')).toContain('₦')
    expect(fmtMoney(1600, 'GBP')).toContain('£')
    expect(fmtMoney(1600, 'CAD')).toContain('CA$')
  })

})
