import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { TicketPDFDocument } from '@/components/admin/TicketPDF'
import { FlightTicketPDF } from '@/components/tickets/FlightTicketPDF'
import { createClient } from '@supabase/supabase-js'
import type { FlightTicketEmailProps, FlightLeg } from '@/types/flight-ticket'

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

/**
 * POST /api/admin/ticket-generator/generate
 * Generates a branded PDF ticket and stores it in Supabase Storage.
 * Returns: ticket_reference, pdf_url, record id
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !body.ticket_type) {
    return NextResponse.json({ error: 'ticket_type is required' }, { status: 400 })
  }

  const reference = makeReference(body.ticket_type as string)

  // ── Build ticket data object ───────────────────────────────────────────────
  const ticketData = {
    ticket_type:      body.ticket_type as string,
    ticket_reference: reference,
    client_name:      body.client_name as string | undefined,
    client_email:     body.client_email as string | undefined,
    ...body,
  }

  // ── Render PDF ────────────────────────────────────────────────────────────
  let pdfBuffer: Buffer
  try {
    let element: React.ReactElement

    if (body.ticket_type === 'flight' && Array.isArray(body.outbound) && (body.outbound as FlightLeg[]).length > 0) {
      // Emirates-grade PDF for flight tickets
      const name      = (body.client_name  as string | undefined) ?? ''
      const emailProps: FlightTicketEmailProps = {
        reference,
        pnr:          (body.pnr           as string | undefined) ?? reference,
        issueDate:    new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        issuedBy:     session.email ?? 'Walz Travels',
        title:        (body.title         as string | undefined) ?? '',
        firstName:    (body.firstName     as string | undefined) ?? name.split(' ')[0] ?? '',
        lastName:     (body.lastName      as string | undefined) ?? name.split(' ').slice(1).join(' ') ?? '',
        email:        (body.client_email  as string | undefined) ?? '',
        phone:        (body.client_phone  as string | undefined) ?? '',
        outbound:     body.outbound as FlightLeg[],
        inbound:      (body.inbound       as FlightLeg[] | undefined) ?? [],
        tripType:     (body.tripType as 'one-way' | 'return' | undefined) ?? 'one-way',
        passengers:   (body.passengers    as FlightTicketEmailProps['passengers'] | undefined) ?? [],
        pricing:      body.pricing        as FlightTicketEmailProps['pricing'] | undefined,
        agentMessage: body.message        as string | undefined,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      element = React.createElement(FlightTicketPDF, emailProps) as any
    } else {
      element = React.createElement(TicketPDFDocument, { data: ticketData })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(element as any)
  } catch (err) {
    console.error('[ticket-generator/generate] PDF render error:', err)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }

  // ── Upload to Supabase Storage ─────────────────────────────────────────────
  const now   = new Date()
  const year  = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const path  = `tickets/${year}/${month}/${reference}.pdf`

  let pdfUrl: string | null = null
  try {
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
      pdfUrl = urlData?.publicUrl ?? null
    } else {
      console.warn('[ticket-generator/generate] storage upload:', uploadErr.message)
    }
  } catch (err) {
    console.warn('[ticket-generator/generate] storage error:', err)
  }

  // ── Save record to DB ──────────────────────────────────────────────────────
  let recordId: string | null = null
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
      INSERT INTO generated_tickets (
        ticket_reference, client_id, client_name, client_email,
        ticket_type, ticket_data, pdf_url, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7, $8
      ) RETURNING id
    `,
      reference,
      body.client_id ?? null,
      body.client_name ?? null,
      body.client_email ?? null,
      body.ticket_type,
      JSON.stringify(ticketData),
      pdfUrl,
      session.email,
    )
    recordId = rows[0]?.id ?? null
  } catch (err) {
    console.error('[ticket-generator/generate] DB write error:', err)
    // Non-fatal — PDF is generated; return what we have
  }

  return NextResponse.json({
    success:          true,
    ticket_reference: reference,
    pdf_url:          pdfUrl,
    record_id:        recordId,
    // Return raw buffer as base64 for client-side download
    pdf_base64: pdfBuffer.toString('base64'),
  })
}
