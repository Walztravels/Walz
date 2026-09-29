// lib/jade-club/physical-card.ts — Physical Jade Card: admin foundation only.
//
// Phase 1 exposes NO customer-facing ordering flow (the customer page shows
// "Coming Soon" — see app/dashboard/club/page.tsx). There is deliberately no
// customer route anywhere in this feature that can create/update a
// JadePhysicalCard row — the only way one is ever created or has its status
// changed is adminSetPhysicalCardStatus below, which requires an
// AdminSession with 'jade_club.manage' and always writes an audited
// ActivityLog row.
//
// This is a MEMBERSHIP CREDENTIAL, not a payment card: no PAN/CVV, no
// balance, no Visa/Mastercard network fields exist on this model, and none
// should ever be added here.

import prisma from '@/lib/db'
import type { AdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { type JadePhysicalCardStatus, isJadePhysicalCardStatus } from './types'

export interface JadePhysicalCardAdminView {
  membershipId: string
  status: JadePhysicalCardStatus
  cardholderName: string | null
  shippingCity: string | null
  shippingCountry: string | null
  trackingReference: string | null
  requestedAt: Date | null
  shippedAt: Date | null
  deliveredAt: Date | null
}

export async function adminListPhysicalCards(admin: AdminSession): Promise<JadePhysicalCardAdminView[]> {
  if (!hasPermission(admin, 'jade_club')) throw new Error('FORBIDDEN')
  const rows = await prisma.jadePhysicalCard.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map(r => ({
    membershipId: r.membershipId,
    status: isJadePhysicalCardStatus(r.status) ? r.status : 'NOT_ORDERED',
    cardholderName: r.cardholderName,
    shippingCity: r.shippingCity,
    shippingCountry: r.shippingCountry,
    trackingReference: r.trackingReference,
    requestedAt: r.requestedAt,
    shippedAt: r.shippedAt,
    deliveredAt: r.deliveredAt,
  }))
}

/**
 * Admin-only, audited physical-card status transition. Creates the
 * underlying row on first use (get-or-create scoped to the target
 * membershipId — never a customer-supplied row). Requires
 * 'jade_club.manage'; a plain 'jade_club' viewer cannot call this.
 */
export async function adminSetPhysicalCardStatus(
  admin: AdminSession,
  membershipId: string,
  status: JadePhysicalCardStatus,
  reason: string,
): Promise<JadePhysicalCardAdminView> {
  if (!hasPermission(admin, 'jade_club.manage')) throw new Error('FORBIDDEN')
  if (!reason || !reason.trim()) throw new Error('A reason is required for a physical card status change')

  const membership = await prisma.jadeClubMembership.findUnique({ where: { id: membershipId } })
  if (!membership) throw new Error('Membership not found')

  const existing = await prisma.jadePhysicalCard.findUnique({ where: { membershipId } })

  const timestampField: Partial<Record<JadePhysicalCardStatus, string>> = {
    REQUESTED: 'requestedAt', APPROVED: 'approvedAt', SHIPPED: 'shippedAt',
    DELIVERED: 'deliveredAt', CANCELLED: 'cancelledAt',
  }
  const stampField = timestampField[status]
  const stampData = stampField ? { [stampField]: new Date() } : {}

  const after = existing
    ? await prisma.jadePhysicalCard.update({ where: { membershipId }, data: { status, ...stampData } })
    : await prisma.jadePhysicalCard.create({ data: { membershipId, status, ...stampData } })

  await prisma.activityLog.create({
    data: {
      staffId: admin.id,
      staffName: admin.name,
      staffRole: admin.role,
      action: 'JADE_CLUB_PHYSICAL_CARD_STATUS_CHANGED',
      module: 'jade_club',
      entityType: 'JadePhysicalCard',
      entityId: after.id,
      detail: reason,
      before: { status: existing?.status ?? 'NOT_ORDERED' },
      after: { status: after.status },
    },
  }).catch((e) => console.warn('[jade-club] activity log write failed:', e))

  return {
    membershipId: after.membershipId,
    status: isJadePhysicalCardStatus(after.status) ? after.status : 'NOT_ORDERED',
    cardholderName: after.cardholderName,
    shippingCity: after.shippingCity,
    shippingCountry: after.shippingCountry,
    trackingReference: after.trackingReference,
    requestedAt: after.requestedAt,
    shippedAt: after.shippedAt,
    deliveredAt: after.deliveredAt,
  }
}
