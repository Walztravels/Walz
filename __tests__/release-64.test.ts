// __tests__/release-64.test.ts — Release 6.4: Notifications & Traveller Profiles

import {
  getPassportExpiryStatus,
  getPassportExpiryStatusLabel,
  toTravellerDTO,
  primaryTravellerPassportMeta,
  type PassportExpiryStatus,
} from '@/lib/portal/traveller-dto'
import {
  getTravellerProfileCompleteness,
  getPrimaryTravellerCompleteness,
} from '@/lib/portal/traveller-completeness'
import {
  buildJadeTravellerContext,
  buildPrimaryJadeContext,
} from '@/lib/portal/jade-context'

// ─── Passport expiry status ───────────────────────────────────────────────────

describe('getPassportExpiryStatus', () => {
  it('returns NOT_PROVIDED for null', () => {
    expect(getPassportExpiryStatus(null)).toBe('NOT_PROVIDED')
  })

  it('returns EXPIRED for past dates', () => {
    expect(getPassportExpiryStatus('2020-01-01')).toBe('EXPIRED')
    expect(getPassportExpiryStatus(new Date('2023-06-01'))).toBe('EXPIRED')
  })

  it('returns EXPIRES_SOON for dates within 6 months', () => {
    const soon = new Date()
    soon.setMonth(soon.getMonth() + 3) // 3 months from now
    expect(getPassportExpiryStatus(soon)).toBe('EXPIRES_SOON')
  })

  it('returns VALID for dates more than 6 months away', () => {
    const valid = new Date()
    valid.setFullYear(valid.getFullYear() + 2)
    expect(getPassportExpiryStatus(valid)).toBe('VALID')
  })

  it('handles string ISO dates', () => {
    const valid = new Date()
    valid.setFullYear(valid.getFullYear() + 3)
    expect(getPassportExpiryStatus(valid.toISOString().split('T')[0])).toBe('VALID')
  })
})

describe('getPassportExpiryStatusLabel', () => {
  const cases: Array<[PassportExpiryStatus, string]> = [
    ['VALID',        'Valid'],
    ['EXPIRES_SOON', 'Expires soon'],
    ['EXPIRED',      'Expired'],
    ['NOT_PROVIDED', 'Not provided'],
  ]
  it.each(cases)('status %s → label %s', (status, expected) => {
    expect(getPassportExpiryStatusLabel(status)).toBe(expected)
  })
})

// ─── Traveller DTO ────────────────────────────────────────────────────────────

function makeRawTraveller(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 't_001',
    relationship: 'Spouse/Partner',
    firstName: 'Sarah',
    middleName: null,
    lastName: 'Johnson',
    dateOfBirth: new Date('1985-03-15'),
    gender: 'Female',
    nationality: 'Nigerian',
    phone: '+447700900000',
    email: null,
    passportMeta: null,
    isDeleted: false,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  }
}

describe('toTravellerDTO', () => {
  it('maps basic fields', () => {
    const dto = toTravellerDTO(makeRawTraveller())
    expect(dto.id).toBe('t_001')
    expect(dto.firstName).toBe('Sarah')
    expect(dto.lastName).toBe('Johnson')
    expect(dto.displayName).toBe('Sarah Johnson')
    expect(dto.initials).toBe('SJ')
    expect(dto.relationship).toBe('Spouse/Partner')
    expect(dto.nationality).toBe('Nigerian')
  })

  it('formats dateOfBirth as YYYY-MM-DD', () => {
    const dto = toTravellerDTO(makeRawTraveller())
    expect(dto.dateOfBirth).toBe('1985-03-15')
  })

  it('createdAt is ISO string', () => {
    const dto = toTravellerDTO(makeRawTraveller())
    expect(typeof dto.createdAt).toBe('string')
    expect(() => new Date(dto.createdAt)).not.toThrow()
  })

  it('passportMeta is null when not provided', () => {
    const dto = toTravellerDTO(makeRawTraveller({ passportMeta: null }))
    expect(dto.passportMeta).toBeNull()
  })

  it('passportMeta shows masked number and expiry status', () => {
    const futureDate = new Date()
    futureDate.setFullYear(futureDate.getFullYear() + 2)
    const dto = toTravellerDTO(makeRawTraveller({
      passportMeta: {
        rawNumber: 'P12345678',
        expiryDate: futureDate.toISOString().split('T')[0],
        nationality: 'NG',
        passportType: 'ordinary',
      },
    }))
    expect(dto.passportMeta).not.toBeNull()
    expect(dto.passportMeta?.maskedNumber).toContain('••••••')
    expect(dto.passportMeta?.maskedNumber).toContain('5678')
    expect(dto.passportMeta?.expiryStatus).toBe('VALID')
    expect(dto.passportMeta?.nationality).toBe('NG')
  })

  it('does NOT expose raw passport number in DTO', () => {
    const dto = toTravellerDTO(makeRawTraveller({
      passportMeta: { rawNumber: 'P12345678', expiryDate: null, nationality: 'NG', passportType: 'ordinary' },
    })) as unknown as Record<string, unknown>
    const pm = dto.passportMeta as Record<string, unknown>
    expect(pm?.rawNumber).toBeUndefined()
    // maskedNumber should not equal the raw number
    if (pm?.maskedNumber) {
      expect(pm.maskedNumber).not.toBe('P12345678')
    }
  })
})

describe('primaryTravellerPassportMeta', () => {
  it('returns null for null vault', () => {
    expect(primaryTravellerPassportMeta(null)).toBeNull()
  })

  it('masks passport number from PassportVault', () => {
    const futureDate = new Date()
    futureDate.setFullYear(futureDate.getFullYear() + 2)
    const meta = primaryTravellerPassportMeta({
      passportNumber: 'AB1234567',
      expiryDate: futureDate,
      nationality: 'Nigerian',
      passportType: 'ordinary',
    })
    expect(meta?.maskedNumber).toContain('••••••')
    expect(meta?.maskedNumber).toContain('4567')
    expect(meta?.expiryStatus).toBe('VALID')
  })

  it('handles null passportNumber', () => {
    const meta = primaryTravellerPassportMeta({
      passportNumber: null,
      expiryDate: null,
      nationality: 'NG',
      passportType: 'ordinary',
    })
    expect(meta?.maskedNumber).toBeNull()
    expect(meta?.expiryStatus).toBe('NOT_PROVIDED')
  })
})

// ─── Profile completeness ─────────────────────────────────────────────────────

describe('getTravellerProfileCompleteness', () => {
  it('returns 0% for empty traveller', () => {
    const result = getTravellerProfileCompleteness({
      firstName: '', lastName: '', dateOfBirth: null,
      nationality: null, gender: null, phone: null, email: null, passportMeta: null,
    })
    expect(result.percent).toBe(0)
    expect(result.missing.length).toBeGreaterThan(0)
  })

  it('returns 100% for fully complete traveller', () => {
    const futureDate = new Date()
    futureDate.setFullYear(futureDate.getFullYear() + 2)
    const result = getTravellerProfileCompleteness({
      firstName: 'Sarah',
      lastName: 'Johnson',
      dateOfBirth: '1985-03-15',
      nationality: 'Nigerian',
      gender: 'Female',
      phone: '+447700900000',
      email: null,
      passportMeta: { maskedNumber: '••••••5678', expiryDate: futureDate.toISOString() },
    })
    expect(result.percent).toBe(100)
    expect(result.missing).toHaveLength(0)
  })

  it('50-70% when personal complete but no passport or contact', () => {
    const result = getTravellerProfileCompleteness({
      firstName: 'Sarah',
      lastName: 'Johnson',
      dateOfBirth: '1985-03-15',
      nationality: 'Nigerian',
      gender: 'Female',
      phone: null,
      email: null,
      passportMeta: null,
    })
    expect(result.percent).toBeGreaterThanOrEqual(50)
    expect(result.percent).toBeLessThan(90)
    expect(result.missing).toContain('Passport details')
  })

  it('sections.personal=false when name missing', () => {
    const result = getTravellerProfileCompleteness({
      firstName: '', lastName: 'Johnson', dateOfBirth: null,
      nationality: null, gender: null, phone: null, email: null, passportMeta: null,
    })
    expect(result.sections.personal).toBe(false)
  })

  it('sections.contact=true when phone provided', () => {
    const result = getTravellerProfileCompleteness({
      firstName: 'Sarah', lastName: 'Johnson', dateOfBirth: null,
      nationality: null, gender: null, phone: '+447700900000', email: null, passportMeta: null,
    })
    expect(result.sections.contact).toBe(true)
  })

  it('sections.contact=true when only email provided (no phone)', () => {
    const result = getTravellerProfileCompleteness({
      firstName: 'Sarah', lastName: 'Johnson', dateOfBirth: null,
      nationality: null, gender: null, phone: null, email: 'test@example.com', passportMeta: null,
    })
    expect(result.sections.contact).toBe(true)
  })

  it('completeness does NOT imply visa eligibility — pure scoring function', () => {
    // Ensure function is deterministic and pure
    const a = getTravellerProfileCompleteness({
      firstName: 'X', lastName: 'Y', dateOfBirth: '1990-01-01',
      nationality: 'Nigerian', gender: 'Male', phone: '+1234', email: null, passportMeta: null,
    })
    const b = getTravellerProfileCompleteness({
      firstName: 'X', lastName: 'Y', dateOfBirth: '1990-01-01',
      nationality: 'Nigerian', gender: 'Male', phone: '+1234', email: null, passportMeta: null,
    })
    expect(a.percent).toBe(b.percent) // deterministic
  })
})

describe('getPrimaryTravellerCompleteness', () => {
  it('returns 0 for null vault', () => {
    const result = getPrimaryTravellerCompleteness(null, { phone: null })
    expect(result.percent).toBe(0)
    expect(result.missing.length).toBeGreaterThan(0)
  })

  it('counts passport in score when passportNumber set', () => {
    const withPassport = getPrimaryTravellerCompleteness({
      givenNames: 'Jane', surname: 'Doe', dateOfBirth: new Date('1990-01-01'),
      nationality: 'NG', sex: 'F', passportNumber: 'P1234', expiryDate: null,
      phone: '+234', homeAddress: null,
    }, { phone: null })
    const withoutPassport = getPrimaryTravellerCompleteness({
      givenNames: 'Jane', surname: 'Doe', dateOfBirth: new Date('1990-01-01'),
      nationality: 'NG', sex: 'F', passportNumber: null, expiryDate: null,
      phone: '+234', homeAddress: null,
    }, { phone: null })
    expect(withPassport.percent).toBeGreaterThan(withoutPassport.percent)
  })
})

// ─── Jade context (security) ──────────────────────────────────────────────────

describe('buildJadeTravellerContext', () => {
  it('never includes passport number', () => {
    const ctx = buildJadeTravellerContext({
      firstName: 'Sarah',
      lastName: 'Johnson',
      dateOfBirth: new Date('1985-03-15'),
      nationality: 'Nigerian',
      gender: 'Female',
      phone: '+447700900000',
      email: null,
      passportExpiryDate: null,
      passportMeta: { maskedNumber: '••••••5678' },
    }) as unknown as Record<string, unknown>

    expect(ctx.passportNumber).toBeUndefined()
    expect(ctx.passportScan).toBeUndefined()
    expect(ctx.documents).toBeUndefined()
    expect(ctx.paymentDetails).toBeUndefined()
  })

  it('includes safe fields only', () => {
    const ctx = buildJadeTravellerContext({
      firstName: 'Sarah',
      lastName: 'Johnson',
      dateOfBirth: new Date('1985-03-15'),
      nationality: 'Nigerian',
      gender: 'Female',
      phone: null,
      email: null,
      passportExpiryDate: null,
      passportMeta: null,
    })
    expect(ctx.displayName).toBe('Sarah Johnson')
    expect(ctx.nationality).toBe('Nigerian')
    expect(ctx.ageBand).toBe('adult')
    expect(typeof ctx.profileCompleteness).toBe('number')
    expect(ctx.passportStatus).toBeNull()
  })

  it('ageBand=child for DOB 5 years ago', () => {
    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - 5)
    const ctx = buildJadeTravellerContext({
      firstName: 'Emma', lastName: 'J', dateOfBirth: dob, nationality: null,
      gender: null, phone: null, email: null, passportExpiryDate: null, passportMeta: null,
    })
    expect(ctx.ageBand).toBe('child')
  })

  it('ageBand=infant for DOB 1 year ago', () => {
    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - 1)
    const ctx = buildJadeTravellerContext({
      firstName: 'Noah', lastName: 'J', dateOfBirth: dob, nationality: null,
      gender: null, phone: null, email: null, passportExpiryDate: null, passportMeta: null,
    })
    expect(ctx.ageBand).toBe('infant')
  })

  it('includes passportStatus when passport meta exists', () => {
    const futureDate = new Date()
    futureDate.setFullYear(futureDate.getFullYear() + 2)
    const ctx = buildJadeTravellerContext({
      firstName: 'A', lastName: 'B', dateOfBirth: null, nationality: null,
      gender: null, phone: null, email: null,
      passportExpiryDate: futureDate,
      passportMeta: { maskedNumber: '••••••5678' },
    })
    expect(ctx.passportStatus).toBe('VALID')
  })
})

describe('buildPrimaryJadeContext — no passport number', () => {
  it('does not expose raw passport number', () => {
    const ctx = buildPrimaryJadeContext({
      userName: 'Jane Doe',
      vault: {
        givenNames: 'Jane', surname: 'Doe', dateOfBirth: new Date('1990-01-01'),
        nationality: 'NG', sex: 'F', passportNumber: 'AB1234567',
        expiryDate: new Date('2030-01-01'), phone: null, homeAddress: null,
      },
      userPhone: null,
    }) as unknown as Record<string, unknown>
    expect(ctx.passportNumber).toBeUndefined()
    expect(JSON.stringify(ctx)).not.toContain('AB1234567')
  })
})

// ─── Notification service ─────────────────────────────────────────────────────

describe('notifications service — source invariants', () => {
  it('notifications.ts does not expose passport numbers', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/portal/notifications.ts'),
      'utf-8',
    )
    expect(source).not.toContain('passportNumber')
    expect(source).not.toContain('passport_number')
  })

  it('notifications.ts validates href starts with /', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/portal/notifications.ts'),
      'utf-8',
    )
    expect(source).toContain('isPortalUrl')
    expect(source).toContain("startsWith('/')")
  })

  it('notifications.ts uses upsert for dedupeKey (idempotency)', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/portal/notifications.ts'),
      'utf-8',
    )
    expect(source).toContain('upsert')
    expect(source).toContain('dedupeKey')
  })

  it('notification creation is non-fatal (wrapped in try/catch)', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/portal/notifications.ts'),
      'utf-8',
    )
    expect(source).toContain('try {')
    expect(source).toContain('} catch')
    expect(source).toContain('non-fatal')
  })
})

// ─── Notification event wiring ────────────────────────────────────────────────

describe('Notification event wiring — source invariants', () => {
  it('booking/confirm wires "Payment received" (not "Booking confirmed")', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/booking/confirm/route.ts'),
      'utf-8',
    )
    expect(source).toContain('payment_received')
    expect(source).toContain('Payment received')
    expect(source).not.toContain("title: 'Booking confirmed'")
    expect(source).not.toContain('title: "Booking confirmed"')
  })

  it('admin booking MARK_CONFIRMED wires "Booking confirmed" notification', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/admin/bookings/[id]/route.ts'),
      'utf-8',
    )
    expect(source).toContain('booking_confirmed')
    expect(source).toContain('Booking confirmed')
    expect(source).toContain('createCustomerNotification')
  })

  it('admin booking notification has dedupeKey for idempotency', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/admin/bookings/[id]/route.ts'),
      'utf-8',
    )
    expect(source).toContain('dedupeKey')
    expect(source).toContain('booking_confirmed_${booking.id}')
  })

  it('admin portal application DOCUMENTS_PENDING wires notification', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/admin/portal/applications/[id]/route.ts'),
      'utf-8',
    )
    expect(source).toContain('DOCUMENTS_PENDING')
    expect(source).toContain('createCustomerNotification')
    expect(source).toContain('Documents required')
  })

  it('booking confirm notification does not expose supplier internals', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/booking/confirm/route.ts'),
      'utf-8',
    )
    // Notification body must not reference supplier/internal fields
    expect(source).not.toContain("body: `...supplierPayload")
    expect(source).not.toContain("body: booking.notes")
  })
})

// ─── Traveller API invariants ─────────────────────────────────────────────────

describe('Traveller API — IDOR invariants', () => {
  it('GET /api/portal/travellers uses session.user.id (not request body)', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/portal/travellers/route.ts'),
      'utf-8',
    )
    expect(source).toContain('session.user.id')
    // userId must not be part of the parsed body schema
    expect(source).not.toContain("userId: z.string()")
    expect(source).not.toContain("userId:    z.")
  })

  it('PATCH /api/portal/travellers/[id] confirms ownership before update', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/portal/travellers/[id]/route.ts'),
      'utf-8',
    )
    // Must find existing record scoped to userId before update
    expect(source).toContain('findFirst')
    expect(source).toContain('userId: session.user.id')
  })

  it('DELETE uses soft delete (isDeleted: true) not physical delete', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/portal/travellers/[id]/route.ts'),
      'utf-8',
    )
    expect(source).toContain('isDeleted: true')
    expect(source).not.toContain('prisma.travellerProfile.delete(')
  })

  it('traveller API does not accept userId from request body', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/portal/travellers/route.ts'),
      'utf-8',
    )
    // userId must not be parsed from request body schema
    expect(source).not.toContain('z.string()  // userId')
    // userId in create must come only from session
    const createIdx = source.indexOf('POST')
    const sessionIdx = source.indexOf('session.user.id', createIdx)
    expect(sessionIdx).toBeGreaterThan(createIdx)
  })
})

// ─── Snapshot principle ───────────────────────────────────────────────────────

describe('Snapshot principle', () => {
  it('traveller API DELETE does not delete Booking or PortalApplication records', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/portal/travellers/[id]/route.ts'),
      'utf-8',
    )
    expect(source).not.toContain('prisma.booking.delete')
    expect(source).not.toContain('prisma.portalApplication.delete')
    expect(source).not.toContain('booking.passengers')  // must not modify snapshots
  })

  it('TravellerEditForm warns about historical booking records', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/dashboard/travellers/[id]/_components/TravellerEditForm.tsx'),
      'utf-8',
    )
    expect(source.toLowerCase()).toContain('historical')
    expect(source.toLowerCase()).toContain('booking')
  })
})

// ─── Privacy / Jade boundary ──────────────────────────────────────────────────

describe('Privacy and Jade boundary', () => {
  it('JadeTravellerContext interface does not include passportNumber field', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/portal/jade-context.ts'),
      'utf-8',
    )
    // Extract just the interface definition (between 'interface JadeTravellerContext' and first '}')
    const iStart = source.indexOf('interface JadeTravellerContext')
    const iEnd = source.indexOf('}', iStart)
    const interfaceBody = source.slice(iStart, iEnd)
    expect(interfaceBody).not.toContain('passportNumber')
    expect(interfaceBody).toContain('passportStatus')
    expect(interfaceBody).toContain('displayName')
  })

  it('jade-context.ts exports JadeTravellerContext — safe surface type', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/portal/jade-context.ts'),
      'utf-8',
    )
    expect(source).toContain('JadeTravellerContext')
    expect(source).toContain('buildJadeTravellerContext')
    expect(source).toContain('buildPrimaryJadeContext')
  })

  it('traveller-dto.ts passportMeta never includes raw passport number key', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/portal/traveller-dto.ts'),
      'utf-8',
    )
    // Raw passport number is excluded from DTO
    expect(source).toContain('maskPassportNumber')
    expect(source).toContain('maskedNumber')
  })
})

// ─── Navigation ───────────────────────────────────────────────────────────────

describe('Navigation — Release 6.4 entries', () => {
  it('PortalSidebar includes Travellers and Notifications', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../components/portal/PortalSidebar.tsx'),
      'utf-8',
    )
    expect(source).toContain('/dashboard/travellers')
    expect(source).toContain('Travellers')
    expect(source).toContain('/dashboard/notifications')
    expect(source).toContain('Notifications')
  })

  it('PortalBottomNav includes Travellers', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../components/portal/PortalBottomNav.tsx'),
      'utf-8',
    )
    expect(source).toContain('/dashboard/travellers')
  })
})

// ─── Notification center ──────────────────────────────────────────────────────

describe('Notification center page', () => {
  it('is an RSC (no use client)', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/dashboard/notifications/page.tsx'),
      'utf-8',
    )
    expect(source).not.toContain("'use client'")
    expect(source).not.toContain('"use client"')
  })

  it('queries portalNotification by userId from session', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/dashboard/notifications/page.tsx'),
      'utf-8',
    )
    expect(source).toContain('session.user.id')
    expect(source).toContain('portalNotification.findMany')
    expect(source).toContain('userId: session.user.id')
  })
})

// ─── Traveller pages ──────────────────────────────────────────────────────────

describe('Traveller pages — security', () => {
  it('travellers list page uses session.user.id (not params)', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/dashboard/travellers/page.tsx'),
      'utf-8',
    )
    expect(source).toContain('session.user.id')
    expect(source).toContain('userId: session.user.id')
  })

  it('traveller detail page validates ownership via findFirst with userId', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/dashboard/travellers/[id]/page.tsx'),
      'utf-8',
    )
    expect(source).toContain('userId: session.user.id')
    expect(source).toContain('findFirst')
  })

  it('traveller detail page redirects (not 404) on IDOR attempt', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/dashboard/travellers/[id]/page.tsx'),
      'utf-8',
    )
    expect(source).toContain("redirect('/dashboard/travellers')")
  })
})
