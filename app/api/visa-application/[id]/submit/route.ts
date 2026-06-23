import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendVisaAdminNotification } from '@/lib/email-visa'
import { ensureClientAccount } from '@/lib/create-client-account'

// POST /api/visa-application/[id]/submit
// Token-based submission — no payment (admin-initiated flow)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { token } = await req.json()

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const tokenRecord = await prisma.visaApplicationToken.findUnique({ where: { token } })
  if (!tokenRecord) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  if (tokenRecord.used) return NextResponse.json({ error: 'This link has already been used' }, { status: 410 })
  if (new Date() > tokenRecord.expiresAt) return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  if (tokenRecord.applicationId !== params.id) return NextResponse.json({ error: 'Token mismatch' }, { status: 403 })

  // Mark as received, admin-initiated
  const application = await prisma.visaApplication.update({
    where: { id: params.id },
    data: {
      status: 'received',
      isDraft: false,
      initiatedBy: 'admin',
      updatedAt: new Date(),
    },
  })

  // Invalidate token
  await prisma.visaApplicationToken.update({
    where: { token },
    data: { used: true },
  })

  // Notify admin
  try {
    await sendVisaAdminNotification(application, 'admin')
  } catch (e) {
    console.error('Admin notification failed:', e)
  }

  // Auto-create client portal account (never breaks submission if it fails)
  if (application.email) {
    const fullName = [application.firstName, application.lastName].filter(Boolean).join(' ') || 'Client'
    await ensureClientAccount({ email: application.email, name: fullName, phone: application.phone ?? null, applicationId: application.id })
  }

  return NextResponse.json({ application, referenceNumber: application.referenceNumber })
}
