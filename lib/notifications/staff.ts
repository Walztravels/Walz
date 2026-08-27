// Staff notification helper (Release 3A)
//
// Wraps prisma.staffNotification.create() with idempotency via sourceId.
// sourceId is a caller-supplied dedup string — e.g. "recovery:supplier:abc123".
// If a notification with that sourceId already exists for the same staff member,
// the create is skipped (no duplicate notifications).

import prisma from '@/lib/db'

type NotificationCategory =
  | 'JADE_BRIEF'
  | 'SYSTEM'
  | 'VISA'
  | 'TRAVEL'
  | 'BOOKING'
  | 'SUPPLIER'
  | 'MANAGEMENT'

interface CreateStaffNotificationOpts {
  staffId:     string
  category:    NotificationCategory
  title:       string
  body:        string
  important?:  boolean
  archived?:   boolean
  sourceId?:   string
  sourceType?: string
  data?:       Record<string, unknown>
}

export async function createStaffNotification(
  opts: CreateStaffNotificationOpts
): Promise<string | null> {
  // Idempotency: skip if a notification with this sourceId already exists for this staff member
  if (opts.sourceId) {
    const existing = await prisma.staffNotification.findFirst({
      where:  { staffId: opts.staffId, sourceId: opts.sourceId },
      select: { id: true },
    })
    if (existing) return existing.id
  }

  try {
    const notification = await prisma.staffNotification.create({
      data: {
        staffId:    opts.staffId,
        category:   opts.category,
        title:      opts.title,
        body:       opts.body,
        important:  opts.important  ?? false,
        archived:   opts.archived   ?? false,
        sourceId:   opts.sourceId   ?? null,
        sourceType: opts.sourceType ?? null,
        data:       opts.data !== undefined ? (opts.data as import('@prisma/client').Prisma.InputJsonValue) : undefined,
      },
    })
    return notification.id
  } catch (err) {
    console.warn('[StaffNotification] create failed:', (err as Error).message)
    return null
  }
}
