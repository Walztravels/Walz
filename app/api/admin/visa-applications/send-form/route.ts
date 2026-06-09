import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { generateVisaRef, ISO2_TO_SLUG } from '@/lib/visa-config'
import { sendApplicationFormLink } from '@/lib/email-visa'

async function isAdmin() {
  return !!cookies().get('admin_token')?.value
}

// POST /api/admin/visa-applications/send-form
// Create a new draft application (admin-initiated) + token, then email the client
export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { clientEmail, clientName, destinationIso2, visaType, personalMessage } = await req.json()

  if (!clientEmail || !destinationIso2) {
    return NextResponse.json({ error: 'clientEmail and destinationIso2 required' }, { status: 400 })
  }

  // Unique reference
  let referenceNumber = generateVisaRef()
  for (let i = 0; i < 5; i++) {
    const existing = await prisma.visaApplication.findUnique({ where: { referenceNumber } })
    if (!existing) break
    referenceNumber = generateVisaRef()
  }

  const nameParts = (clientName ?? '').trim().split(/\s+/)

  // Create draft — no user account required for admin-initiated
  const application = await prisma.visaApplication.create({
    data: {
      referenceNumber,
      destinationIso2: destinationIso2.toUpperCase(),
      visaType: visaType || 'tourist',
      email: clientEmail,
      firstName: nameParts[0] || null,
      lastName: nameParts.slice(1).join(' ') || null,
      status: 'draft',
      isDraft: true,
      initiatedBy: 'admin',
    },
  })

  // Token — 7 day expiry
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const tokenRecord = await prisma.visaApplicationToken.create({
    data: {
      applicationId: application.id,
      clientEmail,
      clientName: clientName || 'Client',
      expiresAt,
    },
  })

  // Form URL with token
  const slug = ISO2_TO_SLUG[application.destinationIso2] ?? application.destinationIso2.toLowerCase()
  const formUrl = `https://walztravels.com/visa/apply/${slug}?token=${tokenRecord.token}&draft=${application.id}`

  // Email client
  try {
    await sendApplicationFormLink(application, clientEmail, clientName || 'Client', personalMessage, formUrl)
  } catch (e) {
    console.error('Form link email failed:', e)
  }

  return NextResponse.json({ application, token: tokenRecord.token, link: formUrl }, { status: 201 })
}
