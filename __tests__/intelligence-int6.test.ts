/**
 * INT-6 — Conversation Intelligence wiring + deterministic Client Lifecycle.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const convRoute = read('app/api/admin/intelligence/conversation/route.ts')
const lifeLib   = read('lib/intelligence/lifecycle.ts')
const lifeRoute = read('app/api/admin/intelligence/lifecycle/route.ts')
const lifePage  = read('app/admin/intelligence/lifecycle/page.tsx')
const events    = read('lib/intelligence/conversation-events.ts')

describe('conversation intelligence (INT-6)', () => {
  it('is wired to permitted Walz sources — no more paste-only', () => {
    expect(convRoute).toContain(".from('messages')")
    expect(convRoute).toContain("eq('lead_id'")
    expect(convRoute).toContain('visaApplicationMessage.findMany')
  })
  it('extracts typed structured events, never inferred', () => {
    for (const t of ['requested_service', 'promised_document', 'travel_date', 'price_objection', 'awaiting_decision', 'visa_status_question']) {
      expect(events).toContain(`'${t}'`)
    }
    expect(convRoute).toContain('ONLY things explicitly stated in the transcript')
    expect(convRoute).toContain('CONVERSATION_EVENT_TYPES.includes')
  })
  it('promise fields are actually populated now', () => {
    expect(convRoute).toContain('promiseDueDate:    promiseDue')
  })
  it('transcript is delimited as untrusted data', () => {
    expect(convRoute).toContain('<<<CONVERSATION_START>>>')
    expect(convRoute).toContain('UNTRUSTED DATA')
  })
  it('parse failure = controlled error, nothing persisted — silent neutral fallback removed', () => {
    expect(convRoute).toContain("code: 'AI_PARSE_FAILED'")
    expect(convRoute).not.toContain("summary: 'Analysis unavailable'")
    expect(convRoute.indexOf('AI_PARSE_FAILED')).toBeLessThan(convRoute.indexOf('conversationIntelligence.create'))
  })
  it('sourced re-runs dedupe instead of duplicating', () => {
    expect(convRoute).toContain('deduped: true')
  })
})

describe('client lifecycle (INT-6)', () => {
  it('multiplier pseudo-predictions are gone', () => {
    for (const src of [lifeLib, lifeRoute]) {
      expect(src).not.toContain('* 2.5')
      expect(src).not.toContain('* 0.8')
      expect(src).not.toContain('? 0.1 : 0.4')
      expect(src).not.toContain('? 0.6 : 0.2')
      expect(src).not.toContain('Math.random')
    }
    expect(lifeRoute).toContain('predictedLTV: 0, ltv12months: 0, ltv36months: 0')
  })
  it('derives deterministic stages with a stated basis', () => {
    for (const stage of ['REPEAT_CLIENT', 'BOOKED', 'QUOTED', 'VISA_IN_PROGRESS', 'VISA_DECIDED', 'POST_TRIP', 'NEW', 'DORMANT']) {
      expect(lifeLib).toContain(`'${stage}'`)
    }
    expect(lifeLib).toContain('stageBasis')
    expect(lifeLib).toContain('outstandingAction')
    expect(lifeLib).toContain('spendByCurrency')      // real spend, per currency — no cross-currency summing
  })
  it('email-union booking join covers guest bookings', () => {
    expect(lifeLib).toContain('contactEmail')
    expect(lifeLib).toContain("mode: 'insensitive'")
  })
  it('the page shows stages and actions, not invented percentages', () => {
    expect(lifePage).toContain('Outstanding Action')
    expect(lifePage).not.toContain('Churn %')
    expect(lifePage).not.toContain('Referral %')
    expect(lifePage).toContain('no predicted probabilities')
  })
  it('known limitation is documented: registered Users only', () => {
    expect(lifeRoute).toContain('only registered Users are covered')
  })
})
