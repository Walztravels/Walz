/**
 * DI-4 — Case Intelligence History.
 *
 * Append-only case timeline; letters and dummy tickets wrapped with
 * persistence WITHOUT changing generation; document-send stamping;
 * XSS-safe letter printing. History failures never break workflows.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const events       = read('lib/intelligence/case-events.ts')
const letterRoute  = read('app/api/admin/intelligence/letter-generator/route.ts')
const ticketRoute  = read('app/api/admin/intelligence/dummy-ticket/route.ts')
const sendRoute    = read('app/api/admin/intelligence/send-ticket/route.ts')
const uploadRoute  = read('app/api/admin/intelligence/visa-doc-upload/route.ts')
const checkRoute   = read('app/api/admin/intelligence/embassy-form-check/route.ts')
const page         = read('app/admin/intelligence/doc-auth/page.tsx')
const sql          = read('prisma/migrations/di4_case_history.sql')

describe('case timeline', () => {
  it('events are append-only — no update or delete paths exist', () => {
    expect(events).toContain('caseIntelligenceEvent.create')
    expect(events).not.toContain('caseIntelligenceEvent.update')
    expect(events).not.toContain('caseIntelligenceEvent.delete')
  })
  it('recording is best-effort: pre-migration failures never break the action', () => {
    expect(events).toContain('/does not exist|relation|column/i.test(msg)')
  })
  it('every DI action records its event type', () => {
    expect(uploadRoute).toContain("eventType: 'document_analyzed'")
    expect(checkRoute).toContain("eventType: 'cross_check_run'")
    expect(letterRoute).toContain("eventType: 'letter_generated'")
    expect(ticketRoute).toContain("eventType: 'ticket_generated'")
    expect(sendRoute).toContain("eventType: 'document_sent'")
  })
  it('event summaries carry references and counts, never PII', () => {
    for (const src of [uploadRoute, checkRoute, letterRoute, sendRoute]) {
      expect(src).not.toMatch(/summary:.*passportNumber/)
      expect(src).not.toMatch(/metadata:.*monthlyIncome/)
    }
  })
})

describe('letter persistence (generation unchanged)', () => {
  it('wraps the result: versioned append, never overwrite', () => {
    expect(letterRoute).toContain('generatedLetter.create')
    expect(letterRoute).toContain('generatedLetter.count')
    expect(letterRoute).not.toContain('generatedLetter.update')
    expect(letterRoute).not.toContain('generatedLetter.upsert')
    // Persistence sits AFTER the model call — the prompt/flow is untouched.
    expect(letterRoute.indexOf('messages.create')).toBeLessThan(letterRoute.indexOf('generatedLetter.create'))
  })
  it('a persistence failure never blocks generation', () => {
    expect(letterRoute).toContain('never block generation'.replace('never block generation', 'never block generation'))
    expect(letterRoute).toMatch(/catch \(persistErr\)/)
  })
  it('the print path is XSS-safe: letter goes in as textContent, never markup', () => {
    expect(page).toContain('pre.textContent = letter')
    expect(page).not.toContain('document.write(`<pre')
  })
})

describe('dummy ticket history (generation unchanged)', () => {
  it('records into the existing GeneratedTicket table referencing the stored PDF', () => {
    expect(ticketRoute).toContain('generatedTicket.create')
    expect(ticketRoute).toContain('visaApplicationId: opts.applicationId ?? null')
    expect(ticketRoute).toContain('pdfUrl: opts.pdfUrl')
    // History is recorded AFTER upload, and the PDF is never re-uploaded.
    expect((ticketRoute.match(/uploadPDF\(/g) ?? []).length).toBe(4)   // 1 definition + 3 existing call sites
  })
  it('history failures are swallowed — ticket generation cannot break', () => {
    expect(ticketRoute).toContain('history record failed')
  })
  it('all three modes record history', () => {
    expect((ticketRoute.match(/recordTicketHistory\(\{/g) ?? []).length).toBe(3)
  })
})

describe('send-to-client stamping', () => {
  it('stamps sentToEmail/sentAt on the ticket and records document_sent', () => {
    expect(sendRoute).toContain('sentToEmail: body.email')
    expect(sendRoute).toContain("status: 'sent'")
    expect(sendRoute).toContain('.catch(() => {})')       // best-effort
  })
  it('manual-mode sends no longer depend on flightDetails being present', () => {
    expect(sendRoute).not.toContain('body.flightDetails!')
    expect(sendRoute).toContain('flightForEmail')
  })
})

describe('history UI & migration', () => {
  it('the History tab shows the case timeline for the active case', () => {
    expect(page).toContain('CaseTimeline')
    expect(page).toContain('/api/admin/intelligence/case-history?applicationId=')
  })
  it('migration is additive and idempotent', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "CaseIntelligenceEvent"')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "GeneratedLetter"')
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i)
  })
})
