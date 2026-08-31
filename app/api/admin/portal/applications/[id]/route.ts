import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }  from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { z } from 'zod'
import { createCustomerNotification } from '@/lib/portal/notifications'


const updateSchema = z.object({
  stage:       z.enum(['ENQUIRY', 'DOCUMENTS_PENDING', 'DOCUMENTS_RECEIVED', 'PROCESSING', 'SUBMITTED', 'AWAITING_DECISION', 'APPROVED', 'REJECTED', 'COMPLETED']).optional(),
  adminNotes:  z.string().optional(),
  amount:      z.number().nullable().optional(),
  amountPaid:  z.number().optional(),
  currency:    z.string().optional(),
  walzFee:     z.number().nullable().optional(),
  walzCurrency: z.string().nullable().optional(),
  govFee:      z.number().nullable().optional(),
  govCurrency: z.string().nullable().optional(),
  govFeeNote:     z.string().nullable().optional(),
  whatsappNumber: z.string().nullable().optional(),
}).partial()

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const application = await prisma.portalApplication.findUnique({
    where:   { id: params.id },
    include: {
      user:    { select: { name: true, email: true } },
      updates: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ application })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 422 })

  const prev = await prisma.portalApplication.findUnique({
    where: { id: params.id },
    include: { user: { select: { name: true, email: true } } },
  })
  if (!prev) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const application = await prisma.portalApplication.update({
    where: { id: params.id },
    data:  parsed.data,
    include: { user: { select: { name: true, email: true } } },
  })

  // Portal notification on stage change
  if (parsed.data.stage && parsed.data.stage !== prev.stage && application.userId) {
    const notifMap: Partial<Record<string, { title: string; body: string; category: 'DOCUMENT' | 'ACCOUNT' }>> = {
      DOCUMENTS_PENDING: {
        category: 'DOCUMENT',
        title: 'Documents required',
        body: `Your application "${application.title}" requires documents. Please upload them at your earliest convenience.`,
      },
      APPROVED: {
        category: 'ACCOUNT',
        title: 'Application approved',
        body: `Great news — your application "${application.title}" has been approved.`,
      },
      REJECTED: {
        category: 'ACCOUNT',
        title: 'Application update',
        body: `There has been an update to your application "${application.title}". Please log in for details.`,
      },
    }
    const notif = notifMap[parsed.data.stage]
    if (notif) {
      createCustomerNotification({
        userId: application.userId,
        category: notif.category,
        type: `application_${parsed.data.stage.toLowerCase()}`,
        title: notif.title,
        body: notif.body,
        href: '/portal/application',
        entityType: 'application',
        entityId: application.id,
        dedupeKey: `application_${parsed.data.stage.toLowerCase()}_${application.id}`,
      }).catch(err => console.error('[Admin Applications] Notification failed (non-fatal):', err))
    }
  }

  // Email client on stage change
  if (parsed.data.stage && parsed.data.stage !== prev.stage && application.user?.email) {
    const STAGE_LABELS: Record<string, string> = {
      ENQUIRY: 'Enquiry Received', DOCUMENTS_PENDING: 'Documents Pending',
      DOCUMENTS_RECEIVED: 'Documents Received', PROCESSING: 'In Processing',
      SUBMITTED: 'Submitted', APPROVED: 'Approved ✅', REJECTED: 'Rejected',
      COMPLETED: 'Completed',
    }
    try {
      await getResend().emails.send({
        from:    'Walz Travels <noreply@walztravels.com>',
        to:      application.user.email,
        subject: `Application Update — ${application.title}: ${STAGE_LABELS[parsed.data.stage]}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <div style="background: #0A1628; padding: 20px; text-align: center;">
              <img src="https://www.walztravels.com/walz-logo.png" alt="Walz Travels" style="height: 40px;" />
            </div>
            <div style="background: #F7F4EF; padding: 30px;">
              <h2 style="color: #0A1628;">Application Status Update</h2>
              <p>Hi ${application.user.name ?? 'there'},</p>
              <p>Your application <strong>${application.title}</strong> (${application.refNumber}) has been updated.</p>
              <p style="font-size: 18px;"><strong>New Status:</strong> <span style="color: #C9A84C;">${STAGE_LABELS[parsed.data.stage]}</span></p>
              ${parsed.data.stage === 'DOCUMENTS_PENDING' ? '<p style="color: #D4880A;"><strong>Action required:</strong> Please log in to your portal and upload the required documents.</p>' : ''}
              ${application.adminNotes ? `<p><strong>Note from our team:</strong> ${application.adminNotes}</p>` : ''}
              <div style="margin-top: 24px; text-align: center;">
                <a href="https://www.walztravels.com/portal/dashboard" style="background: #0A1628; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">View Application</a>
              </div>
            </div>
          </div>
        `,
      })
    } catch { /* non-fatal */ }
  }

  // When a case reaches a final outcome, surface any un-cancelled holds
  const FINAL_STAGES = ['APPROVED', 'REJECTED', 'COMPLETED']
  if (parsed.data.stage && FINAL_STAGES.includes(parsed.data.stage)) {
    const holdsQuery = await getSupabaseAdmin()
      .from('dummy_bookings')
      .select('id, type, provider, provider_ref, hotel_name, route, check_in, check_out, expires_at')
      .eq('application_id', params.id)
      .is('cancelled_at', null)
    const holds = holdsQuery.data
    if (holds?.length) {
      return NextResponse.json({ application, pending_holds: holds })
    }
  }

  return NextResponse.json({ application })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  await prisma.portalApplication.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
