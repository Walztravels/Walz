import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getResend } from '@/lib/email-internal'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, subject, html, type } = await req.json()
  if (!to || !html) return NextResponse.json({ error: 'to and html required' }, { status: 400 })

  const resend = getResend()
  await resend.emails.send({
    from: 'Walz Travels <bookings@walztravels.com>',
    to,
    subject: subject || `Your ${type || 'Travel'} Confirmation — Walz Travels`,
    html,
  })

  return NextResponse.json({ ok: true })
}
