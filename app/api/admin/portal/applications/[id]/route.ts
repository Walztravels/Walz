import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { Resend } from 'resend'
import { z } from 'zod'

const resend = new Resend(process.env.RESEND_API_KEY)

const updateSchema = z.object({
  stage:      z.enum(['ENQUIRY', 'DOCUMENTS_PENDING', 'DOCUMENTS_RECEIVED', 'PROCESSING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED']).optional(),
  adminNotes: z.string().optional(),
  amount:     z.number().optional(),
  amountPaid: z.number().optional(),
}).partial()

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

  // Email client on stage change
  if (parsed.data.stage && parsed.data.stage !== prev.stage && application.user?.email) {
    const STAGE_LABELS: Record<string, string> = {
      ENQUIRY: 'Enquiry Received', DOCUMENTS_PENDING: 'Documents Pending',
      DOCUMENTS_RECEIVED: 'Documents Received', PROCESSING: 'In Processing',
      SUBMITTED: 'Submitted', APPROVED: 'Approved ✅', REJECTED: 'Rejected',
      COMPLETED: 'Completed',
    }
    try {
      await resend.emails.send({
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

  return NextResponse.json({ application })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  await prisma.portalApplication.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
