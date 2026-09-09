/**
 * Jade Email Writer — production "invalid JSON" fix.
 *
 * The route now gets its draft from a FORCED draft_email tool call
 * (structured output) and, when the model answers in text anyway, from one
 * central normalizing parser that never throws away a usable draft. These
 * tests exercise every parser path plus the route/UI safety invariants.
 */
import fs from 'fs'
import path from 'path'
import {
  parseJadeEmailDraft,
  validateDraftShape,
  JADE_DRAFT_FAILED_MESSAGE,
} from '@/lib/email/jade-draft-parse'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('parseJadeEmailDraft', () => {
  it('valid structured JSON', () => {
    const r = parseJadeEmailDraft('{"subject":"Your Dubai itinerary","body":"Dear Ada, ..."}')
    expect(r).toEqual({ ok: true, subject: 'Your Dubai itinerary', body: 'Dear Ada, ...', parseStrategy: 'direct_json' })
  })

  it('JSON wrapped in ```json fences', () => {
    const r = parseJadeEmailDraft('```json\n{"subject":"S","body":"Hello there, welcome aboard."}\n```')
    expect(r.ok && r.parseStrategy).toBe('fenced_json')
    expect(r.ok && r.body).toBe('Hello there, welcome aboard.')
  })

  it('leading/trailing whitespace and bare fences', () => {
    const r = parseJadeEmailDraft('\n\n   ```\n{"subject":"S","body":"Body text here."}\n```   \n')
    expect(r.ok && r.body).toBe('Body text here.')
  })

  it('JSON embedded in prose (the production failure shape)', () => {
    const r = parseJadeEmailDraft('Here is the drafted email:\n\n{"subject":"Visa documents","body":"Dear Sam, please find attached."}\n\nLet me know if you need changes!')
    expect(r.ok && r.parseStrategy).toBe('embedded_json')
    expect(r.ok && r.subject).toBe('Visa documents')
  })

  it('braces inside email content never confuse the balanced scan', () => {
    const body = 'Use code {WALZ10} at checkout. Details: {see attached}.'
    const r = parseJadeEmailDraft(`Sure!\n{"subject":"Promo","body":${JSON.stringify(body)}}`)
    expect(r.ok && r.body).toBe(body)
  })

  it('plain-text fallback keeps the generated email as the body', () => {
    const text = 'Dear Mrs. Bello,\n\nThank you for choosing Walz Travels. Your consultation is confirmed for Friday.\n\nWarm regards,'
    const r = parseJadeEmailDraft(text)
    expect(r.ok && r.parseStrategy).toBe('plain_text')
    expect(r.ok && r.body).toBe(text)
  })

  it('plain-text fallback preserves an existing staff subject', () => {
    const r = parseJadeEmailDraft('A perfectly good email body written as prose, not JSON.', 'Re: Group visa timeline')
    expect(r.ok && r.subject).toBe('Re: Group visa timeline')
  })

  it('plain-text fallback leaves subject EMPTY when staff typed none — never invents one', () => {
    const r = parseJadeEmailDraft('A perfectly good email body written as prose, not JSON.')
    expect(r.ok && r.subject).toBe('')
  })

  it('malformed JSON that still contains a usable body falls back to text', () => {
    // Broken JSON (trailing comma inside) but real sentences → keep as body
    const r = parseJadeEmailDraft('Dear guest, your booking is confirmed. We look forward to hosting you. {"subject": "oops",]')
    expect(r.ok).toBe(true)
  })

  it('completely unusable responses are the ONLY rejection', () => {
    expect(parseJadeEmailDraft('')).toEqual({ ok: false, reason: 'empty_response' })
    expect(parseJadeEmailDraft('   \n  ')).toEqual({ ok: false, reason: 'empty_response' })
    expect(parseJadeEmailDraft('{"subj"')).toEqual({ ok: false, reason: 'no_usable_content' })
  })

  it('HTML body content survives untouched', () => {
    const html = '<p>Dear client,</p><p>Your <strong>itinerary</strong> is ready.</p>'
    const r = parseJadeEmailDraft(`{"subject":"Itinerary","body":${JSON.stringify(html)}}`)
    expect(r.ok && r.body).toBe(html)
  })

  it('newlines and Unicode survive untouched', () => {
    const body = 'Ẹ káàbọ̀!\n\nLine two — naïve café ₦150,000.\nLine three.'
    const r = parseJadeEmailDraft(JSON.stringify({ subject: 'Ẹ káàbọ̀', body }))
    expect(r.ok && r.body).toBe(body)
    expect(r.ok && r.subject).toBe('Ẹ káàbọ̀')
  })

  it('validateDraftShape: body required, blank subject coerced to empty string', () => {
    expect(validateDraftShape({ subject: 'S', body: 'B' }, 'structured_tool')).toMatchObject({ ok: true })
    expect(validateDraftShape({ body: 'Only a body.' }, 'structured_tool')).toMatchObject({ ok: true, subject: '' })
    expect(validateDraftShape({ subject: 'S' }, 'structured_tool')).toBeNull()
    expect(validateDraftShape('nope', 'structured_tool')).toBeNull()
    expect(validateDraftShape(null, 'structured_tool')).toBeNull()
  })
})

describe('route + UI invariants', () => {
  const route = read('app/api/admin/email/jade/route.ts')
  const page  = read('app/admin/email/page.tsx')

  it('structured output: forced draft_email tool call with a strict schema', () => {
    expect(route).toContain("tool_choice: { type: 'tool', name: 'draft_email' }")
    expect(route).toContain("required: ['subject', 'body']")
    expect(route).toContain("validateDraftShape(toolBlock.input, 'structured_tool')")
  })

  it('the technical error and raw-response echo are gone', () => {
    expect(route).not.toContain('Jade returned invalid JSON')
    expect(route).not.toMatch(/error:.*raw/)
    expect(route).toContain('JADE_DRAFT_FAILED_MESSAGE')
  })

  it('observability fields logged, never full bodies', () => {
    for (const f of ['jadeEmailGenerationId', 'structuredOutputUsed', 'parseStrategy', 'validationResult', 'failureReason']) {
      expect(route).toContain(f)
    }
    expect(route).toContain('subjectLen=')
    // The only body reference in logging is its length — never the content
    const logLines = route.split('\n').filter(l => l.includes('console.log'))
    for (const l of logLines) {
      if (l.includes('result.body')) expect(l).toContain('result.body.length')
    }
  })

  it('cost-leakage scan still guards both subject and body', () => {
    expect(route).toContain('scanForCostLeakage(result.body) ?? scanForCostLeakage(result.subject)')
  })

  it('Jade only DRAFTS — the route sends nothing and the UI keeps staff in control', () => {
    expect(route).not.toMatch(/resend|emails\.send|sendEmail/i)
    // Generation fills the compose form; sending stays behind the staff Send action
    expect(page).toContain('setCompose(c => ({ ...c, subject: data.subject || c.subject, body: data.body }))')
    // Recipient list is never modified by the Jade handlers
    expect(page).not.toMatch(/generateWithJade[\s\S]{0,900}to:\s*\[/)
  })

  it('empty Jade subject never wipes the staff-typed subject; existing subject sent to the server', () => {
    expect(page).toContain('existingSubject: compose.subject || undefined')
    expect(page).toContain('data.subject || c.subject')
  })

  it('the Jade instruction field has exactly one writer — the textarea (no footer injection)', () => {
    const writers = page.match(/setJadePrompt\(/g) ?? []
    // useState init + clear-after-generate + clear-on-reset + textarea onChange
    expect(writers.length).toBeLessThanOrEqual(4)
    expect(page).not.toContain('automatic notification system')
    expect(page).toContain("setJadePrompt(e.target.value)")
  })
})

describe('failure copy', () => {
  it('is user-facing, not technical', () => {
    expect(JADE_DRAFT_FAILED_MESSAGE).toBe("Jade couldn't format this draft correctly. Please try again.")
  })
})
