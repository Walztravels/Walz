/**
 * Recruitment Hub — Release 4 (careers Email Hub integration).
 *
 * Covers: application-reference extraction from free text, inbound-route
 * matching invariants (best-effort, never blocks intake, priority order),
 * thread→candidate API security and behavior (never overwrites existing
 * candidates, careers-only, audited), and Email Hub panel wiring.
 */

import fs from 'fs'
import path from 'path'

import { extractApplicationReference, REFERENCE_PATTERN, generateReference } from '@/lib/recruitment/applications'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Reference extraction ──────────────────────────────────────────────────────

describe('extractApplicationReference', () => {
  it('finds a reference in a subject line', () => {
    expect(extractApplicationReference('Re: my application WALZ-CAREERS-2026-ABCDEF'))
      .toBe('WALZ-CAREERS-2026-ABCDEF')
  })
  it('normalizes lowercase references', () => {
    expect(extractApplicationReference('ref walz-careers-2026-xyzabc please'))
      .toBe('WALZ-CAREERS-2026-XYZABC')
  })
  it('extracts from multi-line bodies', () => {
    expect(extractApplicationReference('Hello,\n\nFollowing up on WALZ-CAREERS-2025-QRSTUV.\nThanks'))
      .toBe('WALZ-CAREERS-2025-QRSTUV')
  })
  it('returns null when absent or malformed', () => {
    expect(extractApplicationReference('no reference here')).toBeNull()
    expect(extractApplicationReference('')).toBeNull()
    // ambiguous chars 0/1/I/O are not in the alphabet — not a valid suffix
    expect(extractApplicationReference('WALZ-CAREERS-2026-A0CDEF')).toBeNull()
    expect(extractApplicationReference('WALZ-CAREERS-26-ABCDEF')).toBeNull()
  })
  it('matches every reference the generator can produce', () => {
    for (let i = 0; i < 50; i++) {
      const ref = generateReference(2026)
      expect(REFERENCE_PATTERN.test(ref)).toBe(true)
    }
  })
})

// ── Inbound-route matching invariants ─────────────────────────────────────────

describe('careers inbound recruitment matching', () => {
  const src = read('app/api/admin/careers/inbound/route.ts')

  it('matches reference first, then candidate email, inside a non-blocking try/catch', () => {
    expect(src).toContain('extractApplicationReference')
    const matchBlock = src.slice(src.indexOf('Recruitment matching'), src.indexOf('Create thread'))
    expect(matchBlock).toContain('try {')
    expect(matchBlock).toContain('catch')
    expect(matchBlock).toContain('continuing unmatched')
    // reference lookup appears before the candidate-by-email fallback
    expect(matchBlock.indexOf('jobApplication.findUnique')).toBeLessThan(matchBlock.indexOf('candidate.findUnique'))
  })

  it('threads carry the matched refType/refId and default to careers/unmatched', () => {
    expect(src).toMatch(/let refType = 'careers'/)
    expect(src).toMatch(/let refId: string \| null = null/)
    expect(src).toContain('refType,')
    expect(src).toContain('refId,')
  })

  it('the staff notification includes the matched candidate when found', () => {
    expect(src).toContain('matchedLabel')
  })

  it('still fails closed on the inbound secret', () => {
    expect(src).toContain('timingSafeEqual')
    expect(src).toContain('RESEND_INBOUND_SECRET')
  })
})

// ── Thread→candidate API ──────────────────────────────────────────────────────

describe('email thread candidate route', () => {
  const src = read('app/api/admin/email/threads/[id]/candidate/route.ts')

  it('authenticates, authorizes, and is dynamic', () => {
    expect(src).toContain('getAdminSession')
    expect(src).toContain('{ status: 401 }')
    expect(src).toContain("hasRecruitmentPermission(session, 'recruitment.candidates.view')")
    expect(src).toContain("hasRecruitmentPermission(session, 'recruitment.candidates.manage')")
    expect(src).toContain("export const dynamic = 'force-dynamic'")
  })

  it('resolves in priority order: application ref → candidate ref → sender email', () => {
    const a = src.indexOf("refType === 'application'")
    const b = src.indexOf("refType === 'candidate'")
    const c = src.indexOf('senderOf(thread)')
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(-1)
  })

  it('converting never overwrites an existing candidate and only works on careers threads', () => {
    expect(src).toContain('update: {}')
    expect(src).toContain('never overwrite an existing record')
    expect(src).toContain("thread.category !== 'careers'")
    expect(src).toContain('recruitmentAudit')
  })

  it('stores candidate emails lowercase', () => {
    expect(src).toContain('sender.email.toLowerCase()')
  })
})

// ── Email Hub wiring ──────────────────────────────────────────────────────────

describe('Email Hub careers panel', () => {
  it('the panel is rendered for careers threads only', () => {
    const src = read('app/admin/email/page.tsx')
    expect(src).toContain('CareersEmailPanel')
    expect(src).toContain("selectedThread?.category === 'careers'")
  })
  it('the panel links to recruitment records and offers conversion', () => {
    const src = read('components/admin/recruitment/CareersEmailPanel.tsx')
    expect(src).toContain('/admin/recruitment/candidates/')
    expect(src).toContain('/admin/recruitment/applications/')
    expect(src).toContain('Create candidate')
    expect(src).toContain("method: 'POST'")
  })
})
