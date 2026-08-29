// lib/jade/commercial-grounding.ts
// Release 5.1 — Commercial Grounding Patch
//
// Defines the server-side authority structure for all commercial claims.
// Any price, FX rate, availability claim, or package total MUST originate
// from CommercialFacts or a live tool result. Jade must never generate
// commercial numbers from LLM parametric knowledge.
//
// SECURITY:
//   - partnerNetPrice, supplierCost, rateKey, offerId must never appear here
//   - Totals are per-currency only — never cross-currency sums
//   - Perishable prices carry a timestamp; stale prices must trigger re-search

export interface CommercialFxConversion {
  fromCurrency: string
  toCurrency:   string
  rate:         number
  timestamp:    string // ISO8601 — stale after 24h; refresh before use
}

export interface CommercialPrice {
  itemType:    'FLIGHT' | 'HOTEL' | 'TRANSFER' | 'ACTIVITY' | 'ESIM' | 'VISA_FEE' | 'OTHER'
  description: string
  amount:      number
  currency:    string
  source:      'SEARCH_RESULT' | 'TRIP_ITEM' | 'QUOTE' | 'GOVERNMENT_FEE'
}

export interface CommercialInventoryResult {
  itemType:  string
  available: boolean
}

export interface CommercialTotal {
  description: string
  amount:      number
  currency:    string
  itemCount:   number
}

// The authoritative commercial fact structure for a single Jade response turn.
// All fields are populated server-side; Jade receives this as read-only context.
export interface CommercialFacts {
  currencyConversions: CommercialFxConversion[]
  prices:              CommercialPrice[]
  inventoryResults:    CommercialInventoryResult[]
  authoritativeTotals: CommercialTotal[]
}

export const EMPTY_COMMERCIAL_FACTS: CommercialFacts = {
  currencyConversions: [],
  prices:              [],
  inventoryResults:    [],
  authoritativeTotals: [],
}

export function hasAnyFacts(facts: CommercialFacts): boolean {
  return (
    facts.currencyConversions.length > 0 ||
    facts.prices.length > 0 ||
    facts.inventoryResults.length > 0 ||
    facts.authoritativeTotals.length > 0
  )
}

// Builds the grounding contract section to append to Jade's system prompt.
// Injected on every turn. All commercial rules apply to every sentence of
// every response.
export function buildGroundingContract(facts: CommercialFacts): string {
  const factsJson = hasAnyFacts(facts)
    ? JSON.stringify(facts, null, 2)
    : '(none this turn)'

  return `
## COMMERCIAL GROUNDING CONTRACT — MANDATORY FOR EVERY RESPONSE

Authoritative commercial facts available for this response:
\`\`\`json
${factsJson}
\`\`\`

BINDING RULES — read before writing every sentence:

**RULE 1 — PRICES**
You may state a price ONLY if it appears in "prices" above or verbatim in a tool result returned this turn.
If no price is present: say "I can search for current prices" or "Let me check live options for you."
Never use: "around £X", "from £X", "approximately £X", "roughly £X", or any memory-based fare band.
✗ "Flights are around £700–£900." ✓ "I can search current flight options for those dates."
✗ "Hotels are £120–£150/night." ✓ "I can search live hotel availability for your dates."

**RULE 2 — FX CONVERSION**
You may state a currency conversion ONLY if currencyConversions above is non-empty and contains that pair.
If no conversion is present: preserve the customer's original currency without converting.
✗ "CAD $5,000 ≈ £2,960." ✓ "Your budget is CAD 5,000."
When currencies differ: "Your budget is [budget currency] and this result is in [product currency] — I'll keep them separate rather than estimating a conversion."

**RULE 3 — CROSS-CURRENCY BUDGET**
Never say "within budget", "over budget", "affordable", or "good value" when the product currency differs from the budget currency, unless currencyConversions provides an authoritative rate between those two currencies.
✗ (budget CAD, flight GBP, no FX entry): "That flight is well within your budget."
✓ "The flight is GBP 800 and your stated budget is CAD 5,000 — I'll keep those currencies separate."

**RULE 4 — AVAILABILITY LANGUAGE**
Never say "available", "runs from", "you can get", "still available", "I can get you", or "current price" without a matching inventoryResults entry confirming it.
For a previously selected perishable item: say "the last recorded price was [amount] — I'd recommend revalidating before we proceed."

**RULE 5 — PACKAGE TOTALS**
Never add price estimates together to produce a package total.
Totals must appear in authoritativeTotals above or come verbatim from a tool result.
✗ "Flight ~£800 + Hotel ~£900 = ~£1,700 total." ✓ "Once we run live searches I can put together an accurate trip summary."

**RULE 6 — VISA FEES**
Official government-mandated visa fees (in their original government currency) may be stated.
Conversions of visa fees to any other currency require a currencyConversions entry.
Walz Travels service fees require an up-to-date authoritative quote — never state them from memory.

**RULE 7 — TRIP COMPLETENESS**
You MAY recommend adding a missing component (transfer, eSIM, activity) without stating its price.
✓ "Your airport transfer is still missing — I can search available options for your arrival date."
Never attach any price to a trip-completeness recommendation unless a tool result or prices entry provides it.

**RULE 8 — AIRLINE / CARRIER GROUNDING**
Never name a specific airline or carrier unless a search tool result returned in THIS turn explicitly names that carrier.
✗ "British Airways typically flies that route." ✓ "I can search available airlines for those dates."
✗ "Emirates usually has good options London–Dubai." ✓ "Let me run a live search and show you what's available."
Carrier names, flight numbers, and schedule claims are ALL prohibited without an authoritative search result this turn.

**RULE 9 — CONTACT GROUNDING**
All phone numbers, WhatsApp numbers, and email addresses you state must come VERBATIM from the "Contact" section of your system prompt. NEVER invent, guess, or modify a contact number.
✗ Any number not listed in your system prompt's Contact section — even if it looks plausible.
✓ Only numbers and addresses explicitly listed in the Contact section below.
If you are uncertain, say "Reach us via walztravels.com/contact" — never fabricate or approximate a number.`
}
