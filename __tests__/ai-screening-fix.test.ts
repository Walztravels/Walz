/**
 * AI Screening production fix (incident 2026-09-11).
 *
 * Root cause: lib/extractPdfText.ts did a TOP-LEVEL require('pdf-parse');
 * pdf-parse v2 crashes at module init on Vercel (ReferenceError: DOMMatrix
 * is not defined — @napi-rs/canvas absent from the lambda), which killed
 * BOTH the GET and POST of the ai-screening route before any handler code
 * ran, producing non-JSON 500s that the UI swallowed silently. Secondary
 * defect: the old code called pdf-parse as a function; v2 exports a
 * PDFParse class, so extraction could never succeed even when loaded.
 */
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockDb = {
  jobApplication:    { findUnique: jest.fn() },
  jobOpening:        { findUnique: jest.fn() },
  aiScreeningResult: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  candidateDocument: { findFirst: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockDb, prisma: mockDb }))

const mockCreate = jest.fn()
jest.mock('@/lib/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mockCreate } }),
}))

const mockDownload = jest.fn()
jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ storage: { from: () => ({ download: mockDownload }) } }),
}))

const mockAudit = jest.fn()
jest.mock('@/lib/recruitment/core', () => ({
  recruitmentAudit: (...a: unknown[]) => mockAudit(...a),
  hasRecruitmentPermission: () => true,
}))
jest.mock('@/lib/recruitment/applications', () => ({ RECRUITMENT_BUCKET: 'recruitment-docs' }))

/* eslint-disable @typescript-eslint/no-var-requires */
const { runAiScreening, RUNNING_STALE_MS } = require('@/lib/recruitment/ai-screening')

const session = { id: 'staff1', email: 'admin@walztravels.com', name: 'Admin' }

function consentedApplication() {
  mockDb.jobApplication.findUnique.mockResolvedValue({
    id: 'app1', reference: 'WLZ-A-1', jobId: 'job1', coverLetter: 'I sell well.',
    consentAiVersion: 'v1', answers: [{ question: 'Why?', answer: 'Because.' }],
  })
  mockDb.jobOpening.findUnique.mockResolvedValue({ title: 'Sales Rep', requirements: 'Sales exp', description: 'Sell.' })
  mockDb.candidateDocument.findFirst.mockResolvedValue(null) // no CV attached
  mockDb.aiScreeningResult.updateMany.mockResolvedValue({ count: 0 })
  mockDb.aiScreeningResult.findFirst.mockResolvedValue(null)
  mockDb.aiScreeningResult.create.mockResolvedValue({ id: 'run1' })
  mockDb.aiScreeningResult.update.mockResolvedValue({ id: 'run1' })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

// ═════════════════════════════════════════════════════════════════════════════
describe('module-load regression (the actual production crash)', () => {
  it('lib/extractPdfText has NO top-level pdf-parse require and installs DOM stubs before loading', () => {
    const src = read('lib/extractPdfText.ts')
    // The killer line is gone:
    expect(src).not.toMatch(/^const pdfParse = require\('pdf-parse'\)/m)
    // Lazy load happens inside a function, after stubs:
    expect(src).toContain('function installDomStubs')
    expect(src).toContain('g.DOMMatrix ??=')
    expect(src).toContain('installDomStubs()')
    // Correct v2 API — class, not callable module:
    expect(src).toContain('new PDFParse({ data: new Uint8Array(pdfBuffer) })')
    expect(src).toContain('getText')
    // Typed failure for callers:
    expect(src).toContain("code = 'CV_TEXT_EXTRACTION_FAILED'")
  })

  it('the ai-screening route no longer dies when the PDF parser cannot load', async () => {
    jest.isolateModules(() => {
      jest.doMock('pdf-parse', () => { throw new Error('Cannot find module @napi-rs/canvas') })
      // Importing the module graph must NOT throw (this was the crash):
      const mod = require('@/lib/extractPdfText')
      expect(typeof mod.extractPdfText).toBe('function')
    })
  })

  it('extraction failure is a typed error, not a crash', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        jest.doMock('pdf-parse', () => { throw new Error('Cannot find module @napi-rs/canvas') })
        const { extractPdfText, PdfExtractionError } = require('@/lib/extractPdfText')
        extractPdfText(Buffer.from('%PDF-1.4'))
          .then(() => reject(new Error('should have thrown')))
          .catch((e: unknown) => {
            try {
              expect(e).toBeInstanceOf(PdfExtractionError)
              expect((e as { code: string }).code).toBe('CV_TEXT_EXTRACTION_FAILED')
              resolve()
            } catch (err) { reject(err) }
          })
      })
    })
  })

  it('bank analyser shares the safe loader instead of its own v1-shaped call', () => {
    const src = read('lib/analyzeBankStatement.ts')
    expect(src).toContain("await import('@/lib/extractPdfText')")
    expect(src).not.toMatch(/pp\(pdfBuffer\)/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('runAiScreening — structured outcomes and guards', () => {
  it('missing ANTHROPIC_API_KEY → AI_NOT_CONFIGURED, no provider call, no row', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await runAiScreening(session, 'app1')
    expect(r).toMatchObject({ ok: false, code: 'AI_NOT_CONFIGURED', status: 503 })
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockDb.aiScreeningResult.create).not.toHaveBeenCalled()
  })

  it('unknown application → APPLICATION_NOT_FOUND', async () => {
    mockDb.jobApplication.findUnique.mockResolvedValue(null)
    const r = await runAiScreening(session, 'nope')
    expect(r).toMatchObject({ ok: false, code: 'APPLICATION_NOT_FOUND', status: 404 })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('no recorded consent → AI_CONSENT_REQUIRED and the provider is never called', async () => {
    mockDb.jobApplication.findUnique.mockResolvedValue({
      id: 'app1', reference: 'WLZ-A-1', jobId: 'job1', coverLetter: '',
      consentAiVersion: null, answers: [],
    })
    const r = await runAiScreening(session, 'app1')
    expect(r).toMatchObject({ ok: false, code: 'AI_CONSENT_REQUIRED', status: 403 })
    expect(r.ok === false && r.message).toContain('did not consent')
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockDb.aiScreeningResult.create).not.toHaveBeenCalled()
  })

  it('a run already in progress → SCREENING_ALREADY_RUNNING, no second paid call', async () => {
    consentedApplication()
    mockDb.aiScreeningResult.findFirst.mockResolvedValue({ id: 'already' })
    const r = await runAiScreening(session, 'app1')
    expect(r).toMatchObject({ ok: false, code: 'SCREENING_ALREADY_RUNNING', status: 409 })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('stale running rows are closed out (not blocking forever)', async () => {
    consentedApplication()
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"summary":"Fine.","strengths":[],"concerns":[],"suggestedQuestions":[],"matchScore":70}' }] })
    await runAiScreening(session, 'app1')
    expect(mockDb.aiScreeningResult.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'running' }),
      data:  { status: 'failed', error: 'Run timed out' },
    }))
    expect(RUNNING_STALE_MS).toBe(3 * 60 * 1000)
  })

  it('success: running row created BEFORE the provider call, updated to completed after', async () => {
    consentedApplication()
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"summary":"Good fit for stated requirements.","strengths":["sales"],"concerns":[],"suggestedQuestions":["Tell me about a sale"],"matchScore":82}' }] })
    const r = await runAiScreening(session, 'app1')
    expect(r).toMatchObject({ ok: true, resultId: 'run1', cvStatus: 'none' })
    expect(r.ok && r.cvMessage).toContain('No CV is attached')
    const createArg = mockDb.aiScreeningResult.create.mock.calls[0][0].data
    expect(createArg.status).toBe('running')
    expect(createArg.requestedBy).toBe(session.email)
    const updateArg = mockDb.aiScreeningResult.update.mock.calls[0][0].data
    expect(updateArg.status).toBe('completed')
    expect(updateArg.matchScore).toBe(82)
  })

  it('provider failure → failed row with a SAFE message, run remains retryable', async () => {
    consentedApplication()
    mockCreate.mockRejectedValue(new Error('401 invalid x-api-key sk-ant-secret'))
    const r = await runAiScreening(session, 'app1')
    expect(r.ok).toBe(true)   // row saved for audit; UI shows failed chip
    const updateArg = mockDb.aiScreeningResult.update.mock.calls[0][0].data
    expect(updateArg.status).toBe('failed')
    expect(updateArg.error).toBe('AI provider request failed — you can run the screening again')
    expect(updateArg.error).not.toContain('sk-ant')   // raw provider error never stored/shown
  })

  it('screening NEVER changes pipeline stage or application status', async () => {
    consentedApplication()
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"summary":"ok","strengths":[],"concerns":[],"suggestedQuestions":[],"matchScore":10}' }] })
    await runAiScreening(session, 'app1')
    // No update surface for JobApplication exists in the mock — and the
    // source contains no stage/status writes at all:
    const lib = read('lib/recruitment/ai-screening.ts')
    expect(lib).not.toMatch(/jobApplication\.update/)
    expect(lib).not.toMatch(/stageKey\s*:/)
    expect(lib).toContain('Deliberately no stage or status change')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('route + UI invariants', () => {
  const route = read('app/api/admin/recruitment/applications/[id]/ai-screening/route.ts')
  const ui    = read('components/admin/recruitment/AiScreeningSection.tsx')

  it('route returns structured { ok, code, message } for auth and failures', () => {
    for (const code of ['UNAUTHENTICATED', 'FORBIDDEN', 'RATE_LIMITED', 'DATABASE_ERROR']) {
      expect(route).toContain(`code: '${code}'`)
    }
    expect(route).toContain('result.code')
    expect(route).toContain('cvStatus: result.cvStatus')
  })

  it('UI: immediate loading copy, and every fetch/JSON parse is guarded', () => {
    expect(ui).toContain('Screening application…')
    expect(ui).toContain('async function safeJson')
    // The only res.json() lives inside the try/catch of safeJson itself:
    expect(ui.match(/await res\.json\(\)/g)?.length).toBe(1)
    expect((ui.match(/await safeJson\(/g)?.length ?? 0)).toBeGreaterThanOrEqual(3)
    // Every failure path sets a visible message:
    expect(ui).toContain('Network error while screening')
    expect(ui).toContain('Screening history could not be loaded')
  })

  it('UI: single-flight ref guard makes double-clicks free', () => {
    expect(ui).toContain('const inFlight = useRef(false)')
    expect(ui).toContain('if (inFlight.current) return')
    expect(ui).toContain('inFlight.current = true')
    expect(ui).toContain('disabled={running || extracting !== false}')
  })

  it('UI: explicit re-run action and audit history retained', () => {
    expect(ui).toContain("'Run screening again'")
    expect(ui).toContain('Previous results stay below for audit history')
  })

  it('UI: human accountability step unchanged', () => {
    expect(ui).toContain('Mark as reviewed by me')
    expect(ui).toContain("method: 'PATCH'")
  })

  it('route PATCH records the authenticated staff member and timestamp', () => {
    expect(route).toContain('reviewedBy: session.email')
    expect(route).toContain('reviewedAt: new Date()')
  })

  it('GET keeps returning up to 10 historical results (audit history retrievable)', () => {
    expect(route).toContain('take:    10')
    expect(route).toContain("orderBy: { createdAt: 'desc' }")
  })
})
