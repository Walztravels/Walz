import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const leadSchema = z.object({
  name:        z.string().min(2).max(120),
  email:       z.string().email().optional().or(z.literal('')),
  whatsapp:    z.string().min(7).max(30),
  service:     z.enum([
    'Visa Processing',
    'Flight Booking',
    'Holiday Package',
    'Group Travel',
    'Corporate Travel',
    'Hotel Only',
    'Other',
  ]),
  destination: z.string().max(120).optional(),
  travelDate:  z.string().max(50).optional(),
  details:     z.string().max(2000).optional(),
  source:      z.string().max(50).optional().default('homepage'),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = leadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const data = parsed.data

  // Save to DB
  const lead = await prisma.lead.create({
    data: {
      name:        data.name,
      email:       data.email || null,
      whatsapp:    data.whatsapp,
      service:     data.service,
      destination: data.destination || null,
      travelDate:  data.travelDate || null,
      details:     data.details || null,
      source:      data.source ?? 'homepage',
      status:      'New',
    },
  })

  // Email notification to admin
  try {
    await resend.emails.send({
      from:    'Walz Travels <noreply@walztravels.com>',
      to:      'contact@walztravels.com',
      subject: `New Lead: ${data.service} — ${data.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0A1628; padding: 20px; text-align: center;">
            <img src="https://www.walztravels.com/walz-logo.png" alt="Walz Travels" style="height: 40px;" />
          </div>
          <div style="background: #F7F4EF; padding: 30px;">
            <h2 style="color: #0A1628; margin: 0 0 20px;">New Lead Submission</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #8B9BAE; font-size: 14px; width: 140px;">Name</td><td style="padding: 8px 0; color: #0A1628; font-weight: 600;">${data.name}</td></tr>
              <tr><td style="padding: 8px 0; color: #8B9BAE; font-size: 14px;">WhatsApp</td><td style="padding: 8px 0; color: #0A1628; font-weight: 600;">${data.whatsapp}</td></tr>
              <tr><td style="padding: 8px 0; color: #8B9BAE; font-size: 14px;">Email</td><td style="padding: 8px 0; color: #0A1628;">${data.email || '—'}</td></tr>
              <tr><td style="padding: 8px 0; color: #8B9BAE; font-size: 14px;">Service</td><td style="padding: 8px 0;"><span style="background: #C9A84C; color: #0A1628; padding: 2px 10px; border-radius: 12px; font-size: 13px; font-weight: 700;">${data.service}</span></td></tr>
              <tr><td style="padding: 8px 0; color: #8B9BAE; font-size: 14px;">Destination</td><td style="padding: 8px 0; color: #0A1628;">${data.destination || '—'}</td></tr>
              <tr><td style="padding: 8px 0; color: #8B9BAE; font-size: 14px;">Travel Date</td><td style="padding: 8px 0; color: #0A1628;">${data.travelDate || '—'}</td></tr>
              <tr><td style="padding: 8px 0; color: #8B9BAE; font-size: 14px;">Source</td><td style="padding: 8px 0; color: #0A1628;">${data.source}</td></tr>
              <tr><td style="padding: 8px 0; color: #8B9BAE; font-size: 14px;">Details</td><td style="padding: 8px 0; color: #0A1628;">${data.details || '—'}</td></tr>
            </table>
            <div style="margin-top: 24px; text-align: center;">
              <a href="https://www.walztravels.com/admin/leads" style="background: #0A1628; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">View in Admin CRM</a>
            </div>
          </div>
        </div>
      `,
    })
  } catch {
    // Non-fatal — lead is saved, email failed
    console.error('Lead email notification failed')
  }

  return NextResponse.json({ success: true, id: lead.id }, { status: 201 })
}
