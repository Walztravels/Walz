import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'


export async function GET(request: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const stage  = searchParams.get('stage')
  const userId = searchParams.get('userId')
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit  = 50

  const where: Record<string, unknown> = {}
  if (stage)  where.stage  = stage
  if (userId) where.userId = userId

  const [applications, total] = await Promise.all([
    prisma.portalApplication.findMany({
      where,
      include: {
        user:      { select: { name: true, email: true } },
        documents: { select: { id: true, status: true } },
        payments:  { select: { id: true, amount: true, status: true } },
        checklist: { select: { id: true, completedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.portalApplication.count({ where }),
  ])

  return NextResponse.json({ applications, total, page })
}

export async function POST(request: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.userId || !body?.title) {
    return NextResponse.json({ error: 'userId and title required' }, { status: 400 })
  }

  const refNumber = `WZ-${Date.now().toString(36).toUpperCase()}`

  const application = await prisma.portalApplication.create({
    data: {
      userId:      body.userId,
      refNumber,
      title:       body.title,
      type:        body.type ?? 'OTHER',
      stage:       body.stage ?? 'ENQUIRY',
      destination: body.destination ?? null,
      travelDate:  body.travelDate ?? null,
      notes:       body.notes ?? null,
      adminNotes:  body.adminNotes ?? null,
      amount:      body.amount ?? null,
    },
    include: { user: { select: { name: true, email: true } } },
  })

  // Add default checklist items if type is VISA
  if (body.type === 'VISA' && body.checklistItems?.length) {
    await prisma.checklistItem.createMany({
      data: body.checklistItems.map((label: string, i: number) => ({
        applicationId: application.id,
        label,
        order: i,
      })),
    })
  }

  // Notify client
  try {
    if (application.user?.email) {
      await getResend().emails.send({
        from:    'Walz Travels <noreply@walztravels.com>',
        to:      application.user.email,
        subject: `Application Created — ${application.title} (${refNumber})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <div style="background: #0A1628; padding: 20px; text-align: center;">
              <img src="https://www.walztravels.com/walz-logo.png" alt="Walz Travels" style="height: 40px;" />
            </div>
            <div style="background: #F7F4EF; padding: 30px;">
              <h2 style="color: #0A1628;">Your application has been created</h2>
              <p>Hi ${application.user.name ?? 'there'},</p>
              <p>Your application <strong>${application.title}</strong> has been set up in your Walz Travels client portal.</p>
              <p><strong>Reference:</strong> ${refNumber}</p>
              <p>Log in to your portal to view progress, upload documents, and track your application.</p>
              <div style="margin-top: 24px; text-align: center;">
                <a href="https://www.walztravels.com/portal/dashboard" style="background: #0A1628; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">View My Application</a>
              </div>
            </div>
          </div>
        `,
      })
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({ application }, { status: 201 })
}
