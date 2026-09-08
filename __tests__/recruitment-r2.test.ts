/**
 * Recruitment Hub — Release 2 (candidate applications + secure documents).
 *
 * Covers: reference generation, status-token security, candidate dedupe,
 * duplicate applications, transactional persistence, STRICT
 * commit-before-email ordering, consent recording, candidate-safe status
 * mapping, CV validation, private storage + authorized signed downloads,
 * and public-route access control.
 */

import fs from 'fs'
import path from 'path'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const callLog: string[] = []
const candidates = new Map<string, { id: string; email: string }>()
const applications = new Map<string, Record<string, unknown>>()
let appSeq = 0

const db = {
  candidate: {
    upsert: jest.fn(async ({ where, create }: { where: { email: string }; create: Record<string, unknown> }) => {
      const existing = candidates.get(where.email)
      if (existing) return existing
      const row = { id: `cand_${candidates.size + 1}`, email: where.email, ...create }
      candidates.set(where.email, row)
      return row
    }),
  },
  jobApplication: {
    findUnique: jest.fn(async ({ where }: { where: { candidateId_jobId?: { candidateId: string; jobId: string }; reference?: string } }) => {
      if (where.reference) {
        return [...applications.values()].find(a => a.reference === where.reference) ?? null
      }
      const k = where.candidateId_jobId
      return [...applications.values()].find(a => a.candidateId === k?.candidateId && a.jobId === k?.jobId) ?? null
    }),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      callLog.push('db:createApplication')
      const row = { id: `app_${++appSeq}`, ...data }
      applications.set(row.id as string, row)
      return { id: row.id }
    }),
  },
  candidateDocument: { findUnique: jest.fn() },
  jobOpening:  { findUnique: jest.fn(), findFirst: jest.fn() },
  emailThread: { create: jest.fn(async () => { callLog.push('db:emailHubThread'); return { id: 't1' } }) },
  activityLog: { create: jest.fn(async (x: unknown) => x) },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: db, prisma: db }))

const sendMock = jest.fn(async () => { callLog.push('resend:send'); return { error: null } })
jest.mock('@/lib/resend', () => ({ getResend: () => ({ emails: { send: sendMock } }) }))

const uploadMock = jest.fn(async () => ({ error: null }))
const signMock   = jest.fn(async () => ({ data: { signedUrl: 'https://signed.example/60s' }, error: null }))
jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({ upload: uploadMock, createSignedUrl: signMock }),
      createBucket: jest.fn(async () => ({})),
    },
  }),
}))

let session: { email: string; id: string; name: string; role: string } | null =
  { email: 'admin@walztravels.com', id: 's1', name: 'Admin', role: 'super_admin' }
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn(async () => session) }))

import {
  generateReference, hashToken, newStatusToken, candidateSafeStatus,
  uploadCandidateDocument, submitApplication, safeFilename,
  PRIVACY_POLICY_VERSION, AI_DISCLOSURE_VERSION,
} from '@/lib/recruitment/applications'
import { GET as downloadDoc } from '@/app/api/admin/recruitment/documents/[id]/route'
import type { NextRequest } from 'next/server'

const SUBMISSION = {
  jobId: 'job_1', jobTitle: 'Travel Consultant', hiringManager: 'hm@walztravels.com',
  firstName: 'Ada', lastName: 'Obi', email: 'Ada.Obi@Example.com',
  answers: [{ questionId: 'q1', question: 'Why Walz?', answer: 'Great team' }],
  cv: { storagePath: 'applications/REF/cv.pdf', filename: 'cv.pdf', contentType: 'application/pdf', size: 1234 },
}

beforeEach(() => {
  jest.clearAllMocks()
  callLog.length = 0
  candidates.clear()
  applications.clear()
  appSeq = 0
  session = { email: 'admin@walztravels.com', id: 's1', name: 'Admin', role: 'super_admin' }
})

// ── References & tokens ───────────────────────────────────────────────────────

describe('references and status tokens', () => {
  it('references follow WALZ-CAREERS-YYYY-XXXXXX and avoid ambiguous chars', () => {
    for (let i = 0; i < 20; i++) {
      const ref = generateReference(2026)
      expect(ref).toMatch(/^WALZ-CAREERS-2026-[A-HJ-NP-Z2-9]{6}$/)
      expect(ref.split('-')[3]).not.toMatch(/[01IO]/)   // suffix: no ambiguous chars, never sequential
    }
  })

  it('status tokens are random, hashed at rest, and time-limited', () => {
    const a = newStatusToken()
    const b = newStatusToken()
    expect(a.token).not.toBe(b.token)
    expect(a.hash).toBe(hashToken(a.token))
    expect(a.hash).not.toContain(a.token)
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now() + 80 * 86_400_000)
  })

  it('candidate-safe status never exposes internal stages', () => {
    expect(candidateSafeStatus('new', 'active')).toBe('Application received')
    expect(candidateSafeStatus('ai_review', 'active')).toBe('Under review')
    expect(candidateSafeStatus('human_interview', 'active')).toBe('Interview stage')
    expect(candidateSafeStatus('offer', 'active')).toBe('Final review')
    expect(candidateSafeStatus('rejected', 'active')).toBe('Closed')
    expect(candidateSafeStatus('recruiter_review', 'rejected')).toBe('Closed')
    // no raw stage key ever leaks
    for (const key of ['ai_review', 'talent_pool', 'reference_check']) {
      expect(candidateSafeStatus(key, 'active')).not.toContain('_')
    }
  })
})

// ── Documents ─────────────────────────────────────────────────────────────────

describe('CV upload security', () => {
  it('rejects disallowed MIME types and oversized files', async () => {
    const bad = await uploadCandidateDocument({
      reference: 'R', file: { name: 'x.exe', type: 'application/x-msdownload', buffer: Buffer.from('x') },
    })
    expect(bad.ok).toBe(false)
    const big = await uploadCandidateDocument({
      reference: 'R', file: { name: 'x.pdf', type: 'application/pdf', buffer: Buffer.alloc(9 * 1024 * 1024) },
    })
    expect(big.ok).toBe(false)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('sanitizes malicious filenames', () => {
    expect(safeFilename('../../etc/passwd')).not.toContain('/')
    expect(safeFilename('cv<script>.pdf')).not.toContain('<')
  })

  it('accepts a valid PDF into the private bucket', async () => {
    const ok = await uploadCandidateDocument({
      reference: 'WALZ-CAREERS-2026-ABC234',
      file: { name: 'My CV.pdf', type: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.storagePath).toMatch(/^applications\/WALZ-CAREERS-2026-ABC234\//)
  })

  it('document download requires an admin session and audits the access', async () => {
    db.candidateDocument.findUnique.mockResolvedValue({ storagePath: 'applications/R/cv.pdf', filename: 'cv.pdf', candidateId: 'cand_1' } as never)
    const res = await downloadDoc({} as NextRequest, { params: { id: 'doc1' } })
    expect(res.status).toBe(307)   // redirect to 60s signed URL
    expect(signMock).toHaveBeenCalledWith('applications/R/cv.pdf', 60)
    expect(db.activityLog.create).toHaveBeenCalled()

    session = null
    const denied = await downloadDoc({} as NextRequest, { params: { id: 'doc1' } })
    expect(denied.status).toBe(401)
  })
})

// ── Submission engine ─────────────────────────────────────────────────────────

describe('application submission', () => {
  it('persists candidate + application + answers + documents + stage history transactionally, then emails', async () => {
    const r = await submitApplication(SUBMISSION)
    expect(r.ok).toBe(true)
    expect(r.reference).toMatch(/^WALZ-CAREERS-/)
    const created = db.jobApplication.create.mock.calls[0][0] as { data: Record<string, unknown> }
    // Nested creates = one atomic transaction
    expect(created.data.answers).toBeDefined()
    expect(created.data.documents).toBeDefined()
    expect((created.data.stageHistory as { create: Array<{ toKey: string }> }).create[0].toKey).toBe('new')
    // Consent recorded with versions + timestamp
    expect(created.data.consentPrivacyVersion).toBe(PRIVACY_POLICY_VERSION)
    expect(created.data.consentAiVersion).toBe(AI_DISCLOSURE_VERSION)
    expect(created.data.consentAt).toBeInstanceOf(Date)
    // Token stored hashed only
    expect(created.data.statusTokenHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('STRICT ordering: persistence commits before any email or Email Hub write', async () => {
    await submitApplication(SUBMISSION)
    expect(callLog[0]).toBe('db:createApplication')
    expect(callLog.slice(1)).toEqual(['resend:send', 'resend:send', 'db:emailHubThread'])
  })

  it('candidate dedupe: same email (any casing) resolves to one candidate', async () => {
    await submitApplication(SUBMISSION)
    await submitApplication({ ...SUBMISSION, jobId: 'job_2', email: 'ADA.OBI@example.com' })
    expect(candidates.size).toBe(1)
    expect(applications.size).toBe(2)   // two jobs, one person
  })

  it('duplicate application for the same job is detected, not duplicated', async () => {
    const first  = await submitApplication(SUBMISSION)
    sendMock.mockClear()
    const second = await submitApplication(SUBMISSION)
    expect(second.ok).toBe(true)
    expect(second.duplicate).toBe(true)
    expect(second.reference).toBe(first.reference)
    expect(applications.size).toBe(1)
    expect(sendMock).not.toHaveBeenCalled()   // no duplicate emails either
  })

  it('a persistence failure sends NO emails and returns a retryable error', async () => {
    db.jobApplication.create.mockRejectedValueOnce(new Error('db down'))
    const r = await submitApplication(SUBMISSION)
    expect(r.ok).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
    expect(db.emailThread.create).not.toHaveBeenCalled()
  })

  it('confirmation goes to the candidate, notification to the hiring manager, Email Hub gets a careers thread', async () => {
    await submitApplication(SUBMISSION)
    const [confirm, notify] = sendMock.mock.calls.map(c => c[0] as { to: string; subject: string })
    expect(confirm.to).toBe('ada.obi@example.com')
    expect(confirm.subject).toContain('Application received')
    expect(notify.to).toBe('hm@walztravels.com')
    const thread = db.emailThread.create.mock.calls[0][0] as { data: { category: string; refType: string } }
    expect(thread.data.category).toBe('careers')
    expect(thread.data.refType).toBe('application')
  })

  it('email failures never roll back the stored application', async () => {
    sendMock.mockRejectedValue(new Error('resend down'))
    const r = await submitApplication(SUBMISSION)
    expect(r.ok).toBe(true)
    expect(applications.size).toBe(1)
    sendMock.mockResolvedValue({ error: null })
  })
})

// ── Route + page invariants ───────────────────────────────────────────────────

describe('security invariants', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

  it('public apply route is rate limited, validates consent, and only accepts open jobs', () => {
    const src = read('app/api/careers/apply/route.ts')
    expect(src).toContain('rateLimit')
    expect(src).toContain("fd.get('consentPrivacy') !== 'true'")
    expect(src).toContain('publicJobWhere()')
  })

  it('status page validates the hashed token + expiry and shows only safe statuses', () => {
    const src = read('app/careers/application/[reference]/status/page.tsx')
    expect(src).toContain('hashToken(token)')
    expect(src).toContain('statusTokenExpiresAt')
    expect(src).toContain('candidateSafeStatus')
    expect(src).not.toMatch(/stageKey\s*}/)   // raw stage never rendered
  })

  it('CV storage bucket is private and paths are never exposed publicly', () => {
    const apps = read('lib/recruitment/applications.ts')
    expect(apps).toContain("createBucket(RECRUITMENT_BUCKET, { public: false })")
    const dl = read('app/api/admin/recruitment/documents/[id]/route.ts')
    expect(dl).toContain('createSignedUrl')
    expect(dl).toContain('hasRecruitmentPermission')
  })

  it('the job detail page now routes Apply to the real form', () => {
    const src = read('app/careers/[slug]/page.tsx')
    expect(src).toContain('href={`/careers/${job.slug}/apply`}')
  })
})
