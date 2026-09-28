/**
 * lib/performance/jade.ts::checkForDisciplinaryRecommendation — the
 * deterministic, code-level HR-output guard (mission remediation P2).
 *
 * Must distinguish (A) Jade independently recommending/deciding a
 * disciplinary outcome from (B) neutral/template language explaining
 * that management MAY consider further action — a naive substring filter
 * on words like "terminate"/"suspend" would incorrectly also block
 * entirely standard warning-letter boilerplate.
 */
import { checkForDisciplinaryRecommendation } from '@/lib/performance/jade'

describe('blocks an active disciplinary recommendation/decision', () => {
  it('"recommend terminating this employee"', () => {
    expect(checkForDisciplinaryRecommendation('I recommend terminating this employee.').ok).toBe(false)
  })
  it('"this employee should be fired"', () => {
    expect(checkForDisciplinaryRecommendation('This employee should be fired.').ok).toBe(false)
  })
  it('"suspend this employee immediately"', () => {
    expect(checkForDisciplinaryRecommendation('Suspend this employee immediately.').ok).toBe(false)
  })
  it('a bare recommendation of dismissal', () => {
    expect(checkForDisciplinaryRecommendation('We recommend dismissal effective immediately.').ok).toBe(false)
  })
  it('an independent demotion recommendation', () => {
    expect(checkForDisciplinaryRecommendation('This employee should be demoted to a junior role.').ok).toBe(false)
  })
  it('flags only the offending sentence, not the whole letter, but still fails overall', () => {
    const text = 'Dear Jane, your sales have been below target this quarter. I recommend terminating this employee. We appreciate your prior contributions.'
    const result = checkForDisciplinaryRecommendation(text)
    expect(result.ok).toBe(false)
    expect(result.flaggedCount).toBe(1)
  })
})

// Found by independent review of the first version of this guard —
// concrete bypasses (false negatives) and false positives it missed.
// Each case here was reproduced by the reviewer and is now fixed.
describe('hardening: bypasses found by independent review, now blocked', () => {
  it('bare imperative "Fire" (not just "fired"/"firing")', () => {
    expect(checkForDisciplinaryRecommendation('Fire this employee immediately.').ok).toBe(false)
  })
  it('the noun "suspension" (not just the verb "suspend")', () => {
    expect(checkForDisciplinaryRecommendation('I recommend suspension of this employee.').ok).toBe(false)
  })
  it('an explicit recommendation attached to a hedge word elsewhere in the same sentence cannot smuggle past the neutral-framing check', () => {
    expect(checkForDisciplinaryRecommendation(
      'Given the evidence, this may lead to the immediate termination of this employee, which I formally recommend.',
    ).ok).toBe(false)
  })
  it('"we advise" and "my recommendation is" are also recognized as explicit recommendation markers', () => {
    expect(checkForDisciplinaryRecommendation('We advise termination of this employee.').ok).toBe(false)
    expect(checkForDisciplinaryRecommendation('My recommendation is dismissal.').ok).toBe(false)
  })
})

describe('hardening: false positives found by independent review, now allowed', () => {
  it('an explicit denial that no disciplinary action is being taken', () => {
    expect(checkForDisciplinaryRecommendation(
      'This is a performance matter only; it does not constitute disciplinary action such as suspension or termination.',
    ).ok).toBe(true)
  })
  it('a purely factual, negated historical reference', () => {
    expect(checkForDisciplinaryRecommendation(
      'Note for context: the employee received a final written warning last year; no dismissal followed.',
    ).ok).toBe(true)
  })
})

describe('allows neutral/template language about POSSIBLE future consequences', () => {
  it('"failure to improve may result in further management action" — no keyword at all, never flagged', () => {
    expect(checkForDisciplinaryRecommendation('Failure to improve may result in further management action.').ok).toBe(true)
  })
  it('standard boilerplate naming termination as a conditional, possible outcome', () => {
    expect(checkForDisciplinaryRecommendation(
      'Failure to improve may result in further disciplinary action, up to and including termination of employment.',
    ).ok).toBe(true)
  })
  it('"could lead to termination" framed as a possibility, not a decision', () => {
    expect(checkForDisciplinaryRecommendation('Continued underperformance could lead to termination of employment.').ok).toBe(true)
  })
  it('"management may consider" framing', () => {
    expect(checkForDisciplinaryRecommendation('If performance does not improve, management may consider suspension.').ok).toBe(true)
  })
  it('legitimate PIP language with no disciplinary keyword at all', () => {
    expect(checkForDisciplinaryRecommendation(
      'This Performance Improvement Plan requires an increase in weekly sales activity over the next 60 days, with a formal review at the end of the period.',
    ).ok).toBe(true)
  })
  it('professionally drafted Final Warning content describing the already-selected warning type is never flagged (Jade may describe, not decide, the warning type)', () => {
    expect(checkForDisciplinaryRecommendation(
      'This Final Warning is being issued following a review of your sales performance over the last 90 days.',
    ).ok).toBe(true)
  })
  it('a full multi-paragraph legitimate warning letter passes entirely', () => {
    const text = [
      'Dear Jane,',
      'This letter serves as a formal written warning regarding your sales performance for the period 1 May to 29 August 2026.',
      'During this period, no completed sales were recorded against your name.',
      'We ask that you achieve at least 3 completed sales over the next 60 days.',
      'Support is available from your manager and the sales training team throughout this period.',
      'Failure to show sufficient improvement may result in further management action, up to and including termination of employment.',
      'A follow-up review is scheduled for 29 October 2026.',
      'If you believe any information in this notice is inaccurate, please contact your manager.',
    ].join(' ')
    expect(checkForDisciplinaryRecommendation(text).ok).toBe(true)
  })
})

describe('exported via callJadeAssist (integration through the public function)', () => {
  const mockCreate = jest.fn()
  jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } }))
  })

  it('callJadeAssist returns a blocked error, never the text, when the model output fails the guard', async () => {
    jest.resetModules()
    jest.doMock('@anthropic-ai/sdk', () => {
      return jest.fn().mockImplementation(() => ({
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [{ type: 'tool_use', name: 'return_text', input: { text: 'I recommend terminating this employee.' } }],
          }),
        },
      }))
    })
    const { callJadeAssist: freshCallJadeAssist } = await import('@/lib/performance/jade')
    const result = await freshCallJadeAssist({
      action: 'SUMMARIZE_EVIDENCE',
      facts: {
        employeeName: 'Jane Doe', jobTitle: 'Sales Agent', department: 'sales', employmentStatus: 'active',
        warningType: 'FIRST_WRITTEN_WARNING', reviewPeriodStart: '2026-05-01', reviewPeriodEnd: '2026-08-29',
        salesInPeriod: 0, lastSaleDate: null, reviewDate: '2026-09-29', warningHistorySummary: 'None.',
      },
    })
    expect(result.ok).toBe(false)
    expect((result as { blocked?: boolean }).blocked).toBe(true)
    expect(JSON.stringify(result)).not.toContain('recommend terminating')
  })

  it('callJadeAssist returns the text normally when it passes the guard', async () => {
    jest.resetModules()
    jest.doMock('@anthropic-ai/sdk', () => {
      return jest.fn().mockImplementation(() => ({
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [{ type: 'tool_use', name: 'return_text', input: { text: 'Sales in the review period totalled 0. Failure to improve may result in further management action.' } }],
          }),
        },
      }))
    })
    const { callJadeAssist: freshCallJadeAssist } = await import('@/lib/performance/jade')
    const result = await freshCallJadeAssist({
      action: 'SUMMARIZE_EVIDENCE',
      facts: {
        employeeName: 'Jane Doe', jobTitle: 'Sales Agent', department: 'sales', employmentStatus: 'active',
        warningType: 'FIRST_WRITTEN_WARNING', reviewPeriodStart: '2026-05-01', reviewPeriodEnd: '2026-08-29',
        salesInPeriod: 0, lastSaleDate: null, reviewDate: '2026-09-29', warningHistorySummary: 'None.',
      },
    })
    expect(result.ok).toBe(true)
  })
})
