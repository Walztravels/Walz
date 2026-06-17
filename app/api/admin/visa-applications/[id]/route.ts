import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendVisaStatusUpdate, sendApplicationFormLink } from '@/lib/email-visa'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

type Params = { params: Promise<{ id: string }> }

// GET /api/admin/visa-applications/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params

  const app = await prisma.visaApplication.findUnique({
    where: { id },
    include: {
      user:   { select: { name: true, email: true } },
      notes:  { orderBy: { createdAt: 'desc' } },
      tokens: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch bank_statement_* columns — added via raw SQL, not in Prisma schema
  const { data: bankData } = await getSupabaseAdmin()
    .from('visa_applications')
    .select('bank_statement_url, bank_statement_admin_url, bank_statement_analysis, bank_statement_analyzed_at, bank_statement_uploaded_by')
    .eq('id', id)
    .single()

  return NextResponse.json({
    application: {
      ...app,
      bank_statement_url:         bankData?.bank_statement_url        ?? null,
      bank_statement_admin_url:   bankData?.bank_statement_admin_url  ?? null,
      bank_statement_analysis:    bankData?.bank_statement_analysis   ?? null,
      bank_statement_analyzed_at: bankData?.bank_statement_analyzed_at ?? null,
      bank_statement_uploaded_by: bankData?.bank_statement_uploaded_by ?? null,
    },
  })
}

// PATCH /api/admin/visa-applications/[id] — update any field including status
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { _addNote, _sendFormLink, ...fields } = body

  // Handle "send form link to client" action
  if (_sendFormLink) {
    const { clientEmail, clientName, personalMessage } = _sendFormLink
    const app = await prisma.visaApplication.findUnique({ where: { id } })
    if (app && clientEmail) {
      try { await sendApplicationFormLink(app, clientEmail, clientName, personalMessage) } catch (e) { console.error(e) }
    }
    return NextResponse.json({ ok: true })
  }

  const dateFields = [
    'dateOfBirth', 'passportIssueDate', 'passportExpiryDate',
    'arrivalDate', 'returnDate', 'submissionDate', 'decisionDate',
  ]
  const data: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    if (key === 'id' || key === 'userId' || key === 'referenceNumber') continue
    if (dateFields.includes(key)) {
      data[key] = value ? new Date(value as string) : null
    } else {
      data[key] = value
    }
  }

  // When status changes to 'received', ensure isDraft=false
  if (data.status) {
    if (data.status !== 'draft') data.isDraft = false
  }

  const updated = await prisma.visaApplication.update({
    where: { id },
    data: { ...data, updatedAt: new Date() },
    include: {
      user:   { select: { name: true, email: true } },
      tokens: { orderBy: { createdAt: 'desc' } },
    },
  })

  // If status changed, send email notification to client
  if (fields.status && fields.status !== 'draft') {
    const emailTo = updated.email ?? updated.user?.email
    if (emailTo) {
      try {
        await sendVisaStatusUpdate({ ...updated, email: emailTo })
      } catch (e) {
        console.error('[VisaStatus] Email failed:', e)
      }
    }
  }

  return NextResponse.json({ application: updated })
}
