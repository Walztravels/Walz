import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { Resend } from 'resend'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { TicketPDFDocument } from '@/components/admin/TicketPDF'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const BUCKET = 'generated-tickets'

function makeReference(type: string): string {
  const prefix = { flight: 'FLT', hotel: 'HTL', tour: 'TUR', transfer: 'TRF', visa: 'VSA', package: 'PKG' }
  const code = prefix[type as keyof typeof prefix] ?? 'TKT'
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `WLZ-${code}-${rand}`
}

function emailSubject(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'flight':   return `✈️ Your Flight Ticket — ${data.from_city ?? ''} → ${data.to_city ?? ''} — Ref: ${data.ticket_reference}`
    case 'hotel':    return `🏨 Your Hotel Voucher — ${data.hotel_name ?? ''} — Ref: ${data.ticket_reference}`
    case 'tour':     return `🗺️ Your Tour Confirmation — ${data.tour_name ?? ''} — Ref: ${data.ticket_reference}`
    case 'transfer': return `🚗 Your Transfer Voucher — Ref: ${data.ticket_reference}`
    case 'visa':     return `📋 Your Visa Appointment — ${data.visa_type ?? ''} — Ref: ${data.ticket_reference}`
    case 'package':  return `📦 Your Holiday Package — ${data.destination ?? ''} — Ref: ${data.ticket_reference}`
    default:         return `Your Travel Document — Ref: ${data.ticket_reference}`
  }
}

const TYPE_ICONS: Record<string, string> = {
  flight: '✈️', hotel: '🏨', tour: '🗺️', transfer: '🚗', visa: '📋', package: '📦',
}
const TYPE_LABELS: Record<string, string> = {
  flight: 'Flight Ticket', hotel: 'Hotel Voucher', tour: 'Tour Confirmation',
  transfer: 'Transfer Voucher', visa: 'Visa Appointment', package: 'Holiday Package',
}

function keyDetails(type: string, d: Record<string, unknown>): string {
  switch (type) {
    case 'flight':
      return `${d.from_city ?? ''} → ${d.to_city ?? ''}  ·  ${d.airline ?? ''}  ·  ${d.departure_date ?? ''} ${d.departure_time ?? ''}`
    case 'hotel':
      return `${d.hotel_name ?? ''}  ·  Check-in: ${d.checkin_date ?? ''}  ·  Check-out: ${d.checkout_date ?? ''}`
    case 'tour':
      return `${d.tour_name ?? ''}  ·  ${d.tour_date ?? ''} at ${d.tour_time ?? ''}  ·  Meet at: ${d.meeting_point ?? ''}`
    case 'transfer':
      return `${d.pickup_location ?? ''} → ${d.dropoff_location ?? ''}  ·  ${d.pickup_date ?? ''} ${d.pickup_time ?? ''}`
    case 'visa':
      return `${d.visa_type ?? ''}  ·  ${d.appointment_date ?? ''} at ${d.appointment_time ?? ''}`
    case 'package':
      return `${d.package_name ?? ''}  ·  ${d.destination ?? ''}  ·  ${d.travel_from ?? ''} → ${d.travel_to ?? ''}`
    default:
      return ''
  }
}

/**
 * POST /api/admin/ticket-generator/send
 * Generates PDF, stores it, saves record, sends branded email with attachment.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !body.ticket_type || !body.client_email) {
    return NextResponse.json({ error: 'ticket_type and client_email are required' }, { status: 400 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'Email service not configured' }, { status: 503 })

  // Use existing reference if re-sending, else generate new
  const reference = (body.ticket_reference as string | undefined) ?? makeReference(body.ticket_type as string)
  const ticketData = { ...body, ticket_reference: reference }
  const type = body.ticket_type as string

  // ── Generate PDF ───────────────────────────────────────────────────────────
  let pdfBuffer: Buffer
  try {
    const el = React.createElement(TicketPDFDocument, { data: ticketData as Parameters<typeof TicketPDFDocument>[0]['data'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(el as any)
  } catch (err) {
    console.error('[ticket-generator/send] PDF error:', err)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }

  // ── Upload to Supabase Storage ─────────────────────────────────────────────
  const now   = new Date()
  const path  = `tickets/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${reference}.pdf`
  let pdfUrl: string | null = null
  try {
    await supabase.storage.from(BUCKET).upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true })
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    pdfUrl = data?.publicUrl ?? null
  } catch { /* non-fatal */ }

  // ── Upsert DB record ───────────────────────────────────────────────────────
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO generated_tickets (
        ticket_reference, client_id, client_name, client_email,
        ticket_type, ticket_data, pdf_url,
        sent_to_client, sent_at, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,true,now(),$8)
      ON CONFLICT (ticket_reference) DO UPDATE SET
        pdf_url        = EXCLUDED.pdf_url,
        sent_to_client = true,
        sent_at        = now()
    `,
      reference,
      body.client_id ?? null,
      body.client_name ?? null,
      body.client_email,
      type,
      JSON.stringify(ticketData),
      pdfUrl,
      session.email,
    )
  } catch (err) {
    console.error('[ticket-generator/send] DB error:', err)
  }

  // ── Build and send email ───────────────────────────────────────────────────
  const name    = (body.client_name as string | undefined) ?? 'Valued Client'
  const message = (body.message as string | undefined) ??
    `Dear ${name}, please find your ${TYPE_LABELS[type] ?? type} confirmation attached. Contact us anytime on WhatsApp if you need assistance.`
  const details = keyDetails(type, ticketData as Record<string, unknown>)
  const icon    = TYPE_ICONS[type] ?? '📄'
  const label   = TYPE_LABELS[type] ?? 'Travel Document'

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff">
      <!-- Header -->
      <div style="background:#0B1F3A;border-radius:12px;padding:28px 32px;margin-bottom:24px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px">WALZ TRAVELS</div>
            <div style="color:#C9A84C;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:2px">YOUR JOURNEY. OUR EXPERTISE.</div>
          </div>
          <div style="background:#C9A84C;color:#0B1F3A;font-size:10px;font-weight:700;padding:6px 12px;border-radius:6px">
            ${icon} ${label.toUpperCase()}
          </div>
        </div>
      </div>
      <!-- Gold bar -->
      <div style="height:3px;background:#C9A84C;border-radius:2px;margin-bottom:28px"></div>

      <!-- Greeting -->
      <p style="font-size:16px;color:#0B1F3A;margin:0 0 8px">Hi ${name},</p>
      <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.6">${message}</p>

      <!-- Reference badge -->
      <div style="background:#F7F4EF;border:1px solid #E8D98B;border-radius:10px;padding:16px 20px;margin-bottom:24px">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Reference Number</div>
        <div style="font-size:20px;font-weight:800;color:#0B1F3A;letter-spacing:1px">${reference}</div>
        ${details ? `<div style="font-size:12px;color:#666;margin-top:6px">${details}</div>` : ''}
      </div>

      <!-- Download button -->
      ${pdfUrl ? `
      <div style="text-align:center;margin:28px 0">
        <a href="${pdfUrl}"
           style="display:inline-block;padding:14px 32px;background:#C9A84C;color:#0B1F3A;text-decoration:none;font-weight:800;border-radius:10px;font-size:14px">
          📥 Download Your ${label}
        </a>
      </div>` : ''}

      <!-- Attachment note -->
      <p style="font-size:13px;color:#666;text-align:center;margin-bottom:28px">
        Your document is also attached to this email as a PDF. Please save it for your records.
      </p>

      <!-- WhatsApp CTA -->
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:16px 20px;text-align:center">
        <p style="font-size:13px;color:#166534;margin:0 0 12px;font-weight:600">Need help? Chat with Jade — Walz Travels AI</p>
        <a href="https://wa.me/447398753797?text=Hi! I have a question about my booking ${reference}"
           style="display:inline-block;padding:10px 24px;background:#16A34A;color:#fff;text-decoration:none;font-weight:700;border-radius:8px;font-size:13px">
          💬 WhatsApp Jade Now
        </a>
      </div>

      <!-- Footer -->
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #E5E7EB">
        <p style="font-size:11px;color:#9CA3AF;text-align:center;margin:0">
          Walz Travels Ltd · contact@walztravels.com · walztravels.com<br>
          WhatsApp UK: +44 7398 753797 · WhatsApp Canada: +1 555 710 7823<br>
          <br>
          Powered by Jade — Walz Travels AI
        </p>
      </div>
    </div>
  `

  const resend  = new Resend(resendKey)
  const subject = emailSubject(type, ticketData as Record<string, unknown>)
  const filename = `WALZ-${type.toUpperCase()}-${reference}-${String(name).replace(/\s+/g, '-')}.pdf`

  try {
    await resend.emails.send({
      from:        'Walz Travels <contact@walztravels.com>',
      to:          body.client_email as string,
      subject,
      html,
      attachments: [{
        filename,
        content: pdfBuffer.toString('base64'),
      }],
    })
  } catch (err) {
    console.error('[ticket-generator/send] Resend error:', err)
    return NextResponse.json({ error: 'PDF generated but email failed to send' }, { status: 500 })
  }

  return NextResponse.json({
    success:          true,
    ticket_reference: reference,
    pdf_url:          pdfUrl,
    sent_to:          body.client_email,
  })
}
