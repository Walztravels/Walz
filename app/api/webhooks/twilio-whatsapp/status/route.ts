import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST — Twilio message status callback
// Updates the status field on VisaApplicationMessage when Twilio reports delivery.
// Set this as the "Status callback URL" in your Twilio number configuration.
export async function POST(req: NextRequest) {
  try {
    const text   = await req.text()
    const form   = new URLSearchParams(text)
    const sid    = form.get('MessageSid')
    const status = form.get('MessageStatus') // queued|sent|delivered|read|failed|undelivered

    if (sid && status) {
      await prisma.visaApplicationMessage.updateMany({
        where: { twilioSid: sid },
        data:  { status },
      }).catch(() => {})
    }
  } catch { /* non-fatal */ }

  return new Response('', { status: 200 })
}
