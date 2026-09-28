/**
 * Staff Updates — lib/staff-updates/audience.ts
 *
 * isAnnouncementEligible is the single source of truth for "who is
 * targeted by this announcement" — used by the notify orchestrator, the
 * acknowledgement route, and the super-admin report. Covered exhaustively
 * here since a bug in this predicate silently changes who gets notified,
 * who can acknowledge, and who counts as "outstanding" all at once.
 */

const mockPrisma = { staff: { findMany: jest.fn() } }
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import { isAnnouncementEligible, resolveAnnouncementRecipients } from '@/lib/staff-updates/audience'

const staff = (over: Partial<{ id: string; role: string; department: string }> = {}) => ({
  id: 's1', role: 'sales_rep', department: 'sales', ...over,
})
const ann = (over: Partial<{ audience: string; audienceRoles: string[]; audienceStaffIds: string[] }> = {}) => ({
  audience: 'EVERYONE', audienceRoles: [] as string[], audienceStaffIds: [] as string[], ...over,
})

describe('isAnnouncementEligible', () => {
  it('EVERYONE targets every staff member regardless of role/department', () => {
    expect(isAnnouncementEligible(staff({ department: 'visa', role: 'visa_officer' }), ann({ audience: 'EVERYONE' }))).toBe(true)
  })

  it('SALES targets only the sales department', () => {
    expect(isAnnouncementEligible(staff({ department: 'sales' }), ann({ audience: 'SALES' }))).toBe(true)
    expect(isAnnouncementEligible(staff({ department: 'visa' }), ann({ audience: 'SALES' }))).toBe(false)
  })

  it('VISA_TEAM targets only the visa department', () => {
    expect(isAnnouncementEligible(staff({ department: 'visa' }), ann({ audience: 'VISA_TEAM' }))).toBe(true)
    expect(isAnnouncementEligible(staff({ department: 'sales' }), ann({ audience: 'VISA_TEAM' }))).toBe(false)
  })

  it('TRAVEL_CONSULTANTS targets flights/tours/hotels only', () => {
    for (const department of ['flights', 'tours', 'hotels']) {
      expect(isAnnouncementEligible(staff({ department }), ann({ audience: 'TRAVEL_CONSULTANTS' }))).toBe(true)
    }
    expect(isAnnouncementEligible(staff({ department: 'accounts' }), ann({ audience: 'TRAVEL_CONSULTANTS' }))).toBe(false)
  })

  it('FINANCE targets only the accounts department', () => {
    expect(isAnnouncementEligible(staff({ department: 'accounts' }), ann({ audience: 'FINANCE' }))).toBe(true)
    expect(isAnnouncementEligible(staff({ department: 'sales' }), ann({ audience: 'FINANCE' }))).toBe(false)
  })

  it('ADMIN_TEAM targets super_admin/admin roles regardless of department', () => {
    expect(isAnnouncementEligible(staff({ role: 'super_admin', department: 'general' }), ann({ audience: 'ADMIN_TEAM' }))).toBe(true)
    expect(isAnnouncementEligible(staff({ role: 'admin' }), ann({ audience: 'ADMIN_TEAM' }))).toBe(true)
    expect(isAnnouncementEligible(staff({ role: 'sales_rep' }), ann({ audience: 'ADMIN_TEAM' }))).toBe(false)
  })

  it('MANAGEMENT targets super_admin/manager/general_manager roles', () => {
    for (const role of ['super_admin', 'manager', 'general_manager']) {
      expect(isAnnouncementEligible(staff({ role }), ann({ audience: 'MANAGEMENT' }))).toBe(true)
    }
    expect(isAnnouncementEligible(staff({ role: 'sales_rep' }), ann({ audience: 'MANAGEMENT' }))).toBe(false)
  })

  it('SPECIFIC_ROLE targets only roles named in audienceRoles', () => {
    const a = ann({ audience: 'SPECIFIC_ROLE', audienceRoles: ['visa_officer'] })
    expect(isAnnouncementEligible(staff({ role: 'visa_officer' }), a)).toBe(true)
    expect(isAnnouncementEligible(staff({ role: 'sales_rep' }), a)).toBe(false)
  })

  it('SPECIFIC_STAFF targets only staff ids named in audienceStaffIds', () => {
    const a = ann({ audience: 'SPECIFIC_STAFF', audienceStaffIds: ['s1'] })
    expect(isAnnouncementEligible(staff({ id: 's1' }), a)).toBe(true)
    expect(isAnnouncementEligible(staff({ id: 's2' }), a)).toBe(false)
  })

  it('an unrecognized audience value fails open to true rather than silently excluding everyone', () => {
    expect(isAnnouncementEligible(staff(), ann({ audience: 'SOMETHING_NEW' }))).toBe(true)
  })
})

describe('resolveAnnouncementRecipients', () => {
  beforeEach(() => jest.clearAllMocks())

  it('queries only isActive staff and filters by the eligibility predicate', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([
      { id: 's1', name: 'Ada', email: 'ada@walztravels.com', role: 'sales_rep', department: 'sales' },
      { id: 's2', name: 'Bo',  email: 'bo@walztravels.com',  role: 'visa_officer', department: 'visa' },
    ])
    const recipients = await resolveAnnouncementRecipients(ann({ audience: 'SALES' }))
    expect(mockPrisma.staff.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true },
    }))
    expect(recipients).toEqual([
      { id: 's1', name: 'Ada', email: 'ada@walztravels.com', role: 'sales_rep', department: 'sales' },
    ])
  })

  it('returns an empty list when no active staff match', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([])
    expect(await resolveAnnouncementRecipients(ann())).toEqual([])
  })
})
