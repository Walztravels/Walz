/**
 * Secure Application Lookup — canonical engine + channel wiring.
 *
 * Covers the spec's test lists for both the staff flow and the shared
 * staff+Jade engine: masked lookup, OTP lifecycle (secure generation,
 * expiry, single-use, attempts, lockout), fallback questions that never
 * expose answers, session/channel binding, Jade DTO exclusions, voice
 * digit/date normalization, audit hygiene (no OTP plaintext), and RBAC
 * source invariants.
 */

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'

// ── Prisma mock (in-memory verification store) ────────────────────────────────

type VRow = {
  id: string; applicationId: string; channel: string; staffEmail: string | null
  conversationId: string | null; method: string | null; status: string
  otpHash: string | null; otpExpiresAt: Date | null; attemptCount: number
  lockedUntil: Date | null; questionId: string | null
  verifiedAt: Date | null; verifiedUntil: Date | null
}

const verifications = new Map<string, VRow>()
let nextId = 1

const APPS: Record<string, Record<string, unknown>> = {}
const auditRows: Array<{ action: string; detail: string }> = []
const sentEmails: Array<{ to: string; html: string }> = []

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    visaApplication: {
      findUnique: jest.fn(async ({ where }: { where: { referenceNumber?: string; id?: string } }) => {
        if (where.referenceNumber) {
          return Object.values(APPS).find(a => a.referenceNumber === where.referenceNumber) ?? null
        }
        return APPS[where.id ?? ''] ?? null
      }),
    },
    applicationVerification: {
      create: jest.fn(async ({ data }: { data: Partial<VRow> }) => {
        const id = `ver_${nextId++}`
        const row: VRow = {
          id, applicationId: data.applicationId!, channel: data.channel!,
          staffEmail: data.staffEmail ?? null, conversationId: data.conversationId ?? null,
          method: null, status: 'pending', otpHash: null, otpExpiresAt: null,
          attemptCount: 0, lockedUntil: null, questionId: null, verifiedAt: null, verifiedUntil: null,
        }
        verifications.set(id, row)
        return { id }
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => verifications.get(where.id) ?? null),
      findFirst:  jest.fn(async () => null),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<VRow> }) => {
        const row = verifications.get(where.id)!
        Object.assign(row, data)
        return row
      }),
    },
    activityLog: {
      create: jest.fn(async ({ data }: { data: { action: string; detail: string } }) => {
        auditRows.push(data)
        return data
      }),
    },
  },
}))

jest.mock('@/lib/resend', () => ({
  getResend: () => ({
    emails: {
      send: jest.fn(async (msg: { to: string; html: string }) => {
        sentEmails.push(msg)
        return { error: null }
      }),
    },
  }),
}))

import {
  lookupApplicationByWalzRef, createApplicationVerification,
  sendApplicationOtp, verifyApplicationOtp,
  getFallbackQuestion, verifyApplicationFallback,
  assertVerifiedAccess, getJadeVerifiedApplicationView,
  MAX_ATTEMPTS,
} from '@/lib/secure-lookup/service'
import {
  maskName, maskEmail, maskPhone, safeStatusLabel,
  normalizeSpokenDigits, normalizeDateAnswer, normalizePassportSuffix, normalizeWalzRef,
} from '@/lib/secure-lookup/masking'

function extractOtpFromEmail(): string {
  const html = sentEmails[sentEmails.length - 1].html
  const m = html.match(/>(\d{6})</)
  return m![1]
}

beforeEach(() => {
  verifications.clear()
  auditRows.length = 0
  sentEmails.length = 0
  APPS['app_1'] = {
    id: 'app_1', referenceNumber: 'WALZ-482913', destinationIso2: 'gb', visaType: 'visitor',
    status: 'documents_review', statusMessage: null, isDraft: false,
    firstName: 'Olawale', lastName: 'Smith', email: 'olawale@gmail.com', phone: '+12317902336',
    dateOfBirth: new Date('1990-01-05T00:00:00Z'), passportNumber: 'A01234AB12',
    appointmentDate: null, createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-09-01'),
  }
})

// ── Masking ───────────────────────────────────────────────────────────────────

describe('masking', () => {
  it('masks name, email, phone in the documented format', () => {
    expect(maskName('Olawale Smith')).toBe('O****** S****')
    expect(maskEmail('olawale@gmail.com')).toBe('o******@gmail.com')
    expect(maskPhone('+12317902336')).toContain('2336')
    expect(maskPhone('+12317902336')).toContain('***')
    expect(maskPhone('+12317902336')).not.toContain('790')
  })

  it('safe status: decision contents are never exposed', () => {
    expect(safeStatusLabel('approved')).toBe('Decision Received')
    expect(safeStatusLabel('rejected')).toBe('Decision Received')
    expect(safeStatusLabel('documents_review')).toBe('Documents Under Review')
    expect(safeStatusLabel('draft')).toBe('Application Received')
  })
})

// ── Lookup ────────────────────────────────────────────────────────────────────

describe('lookup', () => {
  it('valid Walz Ref finds the record with masked information only', async () => {
    const r = await lookupApplicationByWalzRef('WALZ-482913', { channel: 'STAFF_SUPPORT', staffEmail: 's@walztravels.com' })
    expect(r.found).toBe(true)
    if (r.found) {
      expect(r.maskedName).toBe('O****** S****')
      expect(r.status).toBe('Documents Under Review')
      expect(JSON.stringify(r)).not.toContain('Olawale')
      expect(JSON.stringify(r)).not.toContain('A01234')
      expect(JSON.stringify(r)).not.toContain('1990')
    }
  })

  it('invalid ref reveals nothing — no partial matches', async () => {
    const r = await lookupApplicationByWalzRef('WALZ-482914', { channel: 'STAFF_SUPPORT' })
    expect(r.found).toBe(false)
    expect(Object.keys(r)).toEqual(['found'])
  })

  it('tolerates ref formatting variants (exact record only)', () => {
    expect(normalizeWalzRef('walz-482913')).toBe('WALZ-482913')
    expect(normalizeWalzRef(' 482913 ')).toBe('WALZ-482913')
    expect(normalizeWalzRef('WALZ482913')).toBe('WALZ-482913')
  })

  it('lookup + found are audited', async () => {
    await lookupApplicationByWalzRef('WALZ-482913', { channel: 'STAFF_SUPPORT', staffEmail: 's@walztravels.com' })
    const actions = auditRows.map(a => a.action)
    expect(actions).toContain('APPLICATION_LOOKUP')
    expect(actions).toContain('APPLICATION_FOUND')
  })
})

// ── OTP lifecycle ─────────────────────────────────────────────────────────────

async function startVerification(channel: 'STAFF_SUPPORT' | 'WHATSAPP' = 'STAFF_SUPPORT', opts: { staffEmail?: string; conversationId?: string } = {}) {
  const { verificationId } = await createApplicationVerification({
    applicationId: 'app_1', channel,
    staffEmail: opts.staffEmail ?? (channel === 'STAFF_SUPPORT' ? 's@walztravels.com' : null),
    conversationId: opts.conversationId ?? (channel === 'WHATSAPP' ? '999' : null),
  })
  return verificationId
}

describe('OTP', () => {
  it('generates a 6-digit code, stores only the hash, emails the client', async () => {
    const id = await startVerification()
    const r = await sendApplicationOtp({ verificationId: id, method: 'EMAIL' })
    expect(r.ok).toBe(true)
    expect(r.maskedDestination).toBe('o******@gmail.com')
    const code = extractOtpFromEmail()
    expect(code).toMatch(/^\d{6}$/)
    const row = verifications.get(id)!
    expect(row.otpHash).toBe(createHash('sha256').update(`${code}:${id}`).digest('hex'))
    expect(row.otpHash).not.toContain(code)
  })

  it('correct OTP verifies and consumes the hash (single-use)', async () => {
    const id = await startVerification()
    await sendApplicationOtp({ verificationId: id, method: 'EMAIL' })
    const code = extractOtpFromEmail()
    const r1 = await verifyApplicationOtp({ verificationId: id, code })
    expect(r1.verified).toBe(true)
    // replaying the same code fails — hash consumed
    const r2 = await verifyApplicationOtp({ verificationId: id, code })
    expect(r2.verified).toBe(false)
    expect(r2.error).toBe('NO_ACTIVE_OTP')
  })

  it('expired OTP is rejected', async () => {
    const id = await startVerification()
    await sendApplicationOtp({ verificationId: id, method: 'EMAIL' })
    verifications.get(id)!.otpExpiresAt = new Date(Date.now() - 1000)
    const r = await verifyApplicationOtp({ verificationId: id, code: extractOtpFromEmail() })
    expect(r.verified).toBe(false)
    expect(r.error).toBe('OTP_EXPIRED')
  })

  it('wrong OTP rejected; 5 failures lock verification for 30 minutes', async () => {
    const id = await startVerification()
    await sendApplicationOtp({ verificationId: id, method: 'EMAIL' })
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const r = await verifyApplicationOtp({ verificationId: id, code: '000000' })
      expect(r.verified).toBe(false)
      if (i === MAX_ATTEMPTS - 1) expect(r.locked).toBe(true)
    }
    const row = verifications.get(id)!
    expect(row.status).toBe('locked')
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000)
    // correct code no longer works while locked
    const after = await verifyApplicationOtp({ verificationId: id, code: extractOtpFromEmail() })
    expect(after.verified).toBe(false)
    expect(after.locked).toBe(true)
    expect(auditRows.some(a => a.action === 'VERIFICATION_LOCKED')).toBe(true)
  })

  it('phone OTP declines deterministically when no SMS provider exists', async () => {
    const id = await startVerification()
    const r = await sendApplicationOtp({ verificationId: id, method: 'PHONE' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('PHONE_DELIVERY_UNAVAILABLE')
  })

  it('spoken digits verify: "four eight two nine nine one"', async () => {
    const id = await startVerification('WHATSAPP')
    await sendApplicationOtp({ verificationId: id, method: 'EMAIL' })
    const code = extractOtpFromEmail()
    const spoken = code.split('').map(d => ['zero','one','two','three','four','five','six','seven','eight','nine'][Number(d)]).join(' ')
    const r = await verifyApplicationOtp({ verificationId: id, code: spoken })
    expect(r.verified).toBe(true)
  })

  it('audit log never contains the OTP plaintext', async () => {
    const id = await startVerification()
    await sendApplicationOtp({ verificationId: id, method: 'EMAIL' })
    const code = extractOtpFromEmail()
    await verifyApplicationOtp({ verificationId: id, code })
    for (const row of auditRows) {
      expect(row.detail).not.toContain(code)
    }
  })
})

// ── Fallback verification ─────────────────────────────────────────────────────

describe('fallback verification', () => {
  it('returns only questionId + questionText — never the stored answer', async () => {
    const id = await startVerification()
    const q = await getFallbackQuestion(id)
    expect('questionText' in q).toBe(true)
    if ('questionText' in q) {
      expect(JSON.stringify(q)).not.toContain('1990')
      expect(JSON.stringify(q)).not.toContain('AB12')
      expect(q.questionText).toContain('date of birth')
    }
  })

  it('correct DOB answer verifies — typed and voice forms', async () => {
    const id = await startVerification()
    await getFallbackQuestion(id)
    const r = await verifyApplicationFallback({ verificationId: id, answer: '05/01/1990' })
    expect(r.verified).toBe(true)

    const id2 = await startVerification()
    await getFallbackQuestion(id2)
    const r2 = await verifyApplicationFallback({ verificationId: id2, answer: 'January 5th 1990' })
    expect(r2.verified).toBe(true)
  })

  it('wrong fallback answer fails and counts toward lockout', async () => {
    const id = await startVerification()
    await getFallbackQuestion(id)
    const r = await verifyApplicationFallback({ verificationId: id, answer: '02/02/1985' })
    expect(r.verified).toBe(false)
    expect(verifications.get(id)!.attemptCount).toBe(1)
  })

  it('voice passport suffix normalization: "A B one two" → AB12', () => {
    expect(normalizePassportSuffix('A B one two')).toBe('AB12')
    expect(normalizePassportSuffix('ab 12')).toBe('AB12')
  })

  it('voice digits + date normalization are deterministic', () => {
    expect(normalizeSpokenDigits('four eight two nine nine one')).toBe('482991')
    expect(normalizeSpokenDigits('482 991')).toBe('482991')
    expect(normalizeDateAnswer('5 January 1990')).toBe('1990-01-05')
    expect(normalizeDateAnswer('nonsense words')).toBeNull()
  })
})

// ── Session binding + channel isolation ───────────────────────────────────────

describe('verified session binding', () => {
  async function verifiedStaffSession(staffEmail = 's@walztravels.com') {
    const id = await startVerification('STAFF_SUPPORT', { staffEmail })
    await sendApplicationOtp({ verificationId: id, method: 'EMAIL' })
    await verifyApplicationOtp({ verificationId: id, code: extractOtpFromEmail() })
    return id
  }

  it('full record inaccessible before verification', async () => {
    const id = await startVerification()
    const access = await assertVerifiedAccess({ verificationId: id, staffEmail: 's@walztravels.com' })
    expect(access.ok).toBe(false)
  })

  it('successful OTP unlocks access for the verifying staff member', async () => {
    const id = await verifiedStaffSession()
    const access = await assertVerifiedAccess({ verificationId: id, staffEmail: 's@walztravels.com' })
    expect(access.ok).toBe(true)
  })

  it('a different staff member cannot reuse the verification', async () => {
    const id = await verifiedStaffSession()
    const access = await assertVerifiedAccess({ verificationId: id, staffEmail: 'other@walztravels.com' })
    expect(access.ok).toBe(false)
    if (!access.ok) expect(access.error).toBe('NOT_YOUR_VERIFICATION')
  })

  it('verification expires', async () => {
    const id = await verifiedStaffSession()
    verifications.get(id)!.verifiedUntil = new Date(Date.now() - 1000)
    const access = await assertVerifiedAccess({ verificationId: id, staffEmail: 's@walztravels.com' })
    expect(access.ok).toBe(false)
    if (!access.ok) expect(access.error).toBe('VERIFICATION_EXPIRED')
  })

  it('chat verification does not unlock a different conversation/channel', async () => {
    const id = await startVerification('WHATSAPP', { conversationId: '999' })
    await sendApplicationOtp({ verificationId: id, method: 'EMAIL' })
    await verifyApplicationOtp({ verificationId: id, code: extractOtpFromEmail() })
    // same conversation → ok
    expect((await assertVerifiedAccess({ verificationId: id, conversationId: '999' })).ok).toBe(true)
    // different conversation (e.g. a new call) → denied
    expect((await assertVerifiedAccess({ verificationId: id, conversationId: 'call_1' })).ok).toBe(false)
    // staff channel cannot piggyback on a chat verification
    expect((await assertVerifiedAccess({ verificationId: id, staffEmail: 's@walztravels.com' })).ok).toBe(false)
  })
})

// ── Jade DTO ──────────────────────────────────────────────────────────────────

describe('Jade verified DTO', () => {
  it('excludes passport, DOB, bank data, notes, raw documents', async () => {
    const id = await startVerification('WHATSAPP', { conversationId: '999' })
    await sendApplicationOtp({ verificationId: id, method: 'EMAIL' })
    await verifyApplicationOtp({ verificationId: id, code: extractOtpFromEmail() })
    const view = await getJadeVerifiedApplicationView({ verificationId: id, conversationId: '999' })
    expect('error' in view).toBe(false)
    const json = JSON.stringify(view)
    expect(json).not.toContain('A01234')       // passport
    expect(json).not.toContain('1990-01-05')   // DOB
    expect(json).not.toContain('olawale@gmail.com')
    expect(json).not.toContain('passportNumber')
    expect(json).toContain('Documents Under Review')
  })

  it('Jade cannot retrieve the DTO before verification', async () => {
    const id = await startVerification('WHATSAPP', { conversationId: '999' })
    const view = await getJadeVerifiedApplicationView({ verificationId: id, conversationId: '999' })
    expect('error' in view).toBe(true)
  })
})

// ── Source invariants (wiring, RBAC, LLM authority, documents) ────────────────

describe('wiring + policy invariants', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

  it('staff routes are authenticated, RBAC-checked, rate limited', () => {
    const lookup = read('app/api/admin/applications/lookup/route.ts')
    expect(lookup).toContain('getAdminSession')
    expect(lookup).toContain('getStaffPermissionsByEmail')
    expect(lookup).toContain('rateLimit')
    const view = read('app/api/admin/applications/secure-view/route.ts')
    expect(view).toContain('getStaffPermissionsByEmail')
    expect(view).toContain('assertVerifiedAccess')
    expect(view).toContain('payments_view')       // payments gated by role
  })

  it('secure-view returns the admin page link, never raw storage paths or documents', () => {
    const view = read('app/api/admin/applications/secure-view/route.ts')
    expect(view).toContain('adminUrl')
    expect(view).not.toMatch(/storagePath|signedUrl|createSignedUrl/)
  })

  it('Jade tool exposes only structured states — no raw application objects', () => {
    const tools = read('lib/jade/tools.ts')
    expect(tools).toContain('secure_application_lookup')
    expect(tools).toContain('VERIFICATION_REQUIRED')
    expect(tools).toContain('getJadeVerifiedApplicationView')
    // the LLM is told it cannot decide verification
    expect(tools).toMatch(/NEVER decide whether a code or answer is correct/i)
  })

  it('inbox drawer exists and shows the verified badge with expiry', () => {
    const drawer = read('components/admin/ApplicationLookupDrawer.tsx')
    expect(drawer).toContain('Client Verified')
    expect(drawer).toContain('verifiedUntil')
    expect(drawer).toContain('Verification failed. Do not disclose application details.')
    const inbox = read('app/admin/inbox/page.tsx')
    expect(inbox).toContain('ApplicationLookupDrawer')
  })

  it('handoff preserves the safe verified indicator, never answers/OTPs', () => {
    const handoff = read('lib/jade/human-handoff.ts')
    expect(handoff).toContain('CLIENT_IDENTITY_VERIFIED')
    expect(handoff).not.toContain('otpHash')
  })

  it('no weak generic security questions exist', () => {
    const service = read('lib/secure-lookup/service.ts')
    expect(service).not.toMatch(/maiden|pet name|favourite colour|first school/i)
  })
})
