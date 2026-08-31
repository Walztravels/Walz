// __tests__/release-62.test.ts
// Release 6.2 — Unified Client Portal Dashboard: test suite.
// Covers: status-normalizers, customer-actions, dashboard-data interface,
//         API route security invariants, sidebar nav, and source-code assertions.

import {
  proposalStatusLabel,
  proposalStatusColor,
  proposalNeedsAction,
  bookingStatusLabel,
  bookingStatusColor,
  applicationStageLabel,
  applicationStageColor,
  applicationStageProgress,
} from '../lib/portal/status-normalizers'

import { deriveCustomerActions } from '../lib/portal/customer-actions'

import fs from 'fs'
import path from 'path'

// ── Helpers ───────────────────────────────────────────────────────────────────

function read(rel: string) {
  return fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8')
}

function hasPattern(file: string, pattern: string | RegExp): boolean {
  const src = read(file)
  return typeof pattern === 'string' ? src.includes(pattern) : pattern.test(src)
}

// ── Status normalizers ────────────────────────────────────────────────────────

describe('proposalStatusLabel', () => {
  test('sent → awaiting approval label', () => {
    expect(proposalStatusLabel('sent')).toBe('Awaiting your approval')
  })
  test('viewed → awaiting approval label', () => {
    expect(proposalStatusLabel('viewed')).toBe('Awaiting your approval')
  })
  test('approved → Approved', () => {
    expect(proposalStatusLabel('approved')).toBe('Approved')
  })
  test('rejected → Declined', () => {
    expect(proposalStatusLabel('rejected')).toBe('Declined')
  })
  test('expired → Expired', () => {
    expect(proposalStatusLabel('expired')).toBe('Expired')
  })
  test('cancelled → Cancelled', () => {
    expect(proposalStatusLabel('cancelled')).toBe('Cancelled')
  })
  test('unknown status falls back to the raw value', () => {
    expect(proposalStatusLabel('unknown_status')).toBe('unknown_status')
  })
})

describe('proposalStatusColor', () => {
  test('sent returns amber classes', () => {
    expect(proposalStatusColor('sent')).toContain('amber')
  })
  test('viewed returns amber classes', () => {
    expect(proposalStatusColor('viewed')).toContain('amber')
  })
  test('approved returns green classes', () => {
    expect(proposalStatusColor('approved')).toContain('green')
  })
  test('rejected returns red classes', () => {
    expect(proposalStatusColor('rejected')).toContain('red')
  })
  test('expired returns muted classes', () => {
    const cls = proposalStatusColor('expired')
    expect(cls).not.toContain('amber')
    expect(cls).not.toContain('green')
    expect(cls).not.toContain('red')
  })
})

describe('proposalNeedsAction', () => {
  test('sent needs action', () => expect(proposalNeedsAction('sent')).toBe(true))
  test('viewed needs action', () => expect(proposalNeedsAction('viewed')).toBe(true))
  test('approved does not need action', () => expect(proposalNeedsAction('approved')).toBe(false))
  test('rejected does not need action', () => expect(proposalNeedsAction('rejected')).toBe(false))
  test('draft does not need action', () => expect(proposalNeedsAction('draft')).toBe(false))
})

describe('bookingStatusLabel', () => {
  test('PENDING → Processing', () => expect(bookingStatusLabel('PENDING')).toBe('Processing'))
  test('CONFIRMED → Confirmed', () => expect(bookingStatusLabel('CONFIRMED')).toBe('Confirmed'))
  test('CANCELLED → Cancelled', () => expect(bookingStatusLabel('CANCELLED')).toBe('Cancelled'))
  test('COMPLETED → Completed', () => expect(bookingStatusLabel('COMPLETED')).toBe('Completed'))
  test('FAILED → Failed', () => expect(bookingStatusLabel('FAILED')).toBe('Failed'))
  test('unknown falls back to raw', () => expect(bookingStatusLabel('UNKNOWN')).toBe('UNKNOWN'))
})

describe('bookingStatusColor', () => {
  test('CONFIRMED → green', () => expect(bookingStatusColor('CONFIRMED')).toContain('green'))
  test('CANCELLED → red', () => expect(bookingStatusColor('CANCELLED')).toContain('red'))
  test('FAILED → red', () => expect(bookingStatusColor('FAILED')).toContain('red'))
  test('PENDING → amber', () => expect(bookingStatusColor('PENDING')).toContain('amber'))
})

describe('applicationStageLabel', () => {
  test('ENQUIRY → Enquiry received', () => {
    expect(applicationStageLabel('ENQUIRY')).toBe('Enquiry received')
  })
  test('DOCUMENTS_PENDING → Documents needed', () => {
    expect(applicationStageLabel('DOCUMENTS_PENDING')).toBe('Documents needed')
  })
  test('APPROVED → Approved', () => {
    expect(applicationStageLabel('APPROVED')).toBe('Approved')
  })
  test('REJECTED → Refused (not "Rejected")', () => {
    expect(applicationStageLabel('REJECTED')).toBe('Refused')
  })
  test('unknown stage replaces underscores with spaces', () => {
    expect(applicationStageLabel('SOME_UNKNOWN')).toBe('SOME UNKNOWN')
  })
})

describe('applicationStageProgress', () => {
  test('ENQUIRY is first step → lowest percentage', () => {
    expect(applicationStageProgress('ENQUIRY')).toBeGreaterThan(0)
    expect(applicationStageProgress('ENQUIRY')).toBeLessThan(50)
  })
  test('COMPLETED is last step → 100%', () => {
    expect(applicationStageProgress('COMPLETED')).toBe(100)
  })
  test('REJECTED → 100%', () => {
    expect(applicationStageProgress('REJECTED')).toBe(100)
  })
  test('progress increases through the funnel', () => {
    const stages = ['ENQUIRY', 'DOCUMENTS_PENDING', 'PROCESSING', 'SUBMITTED', 'APPROVED', 'COMPLETED']
    const progresses = stages.map(applicationStageProgress)
    for (let i = 1; i < progresses.length; i++) {
      expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1])
    }
  })
  test('unknown stage returns 0', () => {
    expect(applicationStageProgress('DOES_NOT_EXIST')).toBe(0)
  })
})

describe('applicationStageColor', () => {
  test('DOCUMENTS_PENDING → amber (calls to action)', () => {
    expect(applicationStageColor('DOCUMENTS_PENDING')).toContain('amber')
  })
  test('APPROVED → green', () => {
    expect(applicationStageColor('APPROVED')).toContain('green')
  })
  test('REJECTED → red', () => {
    expect(applicationStageColor('REJECTED')).toContain('red')
  })
})

// ── deriveCustomerActions ─────────────────────────────────────────────────────

describe('deriveCustomerActions', () => {
  const noApps  = [] as Parameters<typeof deriveCustomerActions>[0]['applications']
  const noProps = [] as Parameters<typeof deriveCustomerActions>[0]['proposals']

  test('returns empty array when nothing needs attention', () => {
    const apps = [{ id: 'a1', stage: 'PROCESSING', refNumber: 'WA001', title: 'UK Visa' }]
    const props = [{ id: 'p1', referenceNumber: 'ITN001', title: 'Paris Trip', status: 'approved' }]
    expect(deriveCustomerActions({ applications: apps, proposals: props })).toHaveLength(0)
  })

  test('urgent action for DOCUMENTS_PENDING application', () => {
    const apps = [{ id: 'a1', stage: 'DOCUMENTS_PENDING', refNumber: 'WA001', title: 'UK Visa' }]
    const actions = deriveCustomerActions({ applications: apps, proposals: noProps })
    expect(actions).toHaveLength(1)
    expect(actions[0].priority).toBe('urgent')
    expect(actions[0].href).toBe('/portal/documents')
    expect(actions[0].description).toContain('WA001')
  })

  test('normal action for proposal awaiting approval (sent)', () => {
    const props = [{ id: 'p1', referenceNumber: 'ITN001', title: 'Paris Trip', status: 'sent' }]
    const actions = deriveCustomerActions({ applications: noApps, proposals: props })
    expect(actions).toHaveLength(1)
    expect(actions[0].priority).toBe('normal')
    expect(actions[0].href).toBe('/itinerary/ITN001')
    expect(actions[0].description).toContain('Paris Trip')
  })

  test('normal action for proposal with viewed status', () => {
    const props = [{ id: 'p1', referenceNumber: 'ITN001', title: 'Paris Trip', status: 'viewed' }]
    const actions = deriveCustomerActions({ applications: noApps, proposals: props })
    expect(actions).toHaveLength(1)
    expect(actions[0].priority).toBe('normal')
  })

  test('urgent actions appear before normal actions', () => {
    const apps = [{ id: 'a1', stage: 'DOCUMENTS_PENDING', refNumber: 'WA001', title: 'UK Visa' }]
    const props = [{ id: 'p1', referenceNumber: 'ITN001', title: 'Paris', status: 'sent' }]
    const actions = deriveCustomerActions({ applications: apps, proposals: props })
    expect(actions).toHaveLength(2)
    expect(actions[0].priority).toBe('urgent')
    expect(actions[1].priority).toBe('normal')
  })

  test('no action for non-pending application stages', () => {
    const stages = ['ENQUIRY', 'PROCESSING', 'SUBMITTED', 'AWAITING_DECISION', 'APPROVED', 'REJECTED', 'COMPLETED']
    for (const stage of stages) {
      const apps = [{ id: 'a1', stage, refNumber: 'WA001', title: 'UK Visa' }]
      const actions = deriveCustomerActions({ applications: apps, proposals: noProps })
      expect(actions).toHaveLength(0)
    }
  })

  test('no action for proposals that do not need approval', () => {
    const nonPending = ['approved', 'rejected', 'expired', 'cancelled', 'draft']
    for (const status of nonPending) {
      const props = [{ id: 'p1', referenceNumber: 'ITN001', title: 'Trip', status }]
      const actions = deriveCustomerActions({ applications: noApps, proposals: props })
      expect(actions).toHaveLength(0)
    }
  })

  test('each action has a unique id', () => {
    const apps = [
      { id: 'a1', stage: 'DOCUMENTS_PENDING', refNumber: 'WA001', title: 'Visa A' },
      { id: 'a2', stage: 'DOCUMENTS_PENDING', refNumber: 'WA002', title: 'Visa B' },
    ]
    const props = [
      { id: 'p1', referenceNumber: 'ITN001', title: 'Trip A', status: 'sent' },
      { id: 'p2', referenceNumber: 'ITN002', title: 'Trip B', status: 'viewed' },
    ]
    const actions = deriveCustomerActions({ applications: apps, proposals: props })
    const ids = actions.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ── Source invariants ─────────────────────────────────────────────────────────

describe('Release 6.2 source invariants', () => {

  // Dashboard data service
  test('dashboard-data: proposals query uses userId only — no client-email match', () => {
    const src = read('lib/portal/dashboard-data.ts')
    expect(src).toContain('userId,')
    expect(src).not.toMatch(/where.*clientEmail/i)
    expect(src).not.toMatch(/where.*client_email/i)
  })

  test('dashboard-data: getDashboardData is exported', () => {
    expect(hasPattern('lib/portal/dashboard-data.ts', 'export async function getDashboardData')).toBe(true)
  })

  test('dashboard-data: excludes draft proposals', () => {
    expect(hasPattern('lib/portal/dashboard-data.ts', "not: 'draft'")).toBe(true)
  })

  // Dashboard page
  test('dashboard page: is NOT a client component (no use client directive)', () => {
    const src = read('app/dashboard/page.tsx')
    expect(src.startsWith("'use client'")).toBe(false)
    expect(src.includes('"use client"')).toBe(false)
  })

  test('dashboard page: imports getDashboardData from lib', () => {
    expect(hasPattern('app/dashboard/page.tsx', "from '@/lib/portal/dashboard-data'")).toBe(true)
  })

  test('dashboard page: imports deriveCustomerActions', () => {
    expect(hasPattern('app/dashboard/page.tsx', "from '@/lib/portal/customer-actions'")).toBe(true)
  })

  test('dashboard page: imports NotificationsBell client component', () => {
    expect(hasPattern('app/dashboard/page.tsx', "from './_components/NotificationsBell'")).toBe(true)
  })

  test('dashboard page: proposals section links to /itinerary/[ref]', () => {
    expect(hasPattern('app/dashboard/page.tsx', '/itinerary/')).toBe(true)
  })

  test('dashboard page: force-dynamic export', () => {
    expect(hasPattern('app/dashboard/page.tsx', "export const dynamic = 'force-dynamic'")).toBe(true)
  })

  // Dashboard layout
  test('dashboard layout: auth redirects to /login', () => {
    expect(hasPattern('app/dashboard/layout.tsx', "redirect('/login?callbackUrl=/dashboard')")).toBe(true)
  })

  test('dashboard layout: renders PortalSidebar', () => {
    expect(hasPattern('app/dashboard/layout.tsx', 'PortalSidebar')).toBe(true)
  })

  test('dashboard layout: renders PortalBottomNav', () => {
    expect(hasPattern('app/dashboard/layout.tsx', 'PortalBottomNav')).toBe(true)
  })

  // Proposals page
  test('proposals page: queries by userId only', () => {
    const src = read('app/dashboard/proposals/page.tsx')
    expect(src).toContain('userId: session.user.id')
    expect(src).not.toMatch(/clientEmail/i)
  })

  test('proposals page: excludes draft status', () => {
    expect(hasPattern('app/dashboard/proposals/page.tsx', "not: 'draft'")).toBe(true)
  })

  test('proposals page: links to /itinerary/[ref] (existing viewer)', () => {
    expect(hasPattern('app/dashboard/proposals/page.tsx', '/itinerary/')).toBe(true)
  })

  // Bookings page
  test('bookings page: uses userId and email (not raw email from request body)', () => {
    const src = read('app/dashboard/bookings/page.tsx')
    expect(src).toContain('session.user.id')
    expect(src).not.toContain('req.body')
    expect(src).not.toContain('await req.json()')
  })

  // API: itineraries route
  test('portal itineraries API: auth-gated — rejects without session', () => {
    const src = read('app/api/portal/itineraries/route.ts')
    expect(src).toContain('Unauthorised')
    expect(src).toContain('session.user.id')
  })

  test('portal itineraries API: ownership by userId only', () => {
    const src = read('app/api/portal/itineraries/route.ts')
    expect(src).toContain('userId: session.user.id')
    expect(src).not.toMatch(/clientEmail/i)
  })

  test('portal itineraries API: excludes draft status', () => {
    expect(hasPattern('app/api/portal/itineraries/route.ts', "not: 'draft'")).toBe(true)
  })

  // PortalSidebar nav
  test('PortalSidebar: contains My Itineraries nav entry', () => {
    expect(hasPattern('components/portal/PortalSidebar.tsx', 'My Itineraries')).toBe(true)
  })

  test('PortalSidebar: My Itineraries links to /dashboard/proposals', () => {
    expect(hasPattern('components/portal/PortalSidebar.tsx', '/dashboard/proposals')).toBe(true)
  })

  test('PortalSidebar: Sparkles icon imported', () => {
    expect(hasPattern('components/portal/PortalSidebar.tsx', 'Sparkles')).toBe(true)
  })

  // NotificationsBell
  test('NotificationsBell: is a client component', () => {
    const src = read('app/dashboard/_components/NotificationsBell.tsx')
    expect(src.startsWith("'use client'")).toBe(true)
  })

  test('NotificationsBell: calls /api/portal/notifications', () => {
    expect(hasPattern('app/dashboard/_components/NotificationsBell.tsx', '/api/portal/notifications')).toBe(true)
  })

  // Security constraints
  test('dashboard page: does not reference supplierPayload or internal cost fields', () => {
    const src = read('app/dashboard/page.tsx')
    expect(src).not.toContain('supplierPayload')
    expect(src).not.toContain('netCost')
    expect(src).not.toContain('markup')
    expect(src).not.toContain('commission')
    expect(src).not.toContain('rateKey')
  })

  test('dashboard data: does not select internal cost fields', () => {
    const src = read('lib/portal/dashboard-data.ts')
    expect(src).not.toContain('supplierPayload')
    expect(src).not.toContain('netCost')
    expect(src).not.toContain('markup')
    expect(src).not.toContain('commission')
    expect(src).not.toContain('rateKey')
  })

  test('dashboard page: does not import signOut directly (provided by sidebar layout)', () => {
    const src = read('app/dashboard/page.tsx')
    expect(src).not.toContain("import { signOut }")
    expect(src).not.toContain("from 'next-auth/react'")
  })

  // Status normalizers exported
  test('status-normalizers: all key functions exported', () => {
    const src = read('lib/portal/status-normalizers.ts')
    for (const fn of [
      'proposalStatusLabel', 'proposalStatusColor', 'proposalNeedsAction',
      'bookingStatusLabel', 'bookingStatusColor',
      'applicationStageLabel', 'applicationStageColor', 'applicationStageProgress',
    ]) {
      expect(src).toContain(`export function ${fn}`)
    }
  })

  // customer-actions exported
  test('customer-actions: deriveCustomerActions exported', () => {
    expect(hasPattern('lib/portal/customer-actions.ts', 'export function deriveCustomerActions')).toBe(true)
  })
})
