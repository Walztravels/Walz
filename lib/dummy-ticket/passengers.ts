// Dummy-ticket passenger contract — pure, client- and server-safe (no server imports).
//
// ONE authoritative ordered array drives the request payload (UI), the search
// counts (Duffel / Amadeus) and the PDF passengers. The legacy single-passenger
// contract (clientName + clientTitle + passportNumber, no `passengers`) is
// normalised into a one-element array at the API boundary.

export const MAX_PASSENGERS = 9

export type PaxType = 'Adult' | 'Child' | 'Infant'

/** Passenger row as sent in the request body. */
export interface DummyTicketPassengerInput {
  name: string
  type?: PaxType | string
  title?: string
  passport?: string
  seat?: string
}

export interface NormalizedPassenger {
  name: string
  type: PaxType
  title: string
  passport: string
  seat?: string
}

export interface PassengerCounts { adults: number; children: number; infants: number }

export interface NormalizeInput {
  passengers?: DummyTicketPassengerInput[] | null
  clientName?: string
  clientTitle?: string
  passportNumber?: string
  appName?: string
  appPassport?: string
  appGender?: string
}

export interface NormalizeResult {
  passengers: NormalizedPassenger[]
  counts: PassengerCounts
  error?: string
}

/** Today's convention for a missing lead name (kept). */
export const FALLBACK_LEAD_NAME = 'PASSENGER NAME'

export const ALLOWED_TITLES = ['MR', 'MRS', 'MISS', 'MS', 'MSTR', 'DR'] as const
export const MAX_NAME_LEN = 60
export const MAX_PASSPORT_LEN = 20

// Non-strings are treated as empty (never '[object Object]').
const collapse = (s: unknown): string => (typeof s === 'string' ? s : '').replace(/\s+/g, ' ').trim()
const upper = (s: unknown): string => collapse(s).toUpperCase()
const cleanName = (s: unknown): string => collapse(s).slice(0, MAX_NAME_LEN).trim()
const cleanPassport = (s: unknown): string => upper(s).replace(/\s/g, '').slice(0, MAX_PASSPORT_LEN)
const cleanTitle = (s: unknown): string => {
  const t = upper(s).replace(/\./g, '')
  return (ALLOWED_TITLES as readonly string[]).includes(t) ? t : ''
}

export function normalizePaxType(t: unknown): PaxType {
  const v = String(t ?? '').toLowerCase()
  if (v.startsWith('inf')) return 'Infant'
  if (v.startsWith('chi')) return 'Child'
  return 'Adult'
}

export function countPassengers(list: Array<{ type?: string }>): PassengerCounts {
  let adults = 0, children = 0, infants = 0
  for (const p of list) {
    const t = normalizePaxType(p.type)
    if (t === 'Child') children++
    else if (t === 'Infant') infants++
    else adults++
  }
  return { adults, children, infants }
}

export function normalizePassengers(input: NormalizeInput): NormalizeResult {
  const leadDefaultTitle = cleanTitle(input.clientTitle) || (input.appGender === 'f' ? 'MISS' : 'MR')
  const leadPassport = cleanPassport(input.passportNumber) || cleanPassport(input.appPassport)
  const leadFallbackName = cleanName(input.clientName) || cleanName(input.appName) || FALLBACK_LEAD_NAME

  const raw = Array.isArray(input.passengers) ? input.passengers : []
  const list: NormalizedPassenger[] = []

  if (raw.length > 0) {
    raw.forEach((p, i) => {
      const name = cleanName(p?.name)
      if (i === 0) {
        // Index 0 is the lead. A blank lead falls back to clientName / linked application.
        list.push({
          name: name || leadFallbackName,
          type: normalizePaxType(p?.type),
          title: cleanTitle(p?.title) || leadDefaultTitle,
          passport: cleanPassport(p?.passport) || leadPassport,
          ...(p?.seat ? { seat: String(p.seat) } : {}),
        })
        return
      }
      if (!name) return // blank ADDED row — never render a placeholder passenger
      list.push({
        name,
        type: normalizePaxType(p?.type),
        title: cleanTitle(p?.title) || 'MR',
        passport: cleanPassport(p?.passport), // own passport only — never inherit the lead's
        ...(p?.seat ? { seat: String(p.seat) } : {}),
      })
    })
    // Never duplicate the lead: drop only when name AND a non-empty passport match.
    const lead = list[0]
    for (let i = list.length - 1; i > 0; i--) {
      if (lead.passport && list[i].passport === lead.passport && list[i].name.toLowerCase() === lead.name.toLowerCase()) list.splice(i, 1)
    }
  } else {
    list.push({ name: leadFallbackName, type: 'Adult', title: leadDefaultTitle, passport: leadPassport })
  }

  const result: NormalizeResult = { passengers: list, counts: countPassengers(list) }
  // Objective supplier constraints (validated, never "fixed" by guessing a type).
  if (list.length > MAX_PASSENGERS) result.error = `A maximum of ${MAX_PASSENGERS} passengers is supported`
  else if (result.counts.adults === 0) result.error = 'At least one adult passenger is required'
  else if (result.counts.infants > result.counts.adults) result.error = 'Each infant must travel with an adult'
  return result
}

/** Duffel passenger objects from counts (repo convention: adult | child | infant_without_seat). */
export function toDuffelPassengers(c: PassengerCounts): Array<{ type: 'adult' | 'child' | 'infant_without_seat' }> {
  return [
    ...Array.from({ length: c.adults }, () => ({ type: 'adult' as const })),
    ...Array.from({ length: c.children }, () => ({ type: 'child' as const })),
    ...Array.from({ length: c.infants }, () => ({ type: 'infant_without_seat' as const })),
  ]
}

export interface PdfPassenger {
  title: string
  firstName: string
  lastName: string
  cabinClass: string
  seat: string
  eTicketNumber: string
  passport: string
}

/** Build the PDF Passenger objects from the ONE normalised array. */
export function toPdfPassengers(
  pax: NormalizedPassenger[],
  opts: { cabinClass: string; leadSeat?: string; genSeat: () => string; genETicket: () => string },
): PdfPassenger[] {
  const seats = new Set<string>()
  const tickets = new Set<string>()
  const unique = (gen: () => string, used: Set<string>, preset?: string): string => {
    let v = preset || gen()
    for (let n = 0; used.has(v) && n < 50; n++) v = gen()
    used.add(v)
    return v
  }
  return pax.map((p, i) => {
    const parts = p.name.split(' ')
    return {
      title: p.title,
      firstName: (parts[0] || 'PASSENGER').toUpperCase(),
      lastName: parts.slice(1).join(' ').toUpperCase(),
      cabinClass: opts.cabinClass,
      seat: unique(opts.genSeat, seats, p.seat || (i === 0 ? opts.leadSeat : undefined)),
      eTicketNumber: unique(opts.genETicket, tickets),
      passport: p.passport,
    }
  })
}

/**
 * Build the request `passengers` array from UI state. Sends the full ordered
 * array [lead, ...extras] only when there is at least one non-blank extra;
 * otherwise undefined (legacy single-passenger shape). Blank extras filtered.
 */
export function buildPassengersPayload(
  lead: { name: string; title?: string; passport?: string; type?: string },
  extras: Array<{ name: string; type?: string; title?: string; passport?: string }>,
): DummyTicketPassengerInput[] | undefined {
  const cleaned = extras
    .filter(e => collapse(e.name) !== '')
    .map(e => ({
      name: collapse(e.name),
      type: e.type || 'Adult',
      title: e.title || 'MR',
      ...(collapse(e.passport) ? { passport: upper(e.passport) } : {}),
    }))
  if (cleaned.length === 0) return undefined
  return [
    {
      name: collapse(lead.name),
      type: lead.type || 'Adult',
      title: lead.title || 'MR',
      ...(collapse(lead.passport) ? { passport: upper(lead.passport) } : {}),
    },
    ...cleaned,
  ]
}

/** Number of extra rows that buildPassengersPayload will drop because their name is blank. */
export function countIgnoredRows(extras: Array<{ name?: string }>): number {
  return extras.filter(e => collapse(e?.name) === '').length
}
