import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getResend } from '@/lib/resend'
import prisma from '@/lib/db'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const to      = (form.get('to')      as string | null) ?? ''
  const subject = (form.get('subject') as string | null) ?? ''
  const body    = (form.get('body')    as string | null) ?? ''

  if (!to || !subject || !body) {
    return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 422 })
  }

  // Collect attachments
  const attachments: { filename: string; content: Buffer }[] = []
  for (const [key, value] of form.entries()) {
    if (key.startsWith('attachment_') && value instanceof File && value.size > 0) {
      const buf = Buffer.from(await value.arrayBuffer())
      attachments.push({ filename: value.name, content: buf })
    }
  }

  try {
    await getResend().emails.send({
      from:    'Walz Travels <noreply@walztravels.com>',
      to,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px;">
          <div style="background: #0A1628; padding: 20px; text-align: center;">
            <img src="https://www.walztravels.com/walz-logo.png" alt="Walz Travels" style="height: 40px;" />
          </div>
          <div style="background: #F7F4EF; padding: 30px; white-space: pre-wrap; line-height: 1.6; color: #1a1a1a; font-size: 14px;">
            ${body.replace(/\n/g, '<br/>')}
          </div>
          <div style="background: #0A1628; padding: 14px; text-align: center;">
            <p style="color: #C9A84C; font-size: 11px; margin: 0;">Walz Travels · Expert Visas, Flights & Tours</p>
            <p style="color: #ffffff60; font-size: 10px; margin: 4px 0 0;">+44 7904 925 153 · contact@walztravels.com</p>
          </div>
        </div>
      `,
      ...(attachments.length > 0 ? { attachments } : {}),
    })
  } catch (e) {
    console.error('[email-client] Resend error:', e)
    return NextResponse.json({ error: 'Failed to send email — please try again' }, { status: 500 })
  }

  // Log note
  await prisma.visaApplicationNote.create({
    data: {
      applicationId: params.id,
      authorName: session.name ?? session.email,
      content: `Email sent to ${to} — Subject: "${subject}"${attachments.length > 0 ? ` · ${attachments.length} attachment(s): ${attachments.map(a => a.filename).join(', ')}` : ''}`,
    },
  })

  return NextResponse.json({ ok: true })
}
