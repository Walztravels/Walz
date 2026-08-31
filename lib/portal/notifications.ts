// lib/portal/notifications.ts — Release 6.4: Centralized customer notification service
// All notifications must come from authoritative server-side events only.
// Non-fatal: notification failures must never crash the calling flow.

import prisma from '@/lib/db'

export type NotificationCategory =
  | 'PROPOSAL'
  | 'PAYMENT'
  | 'BOOKING'
  | 'DOCUMENT'
  | 'TRAVELLER'
  | 'ESIM'
  | 'ACCOUNT'
  | 'ACTION'

export interface CreateNotificationInput {
  userId: string
  category: NotificationCategory
  type: string
  title: string
  body: string
  href?: string
  entityType?: string
  entityId?: string
  dedupeKey?: string
}

// Only relative portal URLs are permitted in notification CTAs.
function isPortalUrl(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//')
}

export async function createCustomerNotification(input: CreateNotificationInput): Promise<void> {
  if (!input.userId) return

  if (input.href && !isPortalUrl(input.href)) {
    console.error('[notifications] Refused external href:', input.href.slice(0, 60))
    return
  }

  const payload = {
    userId: input.userId,
    category: input.category,
    type: input.type,
    title: input.title,
    body: input.body,
    href: input.href ?? null,
    data: {
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
    read: false,
  }

  try {
    if (input.dedupeKey) {
      await prisma.portalNotification.upsert({
        where: { dedupeKey: input.dedupeKey },
        create: { ...payload, dedupeKey: input.dedupeKey },
        update: {},
      })
    } else {
      await prisma.portalNotification.create({ data: payload })
    }
  } catch (err) {
    console.error('[notifications] create failed (non-fatal):', err)
  }
}

// Resolve userId from email fallback for bookings created before portal login
export async function resolveUserIdForBookingNotification(opts: {
  userId: string | null
  contactEmail: string
}): Promise<string | null> {
  if (opts.userId) return opts.userId
  if (!opts.contactEmail) return null
  const user = await prisma.user.findFirst({
    where: { email: opts.contactEmail.toLowerCase() },
    select: { id: true },
  })
  return user?.id ?? null
}
