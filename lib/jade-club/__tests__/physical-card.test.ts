/**
 * Jade Travel Club — physical card lifecycle tests.
 * Covers section 25 PHYSICAL CARD: lifecycle validation, customer cannot
 * arbitrarily mark card shipped/delivered, cross-client access blocked
 * (there is no customer-facing mutation path at all — only this
 * admin-only, RBAC-gated, audited module can change a card's status).
 */

const cardFindMany         = jest.fn()
const cardFindUnique       = jest.fn()
const cardCreate           = jest.fn()
const cardUpdate           = jest.fn()
const membershipFindUnique = jest.fn()
const activityLogCreate    = jest.fn()

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    jadePhysicalCard: {
      findMany:   (...args: unknown[]) => cardFindMany(...args),
      findUnique: (...args: unknown[]) => cardFindUnique(...args),
      create:     (...args: unknown[]) => cardCreate(...args),
      update:     (...args: unknown[]) => cardUpdate(...args),
    },
    jadeClubMembership: { findUnique: (...args: unknown[]) => membershipFindUnique(...args) },
    activityLog: { create: (...args: unknown[]) => activityLogCreate(...args) },
  },
}))

import { adminListPhysicalCards, adminSetPhysicalCardStatus } from '../physical-card'
import type { AdminSession } from '@/lib/admin-auth'

function fakeAdmin(role: string): AdminSession {
  return {
    id: 'staff_1', email: 'staff@walztravels.com', name: 'Staff Member', roleTitle: 'Agent',
    sendingEmail: 'reservations@walztravels.com', signatureTagline: null,
    role, staffRole: role, permissions: {}, branch: 'HQ', department: 'Ops', isActive: true,
  }
}

beforeEach(() => {
  cardFindMany.mockReset()
  cardFindUnique.mockReset()
  cardCreate.mockReset()
  cardUpdate.mockReset()
  membershipFindUnique.mockReset()
  activityLogCreate.mockReset()
  activityLogCreate.mockResolvedValue({})
})

describe('adminListPhysicalCards — RBAC-gated read', () => {
  it('rejects a role with no jade_club permission', async () => {
    const outsider = fakeAdmin('hotel_staff')
    await expect(adminListPhysicalCards(outsider)).rejects.toThrow(/FORBIDDEN/)
    expect(cardFindMany).not.toHaveBeenCalled()
  })

  it('allows a jade_club viewer to list cards', async () => {
    cardFindMany.mockResolvedValueOnce([])
    const viewer = fakeAdmin('customer_support')
    const result = await adminListPhysicalCards(viewer)
    expect(result).toEqual([])
  })
})

describe('adminSetPhysicalCardStatus — the ONLY mutation path; no customer route exists', () => {
  it('rejects a jade_club viewer without .manage (a plain viewer cannot ship/deliver a card)', async () => {
    const viewer = fakeAdmin('customer_support')
    await expect(
      adminSetPhysicalCardStatus(viewer, 'jcm_1', 'SHIPPED', 'trying to self-ship'),
    ).rejects.toThrow(/FORBIDDEN/)
    expect(cardUpdate).not.toHaveBeenCalled()
    expect(cardCreate).not.toHaveBeenCalled()
  })

  it('rejects an outsider role entirely', async () => {
    const outsider = fakeAdmin('hotel_staff')
    await expect(
      adminSetPhysicalCardStatus(outsider, 'jcm_1', 'DELIVERED', 'attempt'),
    ).rejects.toThrow(/FORBIDDEN/)
  })

  it('requires a non-blank reason even for an authorized admin', async () => {
    const admin = fakeAdmin('super_admin')
    await expect(
      adminSetPhysicalCardStatus(admin, 'jcm_1', 'APPROVED', ''),
    ).rejects.toThrow(/reason/i)
    expect(cardUpdate).not.toHaveBeenCalled()
  })

  it('rejects a status change for a membership that does not exist', async () => {
    const admin = fakeAdmin('super_admin')
    membershipFindUnique.mockResolvedValueOnce(null)
    await expect(
      adminSetPhysicalCardStatus(admin, 'not_a_real_membership', 'APPROVED', 'ops review'),
    ).rejects.toThrow(/not found/i)
  })

  it('allows an authorized admin to transition status, stamps the right timestamp, and audits it', async () => {
    const admin = fakeAdmin('super_admin')
    membershipFindUnique.mockResolvedValueOnce({ id: 'jcm_1' })
    cardFindUnique.mockResolvedValueOnce(null) // no card row yet — get-or-create
    cardCreate.mockResolvedValueOnce({
      id: 'card_1', membershipId: 'jcm_1', status: 'REQUESTED', cardholderName: null,
      shippingCity: null, shippingCountry: null, trackingReference: null,
      requestedAt: new Date(), approvedAt: null, shippedAt: null, deliveredAt: null,
    })

    const result = await adminSetPhysicalCardStatus(admin, 'jcm_1', 'REQUESTED', 'Customer called in')

    expect(result.status).toBe('REQUESTED')
    expect(cardCreate).toHaveBeenCalledTimes(1)
    const createArgs = cardCreate.mock.calls[0][0]
    expect(createArgs.data.membershipId).toBe('jcm_1')
    expect(createArgs.data.status).toBe('REQUESTED')
    expect(createArgs.data.requestedAt).toBeInstanceOf(Date)

    expect(activityLogCreate).toHaveBeenCalledTimes(1)
    const logArgs = activityLogCreate.mock.calls[0][0].data
    expect(logArgs.module).toBe('jade_club')
    expect(logArgs.action).toBe('JADE_CLUB_PHYSICAL_CARD_STATUS_CHANGED')
    expect(logArgs.before).toEqual({ status: 'NOT_ORDERED' })
    expect(logArgs.after).toEqual({ status: 'REQUESTED' })
  })
})
