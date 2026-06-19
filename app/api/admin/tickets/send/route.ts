import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getResend } from '@/lib/email-internal'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ticketId, to, subject, html, type } = await req.json()
  if (!to || !html) return NextResponse.json({ error: 'to and html required' }, { status: 400 })

  const resend = getResend()
  await resend.emails.send({
    from: 'Walz Travels Bookings <bookings@walztravels.com>',
    to,
    subject: subject || `Your ${type || 'Travel'} Confirmation — Walz Travels`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif}</style>
</head><body>${html}</body></html>`,
  })

  if (ticketId) {
    await prisma.ticketRecord.update({
      where: { id: ticketId },
      data:  { sentAt: new Date() },
    })
  }

  return NextResponse.json({ ok: true })
}
