import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { Resend } from 'resend'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { TicketPDFDocument } from '@/components/admin/TicketPDF'
import { FlightTicketPDF } from '@/components/tickets/FlightTicketPDF'
import { generateFlightICS } from '@/lib/generateICS'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { FlightTicketEmailProps, FlightLeg } from '@/types/flight-ticket'

export const dynamic = 'force-dynamic'

const BUCKET = 'generated-tickets'

function makeReference(type: string): string {
  const prefix = { flight: 'FLT', hotel: 'HTL', tour: 'TUR', transfer: 'TRF', visa: 'VSA', package: 'PKG' }
  const code = prefix[type as keyof typeof prefix] ?? 'TKT'
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `WLZ-${code}-${rand}`
}

function emailSubject(type: string, data: Record<string, unknown>): string {
  switch (type) {
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

async function uploadToSupabase(path: string, buffer: Buffer, contentType: string): Promise<string | null> {
  try {
    await getSupabaseAdmin().storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true })
    const { data } = getSupabaseAdmin().storage.from(BUCKET).getPublicUrl(path)
    return data?.publicUrl ?? null
  } catch (err) {
    console.error('[ticket-generator] Supabase upload error:', err)
    return null
  }
}

async function upsertDBRecord(params: {
  reference: string
  clientId?: string | null
  clientName?: string | null
  clientEmail: string
  type: string
  ticketData: Record<string, unknown>
  pdfUrl: string | null
  createdBy: string
}) {
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
      params.reference,
      params.clientId ?? null,
      params.clientName ?? null,
      params.clientEmail,
      params.type,
      JSON.stringify(params.ticketData),
      params.pdfUrl,
      params.createdBy,
    )
  } catch (err) {
    console.error('[ticket-generator] DB upsert error:', err)
  }
}

/**
 * POST /api/admin/ticket-generator/send
 * Generates PDF, stores it, saves record, sends branded email with attachments.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !body.ticket_type || !body.client_email) {
    return NextResponse.json({ error: 'ticket_type and client_email are required' }, { status: 400 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'Email service not configured (RESEND_API_KEY missing)' }, { status: 503 })

  const reference  = (body.ticket_reference as string | undefined) ?? makeReference(body.ticket_type as string)
  const ticketData = { ...body, ticket_reference: reference }
  const type       = body.ticket_type as string
  const name       = (body.client_name as string | undefined) ?? 'Valued Client'
  const resend     = new Resend(resendKey)
  const now        = new Date()

  const pathBase = `tickets/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${reference}`

  // ── FLIGHT ──────────────────────────────────────────────────────────────────
  if (type === 'flight' && Array.isArray(body.outbound) && (body.outbound as FlightLeg[]).length > 0) {
    const outbound = body.outbound as FlightLeg[]
    const inbound  = (body.inbound as FlightLeg[] | undefined) ?? []
    const pnr      = (body.pnr as string | undefined) ?? reference

    // Build email props
    const emailProps: FlightTicketEmailProps = {
      reference,
      pnr,
      issueDate:    new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      issuedBy:     session.email ?? 'Walz Travels',
      title:        (body.title        as string | undefined) ?? '',
      firstName:    (body.firstName    as string | undefined) ?? name.split(' ')[0] ?? '',
      lastName:     (body.lastName     as string | undefined) ?? name.split(' ').slice(1).join(' ') ?? '',
      email:        body.client_email  as string,
      phone:        (body.client_phone as string | undefined) ?? '',
      outbound,
      inbound,
      tripType:     (body.tripType as 'one-way' | 'return' | undefined) ?? 'one-way',
      passengers:   (body.passengers   as FlightTicketEmailProps['passengers'] | undefined) ?? [],
      pricing:      body.pricing       as FlightTicketEmailProps['pricing']    | undefined,
      agentMessage: body.message       as string | undefined,
    }

    // ── Generate Emirates-style PDF ──────────────────────────────────────────
    let pdfBuffer: Buffer
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pdfBuffer = await renderToBuffer(React.createElement(FlightTicketPDF, emailProps) as any)
    } catch (err) {
      console.error('[ticket-generator] FlightTicketPDF render error:', err)
      return NextResponse.json({ error: `PDF generation failed: ${String(err)}` }, { status: 500 })
    }

    // ── Upload PDF + ICS ─────────────────────────────────────────────────────
    const pdfUrl = await uploadToSupabase(`${pathBase}.pdf`, pdfBuffer, 'application/pdf')

    const passengerName = [emailProps.firstName, emailProps.lastName].filter(Boolean).join(' ') || name
    const icsContent    = generateFlightICS(outbound, inbound, passengerName, reference, pnr)
    await uploadToSupabase(`${pathBase}.ics`, Buffer.from(icsContent), 'text/calendar')

    // ── Upsert DB ────────────────────────────────────────────────────────────
    await upsertDBRecord({
      reference, clientId: body.client_id as string | null,
      clientName: name, clientEmail: body.client_email as string,
      type, ticketData, pdfUrl, createdBy: session.email ?? 'admin',
    })

    // ── Build HTML email ─────────────────────────────────────────────────────
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { FlightTicketEmail }    = await import('@/components/tickets/FlightTicketEmail')
    const emailHtml = '<!DOCTYPE html>' + renderToStaticMarkup(
      React.createElement(FlightTicketEmail, emailProps)
    )

    const dep            = outbound[0]?.departureCity ?? ''
    const arr            = (outbound[outbound.length - 1] ?? outbound[0])?.arrivalCity ?? ''
    const flightSubject  = `✈️ Flight Confirmation — ${dep} → ${arr} — Ref: ${pnr}`
    const pdfFilename    = `WALZ-FLIGHT-${reference}-${name.replace(/\s+/g, '-')}.pdf`
    const icsFilename    = `WALZ-FLIGHT-${reference}.ics`

    // ── Send email ───────────────────────────────────────────────────────────
    let resendResponse: Awaited<ReturnType<typeof resend.emails.send>>
    try {
      resendResponse = await resend.emails.send({
        from:        'Walz Travels <contact@walztravels.com>',
        to:          body.client_email as string,
        subject:     flightSubject,
        html:        emailHtml,
        attachments: [
          { filename: pdfFilename, content: pdfBuffer.toString('base64') },
          { filename: icsFilename, content: Buffer.from(icsContent).toString('base64') },
        ],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ticket-generator] Resend error (flight):', msg)
      return NextResponse.json({
        error: `Email delivery failed: ${msg}`,
        ticket_reference: reference,
        pdf_url: pdfUrl,
        debug: 'PDF was generated and saved. Check RESEND_API_KEY and domain verification in Resend dashboard.',
      }, { status: 500 })
    }

    // Resend can return an error object without throwing
    if (resendResponse.error) {
      const msg = resendResponse.error.message ?? JSON.stringify(resendResponse.error)
      console.error('[ticket-generator] Resend returned error (flight):', msg)
      return NextResponse.json({
        error: `Email delivery failed: ${msg}`,
        ticket_reference: reference,
        pdf_url: pdfUrl,
        debug: 'PDF was generated and saved. Check RESEND_API_KEY and domain verification in Resend dashboard.',
      }, { status: 500 })
    }

    return NextResponse.json({
      success:          true,
      ticket_reference: reference,
      pdf_url:          pdfUrl,
      sent_to:          body.client_email,
      resend_id:        resendResponse.data?.id,
    })
  }

  // ── GENERIC (hotel / tour / transfer / visa / package) ──────────────────────
  let pdfBuffer: Buffer
  try {
    const el = React.createElement(TicketPDFDocument, { data: ticketData as Parameters<typeof TicketPDFDocument>[0]['data'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(el as any)
  } catch (err) {
    console.error('[ticket-generator] TicketPDFDocument render error:', err)
    return NextResponse.json({ error: `PDF generation failed: ${String(err)}` }, { status: 500 })
  }

  const pdfUrl = await uploadToSupabase(`${pathBase}.pdf`, pdfBuffer, 'application/pdf')

  await upsertDBRecord({
    reference, clientId: body.client_id as string | null,
    clientName: name, clientEmail: body.client_email as string,
    type, ticketData, pdfUrl, createdBy: session.email ?? 'admin',
  })

  const label   = TYPE_LABELS[type]  ?? 'Travel Document'
  const icon    = TYPE_ICONS[type]   ?? '📄'
  const message = (body.message as string | undefined) ??
    `Dear ${name}, please find your ${label} confirmation attached. Contact us anytime on WhatsApp if you need assistance.`
  const details = keyDetails(type, ticketData as Record<string, unknown>)
  const subject = emailSubject(type, ticketData as Record<string, unknown>)
  const filename = `WALZ-${type.toUpperCase()}-${reference}-${name.replace(/\s+/g, '-')}.pdf`

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:0;background:#fff">
      <!-- Header -->
      <div style="background:#0B1F3A;padding:28px 32px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="110" style="display:block;height:auto;" />
              <div style="color:#C9A84C;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:2px">YOUR JOURNEY. OUR EXPERTISE.</div>
            </td>
            <td align="right">
              <div style="background:#C9A84C;color:#0B1F3A;font-size:10px;font-weight:700;padding:6px 12px;border-radius:6px;display:inline-block">${icon} ${label.toUpperCase()}</div>
            </td>
          </tr>
        </table>
      </div>
      <!-- Gold bar -->
      <div style="height:3px;background:#C9A84C"></div>
      <!-- Body -->
      <div style="padding:28px 32px">
        <p style="font-size:16px;color:#0B1F3A;margin:0 0 8px;font-weight:600">Hi ${name},</p>
        <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.6">${message}</p>
        <!-- Reference box -->
        <div style="background:#F7F4EF;border:1px solid #E8D98B;border-radius:10px;padding:16px 20px;margin-bottom:24px">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Reference Number</div>
          <div style="font-size:20px;font-weight:800;color:#0B1F3A;letter-spacing:1px">${reference}</div>
          ${details ? `<div style="font-size:12px;color:#666;margin-top:6px">${details}</div>` : ''}
        </div>
        ${pdfUrl ? `
        <div style="text-align:center;margin:28px 0">
          <a href="${pdfUrl}" style="display:inline-block;padding:14px 32px;background:#C9A84C;color:#0B1F3A;text-decoration:none;font-weight:800;border-radius:10px;font-size:14px">
            📥 Download Your ${label}
          </a>
        </div>` : ''}
        <p style="font-size:13px;color:#666;text-align:center;margin-bottom:28px">
          Your document is also attached to this email as a PDF. Please save it for your records.
        </p>
        <!-- WhatsApp CTA -->
        <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:16px 20px;text-align:center">
          <p style="font-size:13px;color:#166534;margin:0 0 12px;font-weight:600">Need help? Chat with Jade — Walz Travels AI</p>
          <a href="https://wa.me/12317902336?text=Hi! I have a question about my booking ${reference}"
             style="display:inline-block;padding:10px 24px;background:#16A34A;color:#fff;text-decoration:none;font-weight:700;border-radius:8px;font-size:13px">
            💬 WhatsApp Jade Now
          </a>
        </div>
        <!-- Footer -->
        <div style="margin-top:32px;padding-top:20px;border-top:1px solid #E5E7EB">
          <p style="font-size:11px;color:#9CA3AF;text-align:center;margin:0;line-height:1.8">
            Walz Travels Ltd · contact@walztravels.com · walztravels.com<br>
            WhatsApp UK: +12317902336 · WhatsApp Canada: +1 555 710 7823<br>
            Powered by Jade — Walz Travels AI
          </p>
        </div>
      </div>
    </div>
  `

  let resendResponse: Awaited<ReturnType<typeof resend.emails.send>>
  try {
    resendResponse = await resend.emails.send({
      from:        'Walz Travels <contact@walztravels.com>',
      to:          body.client_email as string,
      subject,
      html,
      attachments: [{ filename, content: pdfBuffer.toString('base64') }],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ticket-generator] Resend error:', msg)
    return NextResponse.json({
      error: `Email delivery failed: ${msg}`,
      ticket_reference: reference,
      pdf_url: pdfUrl,
      debug: 'PDF was generated and saved. Check RESEND_API_KEY and domain verification in Resend dashboard.',
    }, { status: 500 })
  }

  if (resendResponse.error) {
    const msg = resendResponse.error.message ?? JSON.stringify(resendResponse.error)
    console.error('[ticket-generator] Resend returned error:', msg)
    return NextResponse.json({
      error: `Email delivery failed: ${msg}`,
      ticket_reference: reference,
      pdf_url: pdfUrl,
      debug: 'PDF was generated and saved. Check RESEND_API_KEY and domain verification in Resend dashboard.',
    }, { status: 500 })
  }

  return NextResponse.json({
    success:          true,
    ticket_reference: reference,
    pdf_url:          pdfUrl,
    sent_to:          body.client_email,
    resend_id:        resendResponse.data?.id,
  })
}
