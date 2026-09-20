/**
 * Security closing fix (V1.3 review) — GET /api/admin/quotes/[id]'s
 * serializeQuote() must strip supplier-cost/margin fields not just from
 * the top-level Quote row but from every nested QuoteItem/
 * QuoteFlightOption/QuoteHotelOption row too, for staff lacking
 * quotes.view_margin. V1.3 added 5 new supplier/FX fields onto exactly
 * this previously-unprotected nested surface.
 */
const mockPrisma = {
  quote: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: jest.fn() }))
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { GET } from '@/app/api/admin/quotes/[id]/route'

const MARGIN_FIELDS = [
  'costMinor', 'markupMinor', 'serviceFeeMinor',
  'supplierCostMinor', 'supplierCurrency', 'fxRate', 'fxRateAt', 'fxSource',
]

function makeQuote() {
  return {
    id: 'q1', secureTokenHash: 'hash', internalNotes: 'staff eyes only', status: 'draft', currency: 'GBP',
    costMinor: BigInt(1000), markupMinor: BigInt(200), serviceFeeMinor: BigInt(50),
    items: [{
      id: 'i1', title: 'Flight', currency: 'GBP',
      costMinor: BigInt(900), markupMinor: BigInt(150), serviceFeeMinor: BigInt(25),
      sellingPriceMinor: BigInt(1075),
      supplierCostMinor: BigInt(700), supplierCurrency: 'USD', fxRate: 0.79, fxRateAt: new Date(), fxSource: 'standard',
    }],
    flightOptions: [{
      id: 'fo1', costMinor: BigInt(900), markupMinor: BigInt(150), serviceFeeMinor: BigInt(25),
      sellingPriceMinor: BigInt(1075), currency: 'GBP',
      supplierCostMinor: BigInt(700), supplierCurrency: 'USD', fxRate: 0.79, fxRateAt: new Date(), fxSource: 'standard',
      segments: [], media: [],
    }],
    hotelOptions: [{
      id: 'ho1', costMinor: BigInt(500), markupMinor: BigInt(90), serviceFeeMinor: BigInt(10),
      sellingPriceMinor: BigInt(600), currency: 'GBP',
      supplierCostMinor: BigInt(450), supplierCurrency: 'EUR', fxRate: 1.08, fxRateAt: new Date(), fxSource: 'standard',
      media: [],
    }],
    media: [], versions: [], activity: [],
  }
}

function ctx(id: string) {
  return { params: { id } }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue({ email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} })
  mockPrisma.quote.findUnique.mockResolvedValue(makeQuote())
})

describe('staff WITHOUT quotes.view_margin', () => {
  beforeEach(() => {
    ;(hasPermission as jest.Mock).mockImplementation((_s: unknown, perm: string) => perm === 'quotes')
  })

  it('strips margin fields from the top-level quote', async () => {
    const res = await GET({} as never, ctx('q1'))
    const body = await res.json()
    for (const key of MARGIN_FIELDS) expect(body[key]).toBeUndefined()
    expect(body.internalNotes).toBeUndefined()
    expect(body.secureTokenHash).toBeUndefined()
  })

  it('strips margin fields from every nested item/flightOption/hotelOption row', async () => {
    const res = await GET({} as never, ctx('q1'))
    const body = await res.json()
    for (const key of MARGIN_FIELDS) {
      expect(body.items[0][key]).toBeUndefined()
      expect(body.flightOptions[0][key]).toBeUndefined()
      expect(body.hotelOptions[0][key]).toBeUndefined()
    }
    // client-facing selling price must still be visible
    expect(body.items[0].sellingPriceMinor).toBe(1075)
    expect(body.flightOptions[0].sellingPriceMinor).toBe(1075)
    expect(body.hotelOptions[0].sellingPriceMinor).toBe(600)
  })
})

describe('staff WITH quotes.view_margin', () => {
  beforeEach(() => {
    ;(hasPermission as jest.Mock).mockReturnValue(true)
  })

  it('preserves margin fields on the top-level quote and every nested row', async () => {
    const res = await GET({} as never, ctx('q1'))
    const body = await res.json()
    expect(body.markupMinor).toBe(200)
    expect(body.items[0].supplierCostMinor).toBe(700)
    expect(body.flightOptions[0].supplierCostMinor).toBe(700)
    expect(body.hotelOptions[0].supplierCostMinor).toBe(450)
  })
})
