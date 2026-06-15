import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

// ── Auth: use admin_token cookie (same as all other admin APIs) ──────────────
async function isAdmin() {
  return !!cookies().get('admin_token')?.value
}

export async function GET() {
  if (!await isAdmin()) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Include BOTH:
  // - isDraft: true  → admin sent the form, client hasn't submitted yet (Sent / Opened)
  // - isDraft: false → client submitted the form (In Progress / Submitted / Paid)
  const applications = await prisma.visaApplication.findMany({
    where: {
      initiatedBy: 'admin',   // only admin-sent forms in the tracker
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id:                  true,
      email:               true,
      firstName:           true,
      lastName:            true,
      destinationIso2:     true,
      visaType:            true,
      status:              true,
      isDraft:             true,
      openedAt:            true,
      startedAt:           true,
      submissionDate:      true,
      viewCount:           true,
      serviceFeePaid:      true,
      serviceFeeAmount:    true,
      serviceFeeCurrency:  true,
      createdAt:           true,
      tokens: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { createdAt: true, clientEmail: true, clientName: true },
      },
    },
  })

  const mapped = applications.map(a => ({
    id:                  a.id,
    clientEmail:         a.tokens[0]?.clientEmail ?? a.email ?? '',
    clientName:          a.tokens[0]?.clientName
                           ?? (a.firstName ? `${a.firstName} ${a.lastName ?? ''}`.trim() : '—'),
    destination:         a.destinationIso2,
    visaType:            a.visaType,
    // sentAt = when the token was created (when admin sent the link)
    sentAt:              a.tokens[0]?.createdAt ?? a.createdAt,
    openedAt:            a.openedAt   ?? null,
    startedAt:           a.startedAt  ?? null,
    submittedAt:         a.submissionDate ?? null,
    paymentStatus:       a.serviceFeePaid ? 'PAID' : 'UNPAID',
    viewCount:           a.viewCount  ?? 0,
    serviceFeeAmount:    a.serviceFeeAmount?.toString(),
    serviceFeeCurrency:  a.serviceFeeCurrency,
    status:              a.status,
  }))

  return NextResponse.json({ applications: mapped })
}
