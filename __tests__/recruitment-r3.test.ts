/**
 * Recruitment Hub — Release 3 (applicant tracking pipeline).
 *
 * Covers: stage-move validation (unknown stage, same stage, withdrawn,
 * missing application), authorization (management roles only), transactional
 * history writes, human-decision guarantees (movedBy is always the
 * authenticated staff email, decision stages audited as hiring decisions,
 * no automatic/AI rejection path), status derivation, notes API invariants
 * and route/page source invariants.
 */

import fs from 'fs'
import path from 'path'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const applications = new Map<string, Record<string, unknown>>()
const historyRows: Array<Record<string, unknown>> = []
const auditRows: Array<{ action: string; detail: string }> = []
let jobStages: Array<{ key: string }> = []

const db = {
  jobApplication: {
    // returns a snapshot, as real Prisma does — not a live reference
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const row = applications.get(where.id)
      return row ? { ...row } : null
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = applications.get(where.id)
      if (row) Object.assign(row, data)
      return row
    }),
  },
  jobPipelineStage: {
    findMany: jest.fn(async () => jobStages),
  },
  applicationStageHistory: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      historyRows.push(data)
      return { id: `h_${historyRows.length}`, ...data }
    }),
  },
  candidateNote: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'n1', ...data })) },
  activityLog: {
    create: jest.fn(async ({ data }: { data: { action: string; detail: string } }) => {
      auditRows.push(data)
      return data
    }),
  },
  $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: db, prisma: db }))

import {
  moveApplicationStage, statusForStage, isDecisionStage, DECISION_STAGES,
} from '@/lib/recruitment/pipeline'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/recruitment/core'

const manager  = { id: 's1', email: 'manager@walztravels.com', name: 'Manager', role: 'super_admin' }
const staff    = { id: 's2', email: 'staff@walztravels.com',   name: 'Staff',   role: 'travel_consultant' }

function seedApplication(over: Record<string, unknown> = {}) {
  const row = {
    id: 'app_1', reference: 'WALZ-CAREERS-2026-ABCDEF', jobId: 'job_1',
    stageKey: 'new', status: 'active', ...over,
  }
  applications.set(row.id as string, row)
  return row
}

beforeEach(() => {
  applications.clear()
  historyRows.length = 0
  auditRows.length = 0
  jobStages = DEFAULT_PIPELINE_STAGES.map(s => ({ key: s.key }))
  jest.clearAllMocks()
})

// ── Stage movement engine ─────────────────────────────────────────────────────

describe('moveApplicationStage', () => {
  it('moves a stage, writes history with the human mover, and derives status', async () => {
    seedApplication()
    const res = await moveApplicationStage({ session: manager, applicationId: 'app_1', toKey: 'recruiter_review', note: ' looks strong ' })
    expect(res).toEqual({ ok: true, fromKey: 'new', toKey: 'recruiter_review', status: 'active' })
    expect(applications.get('app_1')).toMatchObject({ stageKey: 'recruiter_review', status: 'active' })
    expect(historyRows).toHaveLength(1)
    expect(historyRows[0]).toMatchObject({
      applicationId: 'app_1', fromKey: 'new', toKey: 'recruiter_review',
      movedBy: 'manager@walztravels.com', note: 'looks strong',
    })
    // history + update ride one transaction
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })

  it('refuses non-management roles', async () => {
    seedApplication()
    const res = await moveApplicationStage({ session: staff, applicationId: 'app_1', toKey: 'shortlisted' })
    expect(res).toMatchObject({ ok: false, code: 'forbidden' })
    expect(historyRows).toHaveLength(0)
    expect(applications.get('app_1')).toMatchObject({ stageKey: 'new' })
  })

  it('rejects unknown stages, same-stage moves and missing applications', async () => {
    seedApplication()
    expect(await moveApplicationStage({ session: manager, applicationId: 'app_1', toKey: 'nonexistent_stage' }))
      .toMatchObject({ ok: false, code: 'invalid_stage' })
    expect(await moveApplicationStage({ session: manager, applicationId: 'app_1', toKey: 'new' }))
      .toMatchObject({ ok: false, code: 'same_stage' })
    expect(await moveApplicationStage({ session: manager, applicationId: 'ghost', toKey: 'shortlisted' }))
      .toMatchObject({ ok: false, code: 'not_found' })
    expect(historyRows).toHaveLength(0)
  })

  it('never moves a withdrawn application', async () => {
    seedApplication({ status: 'withdrawn' })
    const res = await moveApplicationStage({ session: manager, applicationId: 'app_1', toKey: 'shortlisted' })
    expect(res).toMatchObject({ ok: false, code: 'withdrawn' })
  })

  it('validates against the job’s own pipeline stages when customized', async () => {
    jobStages = [{ key: 'new' }, { key: 'custom_stage' }]
    seedApplication()
    expect(await moveApplicationStage({ session: manager, applicationId: 'app_1', toKey: 'custom_stage' }))
      .toMatchObject({ ok: true, toKey: 'custom_stage' })
    expect(await moveApplicationStage({ session: manager, applicationId: 'app_1', toKey: 'shortlisted' }))
      .toMatchObject({ ok: false, code: 'invalid_stage' })
  })

  it('records decision-stage moves as hiring decisions in the audit log', async () => {
    seedApplication({ stageKey: 'offer' })
    const res = await moveApplicationStage({ session: manager, applicationId: 'app_1', toKey: 'hired' })
    expect(res).toMatchObject({ ok: true, status: 'hired' })
    expect(auditRows.some(a => a.action === 'Recruitment: Hiring Decision')).toBe(true)
    expect(historyRows[0]).toMatchObject({ movedBy: 'manager@walztravels.com' })
  })

  it('derives application status from the target stage', () => {
    expect(statusForStage('hired')).toBe('hired')
    expect(statusForStage('rejected')).toBe('rejected')
    expect(statusForStage('talent_pool')).toBe('pooled')
    expect(statusForStage('shortlisted')).toBe('active')
    expect(statusForStage('new')).toBe('active')
  })

  it('marks exactly offer/hired/rejected as decision stages', () => {
    expect([...DECISION_STAGES].sort()).toEqual(['hired', 'offer', 'rejected'])
    for (const key of DECISION_STAGES) expect(isDecisionStage(key)).toBe(true)
    expect(isDecisionStage('shortlisted')).toBe(false)
  })
})

// ── Human-decision guardrails (source invariants) ─────────────────────────────

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('human hiring decisions only', () => {
  const pipelineSrc = read('lib/recruitment/pipeline.ts')

  it('movedBy is always the authenticated session email — never system or AI', () => {
    expect(pipelineSrc).toContain('movedBy: session.email')
    expect(pipelineSrc).not.toMatch(/movedBy:\s*['"]system['"]/)
    expect(pipelineSrc).not.toMatch(/movedBy:\s*['"]ai['"]/i)
  })

  it('the move engine requires management-role authorization', () => {
    expect(pipelineSrc).toContain("hasRecruitmentPermission(session, 'recruitment.candidates.manage')")
  })

  it('no code path auto-rejects candidates', () => {
    // The only writer of stageKey/rejected status is the human move engine.
    for (const file of ['lib/recruitment/pipeline.ts', 'lib/recruitment/applications.ts']) {
      const src = read(file)
      expect(src).not.toMatch(/autoReject|automatic(ally)?\s+reject/i)
    }
  })

  it('does not use facial analysis, emotion detection or protected characteristics', () => {
    for (const file of [
      'lib/recruitment/pipeline.ts',
      'app/admin/recruitment/applications/[id]/page.tsx',
      'app/admin/recruitment/jobs/[id]/pipeline/page.tsx',
    ]) {
      const src = read(file)
      expect(src).not.toMatch(/facial|emotion.detect|accent.scor/i)
    }
  })
})

// ── Route and page invariants ─────────────────────────────────────────────────

describe('route security invariants', () => {
  const routes = [
    'app/api/admin/recruitment/applications/[id]/route.ts',
    'app/api/admin/recruitment/applications/[id]/notes/route.ts',
    'app/api/admin/recruitment/candidates/[id]/route.ts',
  ]
  it.each(routes)('%s authenticates and authorizes', route => {
    const src = read(route)
    expect(src).toContain('getAdminSession')
    expect(src).toContain("{ status: 401 }")
    expect(src).toContain('hasRecruitmentPermission')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
  })

  it('application detail never leaks the status token hash', () => {
    const src = read('app/api/admin/recruitment/applications/[id]/route.ts')
    expect(src).toContain('statusTokenHash: _hash')   // stripped before responding
  })

  it('notes are validated and audited', () => {
    const src = read('app/api/admin/recruitment/applications/[id]/notes/route.ts')
    expect(src).toContain('max 5000')
    expect(src).toContain('recruitmentAudit')
    expect(src).toContain('session.email')
  })
})

describe('pipeline UI invariants', () => {
  it('the board renders job stages and moves via the applications API', () => {
    const src = read('app/admin/recruitment/jobs/[id]/pipeline/page.tsx')
    expect(src).toContain('pipelineStages')
    expect(src).toContain("action: 'move'")
    expect(src).toContain('hiring decision')          // decision confirm prompt
    expect(src).toContain('/admin/recruitment/applications/')
  })
  it('application page shows timeline, notes and stage control', () => {
    const src = read('app/admin/recruitment/applications/[id]/page.tsx')
    expect(src).toContain('stageHistory')
    expect(src).toContain('Internal notes')
    expect(src).toContain('never shown to the candidate')
    expect(src).toContain('AI never decides')
  })
  it('candidate profile lists applications, documents and notes', () => {
    const src = read('app/admin/recruitment/candidates/[id]/page.tsx')
    for (const needle of ['applications', 'documents', 'notes', '/admin/recruitment/applications/']) {
      expect(src).toContain(needle)
    }
  })
  it('jobs list links to the pipeline board', () => {
    expect(read('app/admin/recruitment/jobs/page.tsx')).toContain('/pipeline')
  })
})

// ── Migration invariants ──────────────────────────────────────────────────────

describe('recruitment_r3 migration', () => {
  const sql = read('prisma/migrations/recruitment_r3_pipeline_notes.sql')
  it('is idempotent and restrict-deletes candidate notes', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "CandidateNote"')
    expect(sql).toContain('ON DELETE RESTRICT')
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "CandidateNote_candidateId_createdAt_idx"/)
  })
})
