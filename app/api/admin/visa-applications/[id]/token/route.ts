import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { sendApplicationFormLink } from '@/lib/email-visa'
import { ISO2_TO_SLUG } from '@/lib/visa-config'

async function isAdmin() {
  return !!cookies().get('admin_token')?.value
}

// POST /api/admin/visa-applications/[id]/token
// Generate a form-link token for an existing draft and email it to the client
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { clientEmail, clientName, personalMessage } = await req.json()
  if (!clientEmail) return NextResponse.json({ error: 'clientEmail required' }, { status: 400 })

  const application = await prisma.visaApplication.findUnique({ where: { id: params.id } })
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Mark application as admin-initiated and save client email
  await prisma.visaApplication.update({
    where: { id: params.id },
    data: { initiatedBy: 'admin', email: clientEmail },
  })

  // Create token — 7 day expiry
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const tokenRecord = await prisma.visaApplicationToken.create({
    data: {
      applicationId: params.id,
      clientEmail,
      clientName: clientName || 'Client',
      expiresAt,
    },
  })

  // Build form URL with token
  const slug = ISO2_TO_SLUG[application.destinationIso2] ?? application.destinationIso2.toLowerCase()
  const formUrl = `https://walztravels.us/visa/apply/${slug}?token=${tokenRecord.token}&draft=${params.id}`

  // Send email
  try {
    await sendApplicationFormLink(application, clientEmail, clientName || 'Client', personalMessage, formUrl)
  } catch (e) {
    console.error('Form link email failed:', e)
  }

  return NextResponse.json({
    token: tokenRecord.token,
    link: formUrl,
    expiresAt: tokenRecord.expiresAt,
  })
}
