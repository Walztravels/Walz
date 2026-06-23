import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import prisma from '@/lib/db'
import { sendVisaStatusUpdateEmail } from '@/lib/email-visa'

const BASE_URL = 'https://walztravels.com'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id }           = await params
  const { status, message } = await req.json() as { status: string; message?: string }

  if (!status) return NextResponse.json({ error: 'status required' }, { status: 400 })

  const app = await prisma.visaApplication.findUnique({ where: { id } })
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const statusMessage = message ?? statusDefaultMessage(status)
  const now           = new Date().toISOString()
  const existingTimeline = Array.isArray(app.timeline) ? app.timeline as object[] : []
  const newEntry      = { status, date: now, message: statusMessage }

  await prisma.visaApplication.update({
    where: { id },
    data: {
      status,
      statusMessage,
      timeline:  [...existingTimeline, newEntry],
      updatedAt: new Date(),
    },
  })

  // Send email notification to client
  const clientEmail = app.email
  const clientName  = [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Client'

  if (clientEmail) {
    try {
      await sendVisaStatusUpdateEmail({
        to:          clientEmail,
        name:        clientName,
        reference:   app.referenceNumber,
        destination: app.destinationIso2,
        newStatus:   status,
        message:     statusMessage,
        trackingUrl: `${BASE_URL}/track/${app.referenceNumber}`,
      })
    } catch (e) {
      console.error('[visa/status] Email failed:', e)
    }
  }

  return NextResponse.json({ success: true, status, message: statusMessage })
}

function statusDefaultMessage(status: string): string {
  const messages: Record<string, string> = {
    received:             'We have received your application and will begin reviewing it shortly.',
    documents_pending:    'We need additional documents from you. Please check your email for the full list.',
    under_review:         'Your documents are under review by our visa team.',
    ready_to_submit:      'Your application is complete and ready for embassy submission.',
    submitted_to_embassy: 'Your application has been submitted to the embassy. Processing typically takes 3–8 weeks.',
    decision_pending:     'The embassy is processing your application. A decision is expected soon.',
    approved:             'Congratulations — your visa application has been approved! We will contact you with next steps.',
    refused:              'We are sorry to inform you that your application was refused. Our team will contact you to discuss your options.',
  }
  return messages[status] ?? `Your application status has been updated to: ${status}`
}
