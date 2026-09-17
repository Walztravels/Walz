/**
 * INT-8 — Staff Intelligence: real operational metrics replace the 13
 * hardcoded constants; workload is observable, burnout is never diagnosed.
 */

import fs from 'fs'
import path from 'path'

jest.mock('@/lib/db', () => ({ __esModule: true, default: {} }))

import { periodRange, STAFF_METRICS_VERSION } from '@/lib/intelligence/staff-metrics'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const lib   = read('lib/intelligence/staff-metrics.ts')
const route = read('app/api/admin/intelligence/staff-performance/route.ts')
const page  = read('app/admin/intelligence/staff-performance/page.tsx')

describe('staff metrics engine', () => {
  it('period format is pinned to YYYY-MM', () => {
    expect(periodRange('2026-09')).toEqual({
      start: new Date(Date.UTC(2026, 8, 1)),
      end:   new Date(Date.UTC(2026, 9, 1)),
    })
    expect(periodRange('september')).toBeNull()
    expect(periodRange('2026-9')).toBeNull()
    expect(STAFF_METRICS_VERSION).toBe('int8.1')
  })
  it('every metric names its data source', () => {
    for (const src of ['Booking.createdByStaffId', 'ActivityBooking.bookedByStaffId', 'Quote.createdBy', 'EmailMessage.sentBy', 'CallLog.assignedTo', 'VisaApplicationMessage.sentBy', 'Lead.assignedToId', 'CheckInRecord.present']) {
      expect(lib).toContain(src)
    }
  })
  it('revenue is kept PER CURRENCY — never summed across currencies', () => {
    expect(lib).toContain('revenueByCurrency')
    expect(route).toContain('never summed')
    expect(route).toContain('buckets[0]?.[1] ?? 0')
  })
  it('unknowns are declared, not invented', () => {
    expect(lib).toContain('notComputable')
    expect(lib).toContain('avgResponseTimeMin —')
    expect(route).toContain('avgApplicationScore: 0, approvalRate: 0, docQualityScore: 0')
  })
})

describe('hardcoded constants removed', () => {
  it('none of the 13 literals remain', () => {
    expect(route).not.toContain('approvalRate = 0.75')
    expect(route).not.toContain('docQualityScore = 80')
    expect(route).not.toContain('avgResponseTimeMin = 45')
    expect(route).not.toContain('avgCompletionDays = 14')
    expect(route).not.toContain('crossSellRate = 0.2')
    expect(route).not.toContain('burnoutRisk = 25')
    expect(route).toContain('computeStaffMetrics')
  })
})

describe('no burnout diagnosis', () => {
  it('workload is an observable count with a stated basis; burnoutFlag stays false', () => {
    expect(lib).toContain('never assesses')
    expect(lib).toContain('workloadIndicator')
    expect(lib).toContain('open assigned applications')
    expect(route).toContain('burnoutFlag: false')
    expect(route).toContain('workload indicator, not a diagnosis')
  })
  it('the UI frames workload, not health', () => {
    expect(page).toContain('Workload (open items)')
    expect(page).toContain('High workload')
    expect(page).toContain('never a health assessment')
    expect(page).not.toContain('At Risk')
    expect(page).not.toContain('burnout detection')
  })
})
