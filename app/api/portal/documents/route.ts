import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'


export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const applicationId = searchParams.get('applicationId')

  const documents = await prisma.portalDocument.findMany({
    where: { userId: user.id, ...(applicationId ? { applicationId } : {}) },
    include: { application: { select: { title: true, refNumber: true } } },
    orderBy: { uploadedAt: 'desc' },
  })

  return NextResponse.json({ documents })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body?.applicationId || !body?.name || !body?.fileUrl) {
    return NextResponse.json({ error: 'applicationId, name, fileUrl required' }, { status: 400 })
  }

  // Verify the application belongs to this user
  const application = await prisma.portalApplication.findFirst({
    where: { id: body.applicationId, userId: user.id },
  })
  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const document = await prisma.portalDocument.create({
    data: {
      applicationId: body.applicationId,
      userId:        user.id,
      name:          body.name,
      category:      body.category ?? 'General',
      fileUrl:       body.fileUrl,
      fileKey:       body.fileKey ?? body.fileUrl,
      fileSize:      body.fileSize ?? null,
      mimeType:      body.mimeType ?? null,
    },
  })

  // Notify Glory
  try {
    await getResend().emails.send({
      from:    'Walz Travels Portal <noreply@walztravels.com>',
      to:      'contact@walztravels.com',
      subject: `New Document Upload — ${user.name ?? user.email} · ${application.refNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <div style="background: #0A1628; padding: 20px; text-align: center;">
            <img src="https://www.walztravels.com/walz-logo.png" alt="Walz Travels" style="height: 40px;" />
          </div>
          <div style="background: #F7F4EF; padding: 30px;">
            <h2 style="color: #0A1628;">New Document Uploaded</h2>
            <p><strong>Client:</strong> ${user.name ?? user.email}</p>
            <p><strong>Application:</strong> ${application.title} (${application.refNumber})</p>
            <p><strong>Document:</strong> ${body.name}</p>
            <p><strong>Category:</strong> ${body.category ?? 'General'}</p>
            <div style="margin-top: 20px;">
              <a href="https://www.walztravels.com/admin/clients" style="background: #0A1628; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Review in Admin</a>
            </div>
          </div>
        </div>
      `,
    })
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ document }, { status: 201 })
}
