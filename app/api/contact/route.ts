import { NextRequest, NextResponse } from 'next/server'
import { getResend } from '@/lib/resend'

export async function POST(req: NextRequest) {
  const { name, email, phone, subject, message } = await req.json()

  if (!name || !email || !subject || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const resend = getResend()

  await resend.emails.send({
    from: 'Walz Travels <hello@walztravels.com>',
    to: 'contact@walztravels.com',
    replyTo: email,
    subject: `[Walz Contact] ${subject} — ${name}`,
    html: `
      <h2>New Contact Enquiry</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <hr/>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br/>')}</p>
    `,
  })

  await resend.emails.send({
    from: 'Walz Travels <hello@walztravels.com>',
    to: email,
    subject: `We received your enquiry — ${subject}`,
    html: `
      <p>Hi ${name.split(' ')[0]},</p>
      <p>Thank you for reaching out to Walz Travels. We&apos;ve received your enquiry about
      <strong>${subject}</strong> and will respond within 2 hours.</p>
      <p>In the meantime, you can reach us on WhatsApp for urgent matters:
      <strong>+44 7398 753797</strong></p>
      <p>— Walz Travels Team</p>
    `,
  })

  return NextResponse.json({ success: true })
}
