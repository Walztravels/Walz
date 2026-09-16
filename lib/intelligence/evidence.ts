import prisma from '@/lib/db'

/**
 * Visa case evidence: canonical fields, normalization, persistence (DI-2).
 *
 * Every evidence value must answer: WHAT value, from WHICH source, HOW it
 * was extracted, HOW confident, for WHICH case. Normalization makes
 * values comparable deterministically in DI-3 — dates to ISO days,
 * amounts to decimal strings + currency, identifiers to bare uppercase.
 */

export const EVIDENCE_EXTRACTOR_VERSION = 'di2.1'

export type EvidenceDataType = 'string' | 'date' | 'amount' | 'identifier'

/** Canonical evidence fields per document type — the extraction contract.
 *  The model may only fill fields listed here; absent fields are omitted. */
export const DOCUMENT_EVIDENCE_FIELDS: Record<string, Array<{ field: string; dataType: EvidenceDataType }>> = {
  passport: [
    { field: 'passport.fullName',       dataType: 'string' },
    { field: 'passport.number',         dataType: 'identifier' },
    { field: 'passport.dateOfBirth',    dataType: 'date' },
    { field: 'passport.issueDate',      dataType: 'date' },
    { field: 'passport.expiryDate',     dataType: 'date' },
    { field: 'passport.issuingCountry', dataType: 'string' },
    { field: 'passport.nationality',    dataType: 'string' },
  ],
  employment_letter: [
    { field: 'employment.fullName',      dataType: 'string' },
    { field: 'employment.employer',      dataType: 'string' },
    { field: 'employment.jobTitle',      dataType: 'string' },
    { field: 'employment.monthlyIncome', dataType: 'amount' },
    { field: 'employment.startDate',     dataType: 'date' },
  ],
  payslip: [
    { field: 'payslip.fullName', dataType: 'string' },
    { field: 'payslip.employer', dataType: 'string' },
    { field: 'payslip.netPay',   dataType: 'amount' },
    { field: 'payslip.payDate',  dataType: 'date' },
  ],
  bank_statement: [
    { field: 'bank.accountName',        dataType: 'string' },
    { field: 'bank.bankName',           dataType: 'string' },
    { field: 'bank.closingBalance',     dataType: 'amount' },
    { field: 'bank.statementStartDate', dataType: 'date' },
    { field: 'bank.statementEndDate',   dataType: 'date' },
  ],
  hotel_booking: [
    { field: 'hotel.guestName', dataType: 'string' },
    { field: 'hotel.hotelName', dataType: 'string' },
    { field: 'hotel.checkIn',   dataType: 'date' },
    { field: 'hotel.checkOut',  dataType: 'date' },
  ],
  flight_itinerary: [
    { field: 'flight.passengerName', dataType: 'string' },
    { field: 'flight.departureDate', dataType: 'date' },
    { field: 'flight.returnDate',    dataType: 'date' },
    { field: 'flight.origin',        dataType: 'string' },
    { field: 'flight.destination',   dataType: 'string' },
  ],
  invitation_letter: [
    { field: 'invitation.hostName',     dataType: 'string' },
    { field: 'invitation.hostAddress',  dataType: 'string' },
    { field: 'invitation.relationship', dataType: 'string' },
    { field: 'invitation.guestName',    dataType: 'string' },
  ],
  insurance: [
    { field: 'insurance.insuredName', dataType: 'string' },
    { field: 'insurance.startDate',   dataType: 'date' },
    { field: 'insurance.endDate',     dataType: 'date' },
  ],
  business_registration: [
    { field: 'business.businessName',       dataType: 'string' },
    { field: 'business.registrationNumber', dataType: 'identifier' },
    { field: 'business.registrationDate',   dataType: 'date' },
    { field: 'business.ownerName',          dataType: 'string' },
  ],
  utility_bill: [
    { field: 'address.holderName', dataType: 'string' },
    { field: 'address.address',    dataType: 'string' },
    { field: 'address.billDate',   dataType: 'date' },
  ],
  tax_return: [
    { field: 'tax.fullName',     dataType: 'string' },
    { field: 'tax.taxYear',      dataType: 'string' },
    { field: 'tax.annualIncome', dataType: 'amount' },
  ],
  travel_history: [
    { field: 'travelHistory.fullName', dataType: 'string' },
  ],
}

// ── Normalizers (pure, deterministic) ────────────────────────────────────────

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

/** Normalize a date expression to 'YYYY-MM-DD', or null if unparseable.
 *  Handles ISO, D/M/Y and D Month Y forms (documents in this domain are
 *  overwhelmingly day-first — UK/NG convention). */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
  if (m) {
    const day = m[1].padStart(2, '0'), mon = m[2].padStart(2, '0')
    if (Number(mon) > 12) return null
    return `${m[3]}-${mon}-${day}`
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})$/)
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (!mon) return null
    return `${m[3]}-${mon}-${m[1].padStart(2, '0')}`
  }
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()]
    if (!mon) return null
    return `${m[3]}-${mon}-${m[2].padStart(2, '0')}`
  }
  return null
}

const CURRENCY_HINTS: Array<[RegExp, string]> = [
  [/₦|\bNGN\b|naira/i, 'NGN'], [/£|\bGBP\b/i, 'GBP'], [/€|\bEUR\b/i, 'EUR'],
  [/\bUSD\b|US\$/i, 'USD'], [/\bGHS\b|₵/i, 'GHS'], [/\bCAD\b|C\$/i, 'CAD'],
  [/\bAED\b/i, 'AED'], [/\$/, 'USD'],
]

/** Normalize a money expression to { value: '850000', currency } — value is
 *  a plain decimal string with no separators. Null if no digits. */
export function normalizeAmount(raw: string): { value: string; currency: string | null } | null {
  const currency = CURRENCY_HINTS.find(([re]) => re.test(raw))?.[1] ?? null
  const cleaned = raw.replace(/[^0-9.,]/g, '')
  if (!/\d/.test(cleaned)) return null
  // Thousands separators: strip commas; keep a final .dd as decimals.
  let value = cleaned.replace(/,/g, '')
  const parts = value.split('.')
  if (parts.length > 2) value = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]
  if (value.endsWith('.')) value = value.slice(0, -1)
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return { value: String(n), currency }
}

/** Identifiers compare on bare uppercase alphanumerics. */
export function normalizeIdentifier(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Names/strings compare case- and whitespace-insensitively. */
export function normalizeString(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase()
}

export function normalizeByType(raw: string, dataType: EvidenceDataType): { normalized: string | null; currency: string | null } {
  switch (dataType) {
    case 'date': return { normalized: normalizeDate(raw), currency: null }
    case 'amount': {
      const a = normalizeAmount(raw)
      return { normalized: a?.value ?? null, currency: a?.currency ?? null }
    }
    case 'identifier': return { normalized: normalizeIdentifier(raw) || null, currency: null }
    default: return { normalized: normalizeString(raw) || null, currency: null }
  }
}

// ── Persistence ──────────────────────────────────────────────────────────────

export interface ExtractedField {
  field: string
  value: string
  confidence?: number
  currency?: string | null
}

async function tryDb<T>(op: () => Promise<T>): Promise<T | null> {
  try { return await op() } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/does not exist|relation|column/i.test(msg)) return null
    throw e
  }
}

/**
 * Persist extracted fields as evidence rows for a case. Fields not in the
 * document type's contract are dropped (the model cannot invent canonical
 * fields). Returns the number of rows written (0 pre-migration).
 */
export async function saveEvidence(opts: {
  applicationId: string
  sourceType:    string
  sourceId:      string | null
  documentType:  string
  extractionMethod: string
  fields:        ExtractedField[]
}): Promise<number> {
  const contract = new Map(
    (DOCUMENT_EVIDENCE_FIELDS[opts.documentType] ?? []).map(f => [f.field, f.dataType]),
  )
  const rows: Array<{
    applicationId: string; sourceType: string; sourceId: string | null
    documentType: string; field: string; rawValue: string
    normalizedValue: string | null; dataType: EvidenceDataType
    currency: string | null; confidence: number
    extractionMethod: string; extractorVersion: string
  }> = []
  for (const f of opts.fields) {
    const dataType = contract.get(f.field)
    if (!dataType) continue
    const raw = String(f.value ?? '').slice(0, 2000)
    if (!raw.trim()) continue
    const { normalized, currency } = normalizeByType(raw, dataType)
    rows.push({
      applicationId:    opts.applicationId,
      sourceType:       opts.sourceType,
      sourceId:         opts.sourceId,
      documentType:     opts.documentType,
      field:            f.field,
      rawValue:         raw,
      normalizedValue:  normalized,
      dataType,
      currency:         f.currency ?? currency,
      confidence:       Math.min(1, Math.max(0, Number(f.confidence ?? 0.9))),
      extractionMethod: opts.extractionMethod,
      extractorVersion: EVIDENCE_EXTRACTOR_VERSION,
    })
  }
  if (rows.length === 0) return 0
  const res = await tryDb(() => prisma.visaCaseEvidence.createMany({ data: rows }))
  return res?.count ?? 0
}

/** All evidence for a case, newest first per field. */
export async function getCaseEvidence(applicationId: string) {
  return (await tryDb(() => prisma.visaCaseEvidence.findMany({
    where:   { applicationId },
    orderBy: { createdAt: 'desc' },
    take:    500,
  }))) ?? []
}
