const CHATWOOT_BASE  = process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL ?? 'https://chat.walztravels.com'
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN ?? ''
const ACCOUNT_ID     = process.env.CHATWOOT_ACCOUNT_ID ?? '1'
const INBOX_ID       = process.env.CHATWOOT_INBOX_ID   ?? '1'

export async function sendWhatsAppBookingConfirmation({
  customerPhone,
  customerName,
  bookingReference,
  items,
  total,
  currency,
  voucherUrl,
}: {
  customerPhone:    string
  customerName:     string
  bookingReference: string
  items:            Array<{ type: string; title: string; price: number; currency: string }>
  total:            number
  currency:         string
  voucherUrl:       string
}) {
  if (!customerPhone || !CHATWOOT_TOKEN) return

  const phone = customerPhone.replace(/\D/g, '')
  if (!phone) return

  const message = [
    `*Booking Confirmed — Walz Travels*`,
    ``,
    `Hi ${customerName}! Your booking is confirmed.`,
    ``,
    `*Reference:* ${bookingReference}`,
    ``,
    `*Your Bookings:*`,
    ...items.map(i => `• ${i.title} (${i.type}) — ${i.currency} ${i.price}`),
    ``,
    `*Total Paid:* ${currency} ${total.toFixed(2)}`,
    ``,
    `*Download Voucher:* ${voucherUrl}`,
    ``,
    `Need help? Reply to this message anytime`,
  ].join('\n')

  try {
    const headers = { 'api_access_token': CHATWOOT_TOKEN, 'Content-Type': 'application/json' }

    // Search for existing contact by phone
    const searchRes  = await fetch(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(phone)}&include_contacts=true`,
      { headers }
    )
    const searchData = await searchRes.json()
    let contactId    = searchData?.payload?.contacts?.[0]?.id

    // Create contact if not found
    if (!contactId) {
      const createRes  = await fetch(
        `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/contacts`,
        {
          method: 'POST',
          headers,
          body:   JSON.stringify({ name: customerName, phone_number: `+${phone}` }),
        }
      )
      const createData = await createRes.json()
      contactId        = createData?.id
    }

    if (!contactId) {
      console.warn('[WhatsApp] Could not find or create contact for', phone)
      return
    }

    // Create conversation
    const convRes  = await fetch(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
      {
        method: 'POST',
        headers,
        body:   JSON.stringify({ inbox_id: Number(INBOX_ID), contact_id: contactId }),
      }
    )
    const convData = await convRes.json()
    const convId   = convData?.id

    if (!convId) {
      console.warn('[WhatsApp] Could not create conversation for contact', contactId)
      return
    }

    // Send message
    await fetch(
      `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}/conversations/${convId}/messages`,
      {
        method: 'POST',
        headers,
        body:   JSON.stringify({
          content:      message,
          message_type: 'outgoing',
          content_type: 'text',
          private:      false,
        }),
      }
    )

    console.log('[WhatsApp] Booking confirmation sent to', phone)
  } catch (err) {
    console.error('[WhatsApp] Send failed:', err)
  }
}
