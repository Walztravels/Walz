import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/visa-application/verify-token?t=[token]
// No auth required — validates a form-link token and returns the application
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t')
  if (!token) return NextResponse.json({ valid: false, error: 'Token required' }, { status: 400 })

  const record = await prisma.visaApplicationToken.findUnique({
    where: { token },
    include: { application: true },
  })

  if (!record) return NextResponse.json({ valid: false, error: 'Invalid link. Please contact Walz Travels for a new form link.' }, { status: 404 })
  if (record.used) return NextResponse.json({ valid: false, error: 'This form link has already been submitted. Contact Walz Travels if you need to make changes.' }, { status: 410 })
  if (new Date() > record.expiresAt) return NextResponse.json({ valid: false, error: 'This link expired after 7 days. Please contact Walz Travels for a new link.' }, { status: 410 })

  return NextResponse.json({
    valid: true,
    clientEmail: record.clientEmail,
    clientName: record.clientName,
    application: record.application,
  })
}
