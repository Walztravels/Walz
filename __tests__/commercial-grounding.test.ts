// __tests__/commercial-grounding.test.ts
// Release 5.1 — Commercial Grounding Patch Tests
//
// Tests verify:
//   1. The grounding contract correctly blocks/allows commercial claims
//   2. System prompts no longer contain memory-based price tables
//   3. Intelligence functions no longer request price estimates from the LLM
//   4. FX conversions are blocked without an authoritative entry
//   5. Cross-currency budget comparisons are blocked without FX authority

import {
  buildGroundingContract,
  hasAnyFacts,
  EMPTY_COMMERCIAL_FACTS,
  type CommercialFacts,
} from '@/lib/jade/commercial-grounding'
import fs from 'fs'
import path from 'path'

// ─── Helper: read a source file as a string ──────────────────────────────────

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
}

// ─── 1. BUDGET CAD, NO FX RESULT → contract blocks GBP equivalent ────────────

describe('Test 1 — Budget CAD 5,000, no FX result', () => {
  it('grounding contract produced with empty facts does not allow FX conversion', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    // The contract must instruct Jade to preserve the original currency
    expect(contract).toContain('currencyConversions above is non-empty')
    // And the facts block must say "none this turn"
    expect(contract).toContain('(none this turn)')
  })

  it('hasAnyFacts returns false when all arrays are empty', () => {
    expect(hasAnyFacts(EMPTY_COMMERCIAL_FACTS)).toBe(false)
  })

  it('empty facts JSON block shows "(none this turn)" rather than an empty object', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    expect(contract).toContain('(none this turn)')
    expect(contract).not.toContain('"currencyConversions": []')
  })
})

// ─── 2. Toronto→London, no flight search → contract blocks price quotes ───────

describe('Test 2 — No flight search executed', () => {
  it('grounding contract with no prices blocks fare estimates', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    expect(contract).toContain('say "I can search for current prices"')
    expect(contract).toContain('memory-based fare band')
  })

  it('search/route.ts SYSTEM_PROMPT no longer instructs price estimation', () => {
    const source = readSource('app/api/jade/search/route.ts')
    expect(source).not.toContain('estimated prices in GBP')
    expect(source).not.toContain('estimated price range')
    expect(source).not.toContain('Flight estimate + Hotel estimate')
  })

  it('chat/route.ts JADE_SYSTEM no longer contains memory-based fare bands', () => {
    const source = readSource('app/api/jade/chat/route.ts')
    expect(source).not.toContain('From £89 short-haul')
    expect(source).not.toContain('From £350+ long-haul')
    expect(source).not.toContain('## PRICING KNOWLEDGE')
  })
})

// ─── 3. No hotel search → contract blocks room rate quotes ────────────────────

describe('Test 3 — No hotel search executed', () => {
  it('chatwoot JADE_MASTER no longer contains hotel room rate table', () => {
    const source = readSource('app/api/jade/chatwoot/route.ts')
    expect(source).not.toContain('from £60')
    expect(source).not.toContain('£120–£300')
    expect(source).not.toContain('£300–£800')
    expect(source).not.toContain('from £1,000–£2,500')
    expect(source).not.toContain('Hotels (per night)')
  })

  it('grounding contract explicitly calls out hotel price rule', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    expect(contract).toContain('Hotels are £120–£150/night')  // the bad example
    expect(contract).toContain('I can search live hotel availability')  // the good example
  })
})

// ─── 4. Transfer missing, no transfer result → recommendation without price ───

describe('Test 4 — Transfer missing, no result', () => {
  it('grounding contract Rule 7 allows trip completeness recommendation without price', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    expect(contract).toContain('RULE 7 — TRIP COMPLETENESS')
    expect(contract).toContain('airport transfer is still missing')
    expect(contract).toContain('I can search available options')
  })

  it('chatwoot JADE_MASTER no longer contains transfer price table', () => {
    const source = readSource('app/api/jade/chatwoot/route.ts')
    expect(source).not.toContain('Standard sedan (1–3 pax): from £35')
    expect(source).not.toContain('Minibus (7–14 pax): from £75')
  })
})

// ─── 5. eSIM missing, no result → recommendation without price ────────────────

describe('Test 5 — eSIM missing, no result', () => {
  it('chatwoot JADE_MASTER no longer contains eSIM price table', () => {
    const source = readSource('app/api/jade/chatwoot/route.ts')
    expect(source).not.toContain('1GB (city break): from £8')
    expect(source).not.toContain('10GB (extended trip): from £28')
  })

  it('search/route.ts no longer tells Jade to quote eSIM prices', () => {
    const source = readSource('app/api/jade/search/route.ts')
    expect(source).not.toContain('from £8')
    expect(source).not.toContain('from £28')
  })
})

// ─── 6. Authoritative flight result GBP 812 → Jade MAY state it ──────────────

describe('Test 6 — Authoritative price present', () => {
  it('grounding contract with a price entry allows stating that price', () => {
    const facts: CommercialFacts = {
      ...EMPTY_COMMERCIAL_FACTS,
      prices: [{
        itemType:    'FLIGHT',
        description: 'Return economy LHR',
        amount:      812,
        currency:    'GBP',
        source:      'SEARCH_RESULT',
      }],
    }
    const contract = buildGroundingContract(facts)
    // Facts JSON should contain the authoritative price
    expect(contract).toContain('"amount": 812')
    expect(contract).toContain('"currency": "GBP"')
    expect(contract).toContain('"source": "SEARCH_RESULT"')
    expect(hasAnyFacts(facts)).toBe(true)
  })
})

// ─── 7. Authoritative transfer result CAD 72 → Jade MAY state it ─────────────

describe('Test 7 — Authoritative transfer price present', () => {
  it('grounding contract with a CAD transfer price allows stating it', () => {
    const facts: CommercialFacts = {
      ...EMPTY_COMMERCIAL_FACTS,
      prices: [{
        itemType:    'TRANSFER',
        description: 'Airport sedan YYZ',
        amount:      72,
        currency:    'CAD',
        source:      'SEARCH_RESULT',
      }],
    }
    const contract = buildGroundingContract(facts)
    expect(contract).toContain('"amount": 72')
    expect(contract).toContain('"currency": "CAD"')
    expect(hasAnyFacts(facts)).toBe(true)
  })
})

// ─── 8. CAD budget + GBP product, no FX → no "within budget" ────────────────

describe('Test 8 — Cross-currency budget without FX authority', () => {
  it('grounding contract Rule 3 blocks cross-currency "within budget" claims', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    expect(contract).toContain('RULE 3 — CROSS-CURRENCY BUDGET')
    expect(contract).toContain('within budget')          // mentioned as the bad example
    expect(contract).toContain('I\'ll keep those currencies separate')
  })

  it('empty currencyConversions does not allow any FX assertion', () => {
    expect(EMPTY_COMMERCIAL_FACTS.currencyConversions).toHaveLength(0)
  })
})

// ─── 9. Same-currency TripItems → authoritative comparison allowed ────────────

describe('Test 9 — Same-currency comparison', () => {
  it('grounding contract with same-currency total allows budget comparison', () => {
    const facts: CommercialFacts = {
      ...EMPTY_COMMERCIAL_FACTS,
      authoritativeTotals: [{
        description: 'Trip total',
        amount:      4200,
        currency:    'CAD',
        itemCount:   3,
      }],
    }
    const contract = buildGroundingContract(facts)
    expect(contract).toContain('"amount": 4200')
    expect(contract).toContain('"currency": "CAD"')
    expect(hasAnyFacts(facts)).toBe(true)
  })
})

// ─── 10. LLM cannot transform an authoritative £812 into a different price ────

describe('Test 10 — Authoritative price cannot be modified by LLM', () => {
  it('grounding contract Rule 1 instructs Jade not to modify authoritative prices', () => {
    const contract = buildGroundingContract(EMPTY_COMMERCIAL_FACTS)
    // The rule says price must appear verbatim in facts or tool result
    expect(contract).toContain('verbatim in a tool result')
    expect(contract).toContain('ONLY if it appears in "prices" above')
  })

  it('intelligence.ts generateSurpriseTrip no longer requests costEstimate', () => {
    const source = readSource('lib/jade/intelligence.ts')
    expect(source).not.toContain('"costEstimate"')
    expect(source).not.toContain('costEstimate:')
  })

  it('intelligence.ts synthesizeGroupConsensus no longer requests priceEst', () => {
    const source = readSource('lib/jade/intelligence.ts')
    expect(source).not.toContain('"priceEst"')
    expect(source).not.toContain('priceEst:')
  })
})

// ─── Additional: FX hardcoded rates removed ───────────────────────────────────

describe('Additional — Hardcoded FX rates removed', () => {
  it('chatwoot/route.ts no longer contains hardcoded exchange rate table in JADE_MASTER', () => {
    const source = readSource('app/api/jade/chatwoot/route.ts')
    expect(source).not.toContain('£1 ≈ $1.35 ≈ ₦1,836')
    expect(source).not.toContain('Exchange rates used for conversions')
  })

  it('chatwoot/route.ts no longer injects "Always quote prices in ₦ first"', () => {
    const source = readSource('app/api/jade/chatwoot/route.ts')
    expect(source).not.toContain('Always quote prices in')
    expect(source).not.toContain('₦639,200 (about £348)')
  })

  it('chatwoot/route.ts visa section no longer has naira equivalents', () => {
    const source = readSource('app/api/jade/chatwoot/route.ts')
    expect(source).not.toContain('₦555,680')
    expect(source).not.toContain('₦511,440')
    expect(source).not.toContain('₦694,800')
  })

  it('grounding contract is injected in chatwoot buildSystemPrompt', () => {
    const source = readSource('app/api/jade/chatwoot/route.ts')
    expect(source).toContain('buildGroundingContract')
    expect(source).toContain('EMPTY_COMMERCIAL_FACTS')
  })

  it('grounding contract is injected in chat route', () => {
    const source = readSource('app/api/jade/chat/route.ts')
    expect(source).toContain('buildGroundingContract')
    expect(source).toContain('EMPTY_COMMERCIAL_FACTS')
  })
})
