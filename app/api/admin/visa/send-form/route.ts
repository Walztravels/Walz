import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import prisma from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateVisaReference } from '@/lib/visa-reference'
import { sendClientWelcomeEmail, sendVisaTrackingEmail } from '@/lib/email-visa'
import bcrypt from 'bcryptjs'

const BASE_URL = 'https://walztravels.com'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    clientEmail:   string
    clientName:    string
    clientPhone?:  string
    destination:   string
    visaType?:     string
    assignedTo?:   string
  }

  const { clientEmail, clientName, clientPhone, destination, visaType, assignedTo } = body
  if (!clientEmail || !clientName || !destination) {
    return NextResponse.json({ error: 'clientEmail, clientName and destination are required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // ── 1. Find or create ClientAccount ─────────────────────────────────────────
  const { data: existing } = await supabase
    .from('ClientAccount')
    .select('id')
    .eq('email', clientEmail.toLowerCase())
    .maybeSingle()

  let clientId: string = existing?.id as string
  let clientCreated    = false

  if (!clientId) {
    const tempPassword = Math.random().toString(36).substring(2, 10)
    const passwordHash = await bcrypt.hash(tempPassword, 10)

    const { data: newClient, error: createErr } = await supabase
      .from('ClientAccount')
      .insert({
        email:        clientEmail.toLowerCase(),
        name:         clientName,
        phone:        clientPhone ?? null,
        passwordHash,
        isVerified:   false,
      })
      .select('id')
      .single()

    if (createErr || !newClient) {
      return NextResponse.json({ error: 'Failed to create client account' }, { status: 500 })
    }

    clientId     = newClient.id as string
    clientCreated = true

    // Send welcome email with temp password
    try {
      await sendClientWelcomeEmail({
        to:          clientEmail,
        name:        clientName,
        tempPassword,
        loginUrl:    `${BASE_URL}/my-account`,
      })
    } catch (e) {
      console.error('[send-form] Welcome email failed:', e)
    }
  }

  // ── 2. Create VisaApplication record ─────────────────────────────────────────
  const reference = generateVisaReference()
  const now       = new Date().toISOString()

  const app = await prisma.visaApplication.create({
    data: {
      referenceNumber: reference,
      destinationIso2: destination,
      visaType:        visaType ?? 'tourist',
      email:           clientEmail,
      clientAccountId: clientId,
      status:          'received',
      statusMessage:   'We have received your application. Our team will begin reviewing your documents shortly.',
      timeline:        [{ status: 'received', date: now, message: 'Application received by Walz Travels' }],
      isDraft:         false,
      initiatedBy:     'admin',
      assignedTo:      assignedTo ?? null,
    },
  })

  // ── 3. Send tracking email to client ────────────────────────────────────────
  try {
    await sendVisaTrackingEmail({
      to:          clientEmail,
      name:        clientName,
      reference,
      destination,
      trackingUrl: `${BASE_URL}/track/${reference}`,
    })
  } catch (e) {
    console.error('[send-form] Tracking email failed:', e)
  }

  return NextResponse.json({
    success:       true,
    reference,
    applicationId: app.id,
    clientCreated,
  })
}
