// Unified pricing engine for all Walz admin booking modules.
// Generalises applyActivityMarkup (lib/activities/pricing.ts) across all product types.
// Staff can override markupPercent, serviceFee, and discount per booking.

export type BookingProductType =
  | 'FLIGHT'
  | 'HOTEL'
  | 'TRANSFER'
  | 'ACTIVITY'
  | 'TOUR'
  | 'INSURANCE'
  | 'ESIM'
  | 'OTHER'

export type BookingSupplier =
  | 'DUFFEL'
  | 'HOTELBEDS'
  | 'VIATOR'
  | 'WALZ'
  | 'MANUAL'

// Markup table: matches existing applyActivityMarkup values for activities.
// Hotel/transfer/flight defaults set conservatively — override via env vars.
const MARKUP_DEFAULTS: Record<BookingProductType, Partial<Record<BookingSupplier, number>> & { _: number }> = {
  FLIGHT:    { DUFFEL: Number(process.env.MARKUP_FLIGHT_DUFFEL   ?? '5'),  _: 5  },
  HOTEL:     { HOTELBEDS: Number(process.env.MARKUP_HOTEL_HB     ?? '18'), _: 18 },
  TRANSFER:  { HOTELBEDS: Number(process.env.MARKUP_TRANSFER_HB  ?? '25'), _: 25 },
  ACTIVITY:  { VIATOR: 18, HOTELBEDS: 20,                                  _: 20 },
  TOUR:      { WALZ: Number(process.env.MARKUP_TOUR_WALZ          ?? '30'), _: 30 },
  INSURANCE: { _: 0 },
  ESIM:      { _: 0 },
  OTHER:     { _: 0 },
}

export interface BookingPriceInput {
  productType:    BookingProductType
  supplier:       BookingSupplier
  netAmount:      number   // supplier net in the given currency
  currency:       string   // ISO 4217
  markupPercent?: number   // staff override; omit to use the default table
  serviceFee?:    number   // flat fee added on top (default 0)
  discount?:      number   // flat discount subtracted from total (default 0)
}

export interface BookingPriceResult {
  supplierCost:  number
  markupPercent: number
  markupAmount:  number
  serviceFee:    number
  discount:      number
  sellingPrice:  number
  grossProfit:   number
  marginPercent: number
  currency:      string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function defaultMarkupPercent(
  productType: BookingProductType,
  supplier:    BookingSupplier,
): number {
  const row = MARKUP_DEFAULTS[productType]
  return row[supplier] ?? row._
}

export function calculateBookingPrice(input: BookingPriceInput): BookingPriceResult {
  const {
    productType,
    supplier,
    netAmount,
    currency,
    markupPercent: override,
    serviceFee = 0,
    discount   = 0,
  } = input

  const markupPercent = override ?? defaultMarkupPercent(productType, supplier)
  const markupAmount  = round2(netAmount * markupPercent / 100)
  const sellingPrice  = round2(netAmount + markupAmount + serviceFee - discount)
  const grossProfit   = round2(sellingPrice - netAmount)
  const marginPercent = sellingPrice > 0
    ? round2((grossProfit / sellingPrice) * 100)
    : 0

  return {
    supplierCost: round2(netAmount),
    markupPercent,
    markupAmount,
    serviceFee:   round2(serviceFee),
    discount:     round2(discount),
    sellingPrice,
    grossProfit,
    marginPercent,
    currency,
  }
}

/** Format a price result as a human-readable breakdown for admin display */
export function formatPriceBreakdown(result: BookingPriceResult): Array<{ label: string; value: string; muted?: boolean }> {
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const lines: Array<{ label: string; value: string; muted?: boolean }> = [
    { label: 'Supplier Cost',   value: `${result.currency} ${fmt(result.supplierCost)}`, muted: true },
    { label: `Markup (${result.markupPercent}%)`, value: `${result.currency} ${fmt(result.markupAmount)}`, muted: true },
  ]
  if (result.serviceFee > 0) {
    lines.push({ label: 'Service Fee', value: `${result.currency} ${fmt(result.serviceFee)}`, muted: true })
  }
  if (result.discount > 0) {
    lines.push({ label: 'Discount', value: `−${result.currency} ${fmt(result.discount)}`, muted: true })
  }
  lines.push({ label: 'Customer Total', value: `${result.currency} ${fmt(result.sellingPrice)}` })
  lines.push({ label: `Gross Profit (${result.marginPercent}%)`, value: `${result.currency} ${fmt(result.grossProfit)}`, muted: true })
  return lines
}
