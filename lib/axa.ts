/**
 * lib/axa.ts — AXA Partners Travel Insurance API client
 *
 * Env vars (set in Vercel — never commit real values):
 *   AXA_CLIENT_ID      — OAuth2 client ID issued by AXA Partners referent (Auth0)
 *   AXA_CLIENT_SECRET  — OAuth2 client secret (Auth0)
 *   AXA_API_BASE       — default https://apis.axa-assistance.com
 *   AXA_AUTH_URL       — default https://auth.api.axapartners.com/oauth/token
 *
 * All field names that could not be confirmed against the AXA Partners
 * travel-sales.openapi.json spec are marked:
 *   // TODO: confirm vs OpenAPI travel-sales.openapi.json
 */

// ── Config ────────────────────────────────────────────────────────────────────

const AUTH_URL = process.env.AXA_AUTH_URL ?? 'https://auth.api.axapartners.com/oauth/token'
const API_BASE = process.env.AXA_API_BASE ?? 'https://apis.axa-assistance.com'

const SCOPES = [
  'urn:axa.partners.sales.individual.travel.quotesrequests.write',
  'urn:axa.partners.sales.individual.travel.policies.write',
].join(' ')

// ── Token cache ───────────────────────────────────────────────────────────────

let cached: { token: string; expiresAt: number } | null = null

export async function getAxaToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token

  const id     = process.env.AXA_CLIENT_ID
  const secret = process.env.AXA_CLIENT_SECRET
  if (!id || !secret)
    throw new Error('AXA_CLIENT_ID and AXA_CLIENT_SECRET env vars are required')

  const basic = Buffer.from(`${id}:${secret}`).toString('base64')
  const res   = await fetch(AUTH_URL, {
    method:  'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPES }).toString(),
  })

  const data = await res.json().catch(() => ({})) as {
    access_token?:      string
    expires_in?:        number
    error?:             string
    error_description?: string
  }

  if (!res.ok || !data.access_token)
    throw new Error(
      `AXA auth failed (HTTP ${res.status}): ${data.error_description ?? data.error ?? 'no token'}`,
    )

  cached = {
    token:     data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  return cached.token
}

// ── Authenticated fetch ───────────────────────────────────────────────────────

export async function axaFetch(path: string, init: RequestInit = {}) {
  const token = await getAxaToken()
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization:  `Bearer ${token}`,
      'content-type': 'application/json',
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isAxaConfigured() {
  return !!(process.env.AXA_CLIENT_ID && process.env.AXA_CLIENT_SECRET)
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AxaQuoteInput {
  destinationCountry: string   // ISO 3166-1 alpha-2, e.g. 'FR'
  originCountry:      string   // ISO 3166-1 alpha-2, e.g. 'GB'
  departureDate:      string   // YYYY-MM-DD
  returnDate:         string   // YYYY-MM-DD
  travellers:         number   // count of travellers (≥1)
  leadTravellerDob:   string   // YYYY-MM-DD — lead traveller's date of birth
  tripCostUsd?:       number   // optional trip cost for cancellation coverage
}

export interface AxaPlan {
  planId:    string
  planName:  string
  premium:   number
  currency:  string
  coverages: unknown
  termsUrl?: string
}

export interface AxaQuoteResult {
  quoteRequestId: string
  plans:          AxaPlan[]
  expiresAt?:     string
  raw:            unknown
}

export interface AxaPolicyInput {
  quoteRequestId:    string   // from getAxaQuote()
  planId:            string   // selected plan from getAxaQuote()
  policyHolder: {
    firstName:   string
    lastName:    string
    email:       string
    phone:       string
    dateOfBirth: string      // YYYY-MM-DD
    address:     string
    city:        string
    country:     string
    postalCode:  string
  }
  additionalInsured?: Array<{
    firstName:   string
    lastName:    string
    dateOfBirth: string
  }>
}

export interface AxaPolicyResult {
  policyId:       string
  policyNumber:   string
  certificateUrl?: string
  status:         string
  raw:            unknown
}

// ── 1. Get Quote ──────────────────────────────────────────────────────────────

/**
 * POST /sales/v2/individual/travel/quotes_requests
 *
 * Returns all eligible plans + premiums for the given trip parameters.
 * NOTE: All request/response field names below are provisional and must be
 * confirmed against the AXA Partners travel-sales.openapi.json spec before
 * going live.
 */
export async function getAxaQuote(input: AxaQuoteInput): Promise<AxaQuoteResult> {
  // AXA requires a traveller array with individual DOBs.
  // We have the lead traveller DOB from the quote form; additional travellers
  // use the lead DOB as a placeholder — the spec must be checked for whether
  // individual DOBs are required for all travellers at quote stage.
  // TODO: confirm vs OpenAPI travel-sales.openapi.json — traveller array structure
  const travellerArray = Array.from({ length: Math.max(1, input.travellers) }, (_, i) => ({
    dateOfBirth: input.leadTravellerDob,  // TODO: confirm field name (might be date_of_birth)
    isPrimary:   i === 0,                 // TODO: confirm field name / whether this field exists
  }))

  const requestBody: Record<string, unknown> = {
    // TODO: confirm vs OpenAPI travel-sales.openapi.json — all field names below
    destinationCountry: input.destinationCountry, // TODO: confirm (might need alpha-3)
    originCountry:      input.originCountry,       // TODO: confirm
    departureDate:      input.departureDate,        // TODO: confirm (might be 'startDate')
    returnDate:         input.returnDate,           // TODO: confirm (might be 'endDate')
    travellers:         travellerArray,             // TODO: confirm outer field name
    ...(input.tripCostUsd != null
      ? { tripCost: input.tripCostUsd }            // TODO: confirm field name and currency convention
      : {}),
  }

  const res = await axaFetch('/sales/v2/individual/travel/quotes_requests', {
    method: 'POST',
    body:   JSON.stringify(requestBody),
  })

  const raw = await res.json().catch(() => ({})) as Record<string, unknown>
  console.log('[axa] quotes_requests raw response:', JSON.stringify(raw))

  if (!res.ok) {
    const msg = String(raw.message ?? raw.error ?? raw.detail ?? raw.title ?? res.status)
    throw new Error(`AXA quote failed (HTTP ${res.status}): ${msg}`)
  }

  // Normalise — all field paths below are provisional
  // TODO: confirm vs OpenAPI travel-sales.openapi.json
  const quoteRequestId = String(
    raw.quoteRequestId ?? raw.quote_request_id ?? raw.quoteId ?? raw.id ?? '',
  )
  if (!quoteRequestId) throw new Error('AXA quote response missing quoteRequestId')

  const rawPlans = (raw.plans ?? raw.products ?? raw.options ?? []) as Record<string, unknown>[]

  const plans: AxaPlan[] = rawPlans.map(p => {
    // Premium might be nested under premiums[0].grossPremium or premium.amount
    // TODO: confirm vs OpenAPI travel-sales.openapi.json
    const premiumsArr = p.premiums as Array<Record<string, unknown>> | undefined
    const premiumObj  = (premiumsArr?.[0] ?? p.premium) as Record<string, unknown> | undefined ?? {}
    const premium     = Number(
      premiumObj.grossPremium ?? premiumObj.amount ?? premiumObj.total ?? p.price ?? 0,
    )
    const currency    = String(premiumObj.currency ?? raw.currency ?? 'USD')

    return {
      planId:    String(p.planId   ?? p.plan_id   ?? p.productId ?? p.id   ?? ''),
      planName:  String(p.planName ?? p.plan_name ?? p.name      ?? p.title ?? 'Travel Plan'),
      premium,
      currency,
      coverages: (p.coverages ?? p.benefits ?? p.covers ?? {}) as unknown,
      termsUrl:  String(
        p.termsAndConditionsUrl ?? p.terms_url ?? p.wording_url ?? p.policyWordingUrl ?? '',
      ) || undefined,
    }
  })

  return {
    quoteRequestId,
    plans,
    expiresAt: String(raw.quoteExpiresAt ?? raw.expires_at ?? '') || undefined,
    raw,
  }
}

// ── 2. Create Policy ──────────────────────────────────────────────────────────

/**
 * POST /sales/v2/individual/travel/policies
 *
 * Issues the policy for the selected plan. Returns policy number + certificate URL.
 *
 * NOTE: The exact endpoint path and all request/response field names are
 * provisional. The spec may use /policies/subscribe, /policies/issue, or
 * require payment details at creation time.
 * TODO: confirm vs OpenAPI travel-sales.openapi.json before going live.
 */
export async function createAxaPolicy(input: AxaPolicyInput): Promise<AxaPolicyResult> {
  const requestBody: Record<string, unknown> = {
    // TODO: confirm vs OpenAPI travel-sales.openapi.json — all field names below
    quoteRequestId: input.quoteRequestId,   // TODO: confirm (might be 'quoteId' or 'quote_id')
    planId:         input.planId,           // TODO: confirm (might be 'productId' or 'plan_id')

    // Policyholder details — outer field name might be 'insured', 'subscriber',
    // 'policyHolder', or 'policyHolderDetails'
    // TODO: confirm vs OpenAPI travel-sales.openapi.json
    policyHolder: {
      firstName:   input.policyHolder.firstName,    // TODO: confirm (might be 'first_name')
      lastName:    input.policyHolder.lastName,     // TODO: confirm (might be 'last_name')
      email:       input.policyHolder.email,
      phone:       input.policyHolder.phone,
      dateOfBirth: input.policyHolder.dateOfBirth,  // TODO: confirm (might be 'date_of_birth')
      address: {                                    // TODO: confirm nested address shape
        street:     input.policyHolder.address,     // TODO: confirm (might be 'line1' or 'streetAddress')
        city:       input.policyHolder.city,
        country:    input.policyHolder.country,
        postalCode: input.policyHolder.postalCode,  // TODO: confirm (might be 'zipCode' or 'postal_code')
      },
    },

    ...(input.additionalInsured?.length
      ? {
          // TODO: confirm outer field name (might be 'additionalTravellers' or 'coInsured')
          additionalInsured: input.additionalInsured.map(t => ({
            firstName:   t.firstName,
            lastName:    t.lastName,
            dateOfBirth: t.dateOfBirth,  // TODO: confirm field name
          })),
        }
      : {}),

    // TODO: confirm whether AXA requires payment metadata at policy creation
    // (some AXA channels issue policy pre-payment and handle payment separately)
  }

  // TODO: confirm endpoint path — spec may use /policies/subscribe or /policies/issue
  const res = await axaFetch('/sales/v2/individual/travel/policies', {
    method: 'POST',
    body:   JSON.stringify(requestBody),
  })

  const raw = await res.json().catch(() => ({})) as Record<string, unknown>
  console.log('[axa] policies raw response:', JSON.stringify(raw))

  if (!res.ok) {
    const msg = String(raw.message ?? raw.error ?? raw.detail ?? raw.title ?? res.status)
    throw new Error(`AXA policy creation failed (HTTP ${res.status}): ${msg}`)
  }

  // Normalise — all field names provisional
  // TODO: confirm vs OpenAPI travel-sales.openapi.json
  const policyId = String(
    raw.policyId     ?? raw.policy_id     ?? raw.id       ?? '',
  )
  const policyNumber = String(
    raw.policyNumber ?? raw.policy_number ?? raw.reference ?? raw.policyReference ?? policyId,
  )
  const certificateUrl = (
    raw.certificateUrl     ?? raw.certificate_url  ??
    raw.policyDocumentUrl  ?? raw.policy_document_url ??
    raw.documentUrl        ?? null
  ) as string | null

  if (!policyId) throw new Error('AXA policy response missing policyId — check OpenAPI spec')

  return {
    policyId,
    policyNumber,
    certificateUrl: certificateUrl ?? undefined,
    status:         String(raw.status ?? raw.policyStatus ?? 'issued'),
    raw,
  }
}
