/**
 * Recruitment Hub — Release 8 (communication automation templates).
 *
 * Covers: placeholder extraction and rendering (escaping, unknown
 * placeholders refused), text→HTML conversion, seed templates (all four,
 * valid placeholders, rejection explicitly framed as a human decision),
 * template input validation, send-route safety (human-only, rendered
 * server-side, unreplaced instruction text refused, Email Hub recording),
 * no automatic sending anywhere, and migration invariants.
 */

import fs from 'fs'
import path from 'path'

import {
  placeholdersIn, renderTemplate, textToHtml, validateTemplateInput,
  SEED_TEMPLATES, TEMPLATE_VARS,
} from '@/lib/recruitment/templates'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('template rendering', () => {
  it('extracts unique placeholders', () => {
    expect(placeholdersIn('Hi {{firstName}} {{ firstName }}, ref {{reference}}').sort())
      .toEqual(['firstName', 'reference'])
    expect(placeholdersIn('no placeholders')).toEqual([])
  })
  it('substitutes known vars and tolerates missing values', () => {
    const r = renderTemplate('Dear {{firstName}}, ref {{reference}}.', { firstName: 'Ada' })
    expect(r).toEqual({ ok: true, rendered: 'Dear Ada, ref .' })
  })
  it('refuses unknown placeholders instead of leaking braces to candidates', () => {
    const r = renderTemplate('Hi {{firstNme}}', { firstName: 'Ada' })
    expect(r).toEqual({ ok: false, unknown: ['firstNme'] })
  })
  it('textToHtml escapes content and preserves paragraphs', () => {
    const html = textToHtml('Hello <script>alert(1)</script>\n\nSecond paragraph')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect((html.match(/<p /g) ?? []).length).toBeGreaterThanOrEqual(3) // 2 paragraphs + footer
  })
})

// ── Seed templates ────────────────────────────────────────────────────────────

describe('seed templates', () => {
  it('provides the four defaults with only allowed placeholders', () => {
    expect(SEED_TEMPLATES.map(t => t.key).sort()).toEqual(
      ['rejection_after_review', 'request_more_info', 'talent_pool_added', 'under_review'])
    for (const t of SEED_TEMPLATES) {
      for (const field of [t.subject, t.body]) {
        const unknown = placeholdersIn(field).filter(p => !(TEMPLATE_VARS as readonly string[]).includes(p))
        expect(unknown).toEqual([])
      }
    }
  })
  it('frames rejection as a human decision and offers data removal', () => {
    const rejection = SEED_TEMPLATES.find(t => t.key === 'rejection_after_review')!
    expect(rejection.body).toContain('decision made by our staff')
    expect(rejection.body).toContain('remove')
  })
  it('is seeded idempotently by the migration without overwriting edits', () => {
    const sql = read('prisma/migrations/recruitment_r8_email_templates.sql')
    expect(sql).toContain('ON CONFLICT ("key") DO NOTHING')
    for (const t of SEED_TEMPLATES) expect(sql).toContain(`'${t.key}'`)
  })
})

// ── Input validation ──────────────────────────────────────────────────────────

describe('validateTemplateInput', () => {
  it('requires name/subject/body and refuses unknown placeholders', () => {
    expect(validateTemplateInput({})).toMatchObject({ ok: false })
    expect(validateTemplateInput({ name: 'X', subject: 'S', body: 'B' })).toMatchObject({ ok: true })
    expect(validateTemplateInput({ name: 'X', subject: 'Hi {{typo}}', body: 'B' }))
      .toMatchObject({ ok: false, error: expect.stringContaining('typo') })
  })
  it('partial mode validates only supplied fields', () => {
    expect(validateTemplateInput({ isActive: false }, true)).toMatchObject({ ok: true, value: { isActive: false } })
    expect(validateTemplateInput({ isActive: 'yes' }, true)).toMatchObject({ ok: false })
  })
})

// ── Send route safety ─────────────────────────────────────────────────────────

describe('send-email route', () => {
  const src = read('app/api/admin/recruitment/applications/[id]/send-email/route.ts')
  it('authenticates, authorizes as management, and is dynamic', () => {
    expect(src).toContain('getAdminSession')
    expect(src).toContain('{ status: 401 }')
    expect(src).toContain("hasRecruitmentPermission(session, 'recruitment.candidates.manage')")
    expect(src).toContain("export const dynamic = 'force-dynamic'")
  })
  it('renders server-side, refuses unknown placeholders and unreplaced instruction text', () => {
    expect(src).toContain('renderTemplate')
    expect(src).toContain('Unknown placeholder')
    expect(src).toContain('replace the placeholder instruction text')
  })
  it('records the send in the careers Email Hub thread and audits it', () => {
    expect(src).toContain("refType: 'application'")
    expect(src).toContain('emailMessage.create')
    expect(src).toContain("direction: 'out'")
    expect(src).toContain("recruitmentAudit(session, 'Candidate Emailed'")
  })
  it('is an explicit human action — no scheduling, no stage hooks', () => {
    expect(src).not.toMatch(/cron|setInterval|setTimeout|moveApplicationStage|stageKey/)
    expect(src).toContain('explicit human action')
  })
})

describe('no automatic candidate emails on stage moves', () => {
  it('the pipeline move engine sends nothing', () => {
    const src = read('lib/recruitment/pipeline.ts')
    expect(src).not.toMatch(/getResend|emails\.send|renderTemplate/)
  })
})

// ── Template management routes ────────────────────────────────────────────────

describe('template routes', () => {
  const routes = [
    'app/api/admin/recruitment/templates/route.ts',
    'app/api/admin/recruitment/templates/[id]/route.ts',
  ]
  it.each(routes)('%s authenticates and authorizes', route => {
    const src = read(route)
    expect(src).toContain('getAdminSession')
    expect(src).toContain('{ status: 401 }')
    expect(src).toContain("hasRecruitmentPermission(session, 'recruitment.settings.manage')")
    expect(src).toContain('validateTemplateInput')
  })
})

// ── UI wiring ─────────────────────────────────────────────────────────────────

describe('communication UI', () => {
  it('the send section is embedded in the application page and confirms before sending', () => {
    expect(read('app/admin/recruitment/applications/[id]/page.tsx')).toContain('SendEmailSection')
    const section = read('components/admin/recruitment/SendEmailSection.tsx')
    expect(section).toContain('confirm(')
    expect(section).toContain('nothing sends automatically')
  })
  it('the templates page manages templates against the real APIs and is in the nav', () => {
    const page = read('app/admin/recruitment/templates/page.tsx')
    expect(page).toContain('/api/admin/recruitment/templates')
    expect(page).toContain("method: 'PATCH'")
    expect(read('lib/admin/permissions.ts')).toContain('/admin/recruitment/templates')
  })
})

// ── Migration invariants ──────────────────────────────────────────────────────

describe('recruitment_r8 migration', () => {
  const sql = read('prisma/migrations/recruitment_r8_email_templates.sql')
  it('creates the table idempotently with a unique key index', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "RecruitmentEmailTemplate"')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "RecruitmentEmailTemplate_key_key"')
  })
})
