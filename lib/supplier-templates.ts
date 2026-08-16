import Anthropic from '@anthropic-ai/sdk'

export type TemplatePurpose =
  | 'discount_request'
  | 'special_request'
  | 'upgrade_ask'
  | 'general_followup'

export interface BookingContext {
  hotelName:    string
  clientName:   string
  checkIn:      string
  checkOut:     string
  roomType:     string
  partySize:    number | string
  bookingRef?:  string
}

// ── Fixed templates ────────────────────────────────────────────────────────────

const TEMPLATES: Record<TemplatePurpose, { subject: string; body: string }> = {
  discount_request: {
    subject: 'Group/Volume Rate Enquiry — {{hotelName}}',
    body: `Dear {{hotelName}} Reservations Team,

I hope this message finds you well. I am writing on behalf of Walz Travels regarding an upcoming group booking at your property.

Guest name: {{clientName}}
Arrival: {{checkIn}}
Departure: {{checkOut}}
Room type: {{roomType}}
Party size: {{partySize}}{{bookingRefLine}}

Given the size and duration of this booking, we would appreciate your consideration of any preferential group or volume rates that may be available for this reservation. We work with many properties across the UK and value the opportunity to build long-term partnerships.

Please let us know whether a preferential rate is possible, and we will revert to our client promptly.

Thank you for your time.

Kind regards,
Walz Travels Team
bookings@walztravels.com`,
  },

  special_request: {
    subject: 'Special Request Confirmation — {{clientName}} arriving {{checkIn}}',
    body: `Dear {{hotelName}} Reservations Team,

Thank you for accommodating our client at your property. I am writing to confirm a special request for the following reservation:

Guest name: {{clientName}}
Arrival: {{checkIn}}
Departure: {{checkOut}}
Room type: {{roomType}}
Party size: {{partySize}}{{bookingRefLine}}

[STAFF: DESCRIBE THE SPECIFIC REQUEST HERE — e.g. late checkout, accessible room, adjoining rooms, dietary requirements, anniversary setup]

Could you please confirm in writing whether this can be arranged? Any confirmation you are able to provide ahead of arrival would be greatly appreciated by our client.

We look forward to your response.

Kind regards,
Walz Travels Team
bookings@walztravels.com`,
  },

  upgrade_ask: {
    subject: 'Room Upgrade Availability Enquiry — {{clientName}}, {{checkIn}}',
    body: `Dear {{hotelName}} Reservations Team,

I hope you are well. I am contacting you on behalf of Walz Travels regarding the following upcoming reservation:

Guest name: {{clientName}}
Arrival: {{checkIn}}
Departure: {{checkOut}}
Current room type: {{roomType}}
Party size: {{partySize}}{{bookingRefLine}}

Could you please let us know whether any room upgrades are available for this guest, and if so, what options you might be able to offer? Our client would welcome the opportunity to enhance their stay, and we would be happy to discuss.

Please do not feel under any obligation — we simply wanted to enquire whether availability exists.

Many thanks for your consideration.

Kind regards,
Walz Travels Team
bookings@walztravels.com`,
  },

  general_followup: {
    subject: 'Follow-up — {{clientName}} booking at {{hotelName}}',
    body: `Dear {{hotelName}} Reservations Team,

I am writing to follow up regarding the reservation below and to ensure everything is in order ahead of our client's arrival.

Guest name: {{clientName}}
Arrival: {{checkIn}}
Departure: {{checkOut}}
Room type: {{roomType}}
Party size: {{partySize}}{{bookingRefLine}}

Please do not hesitate to contact us if you require any additional information. We want to ensure our client has an excellent experience at your property.

Kind regards,
Walz Travels Team
bookings@walztravels.com`,
  },
}

export const TEMPLATE_LABELS: Record<TemplatePurpose, string> = {
  discount_request: 'Group/volume discount request',
  special_request:  'Special request confirmation',
  upgrade_ask:      'Upgrade availability enquiry',
  general_followup: 'General follow-up',
}

function fill(tpl: string, ctx: BookingContext): string {
  const bookingRefLine = ctx.bookingRef ? `\nBooking reference: ${ctx.bookingRef}` : ''
  return tpl
    .replace(/{{hotelName}}/g,    ctx.hotelName)
    .replace(/{{clientName}}/g,   ctx.clientName)
    .replace(/{{checkIn}}/g,      ctx.checkIn)
    .replace(/{{checkOut}}/g,     ctx.checkOut)
    .replace(/{{roomType}}/g,     ctx.roomType)
    .replace(/{{partySize}}/g,    String(ctx.partySize))
    .replace(/{{bookingRefLine}}/g, bookingRefLine)
}

export function renderTemplate(purpose: TemplatePurpose, ctx: BookingContext): { subject: string; body: string } {
  const tpl = TEMPLATES[purpose]
  return { subject: fill(tpl.subject, ctx), body: fill(tpl.body, ctx) }
}

// ── AI draft ──────────────────────────────────────────────────────────────────

const client = new Anthropic()

// Fields that must never appear in outbound supplier emails
const BANNED_FIELDS = ['cost', 'margin', 'commission', 'net', 'markup', 'profit', 'supplierCost', 'supplierRate']

export interface AiDraftInput {
  purpose: TemplatePurpose | 'other'
  prompt:  string
  ctx:     BookingContext
}

export async function generateAiDraft(input: AiDraftInput): Promise<{ subject: string; body: string }> {
  const system = `You are drafting a professional email from Walz Travels (a UK travel agency) to a hotel supplier.

Booking context (use these — do not invent other figures):
- Hotel: ${input.ctx.hotelName}
- Guest name: ${input.ctx.clientName}
- Check-in: ${input.ctx.checkIn}
- Check-out: ${input.ctx.checkOut}
- Room type: ${input.ctx.roomType}
- Party size: ${input.ctx.partySize}${input.ctx.bookingRef ? `\n- Reference: ${input.ctx.bookingRef}` : ''}

Hard rules — these are non-negotiable:
1. NEVER state, imply, or hint at any price, rate, cost, margin, commission, net rate, or markup paid by Walz Travels to the supplier.
2. NEVER guarantee a discount will be accepted or that an upgrade will be provided.
3. NEVER reproduce any figures not explicitly listed in the booking context above.
4. Write as a polite hotel trade partner, not as a consumer guest.
5. Sign off as "Walz Travels Team / bookings@walztravels.com".

Output JSON only: {"subject": "...", "body": "..."}`

  const msg = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 800,
    system,
    messages: [{ role: 'user', content: `Purpose: ${input.purpose}. Staff instruction: ${input.prompt}` }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const json = text.match(/\{[\s\S]*\}/)
  if (!json) throw new Error('AI returned unexpected format')

  const parsed = JSON.parse(json[0]) as { subject: string; body: string }
  if (!parsed.subject || !parsed.body) throw new Error('AI draft missing subject or body')

  // Server-side cost-leakage guard — scan the output for banned field names
  const lowerBody = parsed.body.toLowerCase()
  for (const f of BANNED_FIELDS) {
    if (lowerBody.includes(f.toLowerCase())) {
      throw new Error(`Content safety: draft contains banned term "${f}". Regenerate with a different instruction.`)
    }
  }

  return parsed
}
