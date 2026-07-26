// app/api/concierge/requests/route.ts
// POST /api/concierge/requests
// Receives form submission from ConciergeRequestForm.
// Validates, calls ConciergeCore.createRequest(), returns reference.

import { NextRequest, NextResponse } from 'next/server'
import { conciergeCore } from '@/lib/concierge/core'
import { notifyNewRequest } from '@/lib/concierge/notifications'

export const dynamic = 'force-dynamic'

// Valid category slugs — these never change without a code deploy.
const VALID_SLUGS = new Set([
  'airport-services',
  'executive-transport',
  'private-aviation',
  'yacht-marine',
  'lifestyle-concierge',
  'tickets-entertainment',
  'vip-experiences',
])

interface RequestBody {
  categorySlug: string
  fields:       Record<string, unknown>
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RequestBody

  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { categorySlug, fields } = body

  // ── Validate slug ─────────────────────────────────────────────────────────

  if (!categorySlug || !VALID_SLUGS.has(categorySlug)) {
    return NextResponse.json({ error: 'Unknown category.' }, { status: 400 })
  }

  // ── Validate minimum contact fields ───────────────────────────────────────

  const contactName  = typeof fields?.contactName  === 'string' ? fields.contactName.trim()  : ''
  const contactEmail = typeof fields?.contactEmail === 'string' ? fields.contactEmail.trim() : ''

  if (!contactName) {
    return NextResponse.json({ error: 'Your name is required.' }, { status: 422 })
  }

  if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 422 })
  }

  const contactPhone = typeof fields?.contactPhone === 'string' ? fields.contactPhone.trim() : undefined

  // ── Create request via ConciergeCore ─────────────────────────────────────

  const result = await conciergeCore.createRequest({
    jadeSessionId: 'web-form',
    categorySlug,
    intentFields:  fields,
    clientName:    contactName || undefined,
    clientEmail:   contactEmail || undefined,
    clientPhone:   contactPhone || undefined,
  })

  if (!result) {
    return NextResponse.json(
      { error: 'We could not process your request right now. Please try again or contact us on WhatsApp.' },
      { status: 503 },
    )
  }

  // ── Fire-and-forget notification ─────────────────────────────────────────

  notifyNewRequest({
    reference:    result.reference,
    categoryName: categorySlug,
    clientName:   contactName || undefined,
    clientEmail:  contactEmail || undefined,
    fields,
  }).catch(() => {
    // Non-blocking — errors already swallowed inside notifyNewRequest
  })

  return NextResponse.json(result, { status: 201 })
}
