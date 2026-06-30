import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendVisaAdminNotification, sendVisaApplicationConfirmation } from '@/lib/email-visa'
import { ensureClientAccount } from '@/lib/create-client-account'
import { ensurePortalAccount } from '@/lib/portal-account'

// POST /api/visa-application/[id]/client-submit
// Client-initiated manual submission (no payment required — e.g. unsupported destination)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const existing = await prisma.visaApplication.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const source: string = body.source ?? 'manual'

  const countrySpecific = (typeof existing.countrySpecific === 'object' && existing.countrySpecific !== null
    ? existing.countrySpecific
    : {}) as Record<string, unknown>

  const application = await prisma.visaApplication.update({
    where: { id: params.id },
    data: {
      status: 'received',
      isDraft: false,
      initiatedBy: 'client',
      countrySpecific: { ...countrySpecific, source },
      updatedAt: new Date(),
    },
  })

  try { await sendVisaAdminNotification(application, 'client') } catch { /* non-fatal */ }
  try { await sendVisaApplicationConfirmation(application) } catch { /* non-fatal */ }

  // Auto-create client portal account (never breaks submission if it fails)
  const email = application.email ?? session.user.email
  if (email) {
    const fullName = [application.firstName, application.lastName].filter(Boolean).join(' ') || session.user.name || 'Client'
    await ensureClientAccount({ email, name: fullName, phone: application.phone ?? null, applicationId: application.id })
    await ensurePortalAccount(
      email,
      fullName,
      application.referenceNumber,
      `${application.visaType} Visa Application`,
    ).catch(() => {})
  }

  return NextResponse.json({ referenceNumber: application.referenceNumber })
}
