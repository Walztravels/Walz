// Recovery WhatsApp messages (Release 3C)
//
// Gated behind RECOVERY_WHATSAPP_ENABLED=true.
// Uses plain text — no HTML. Keeps messages short and non-salesy for
// provider compliance (WhatsApp Business Policy).
//
// CRITICAL: SUPPLIER_FAILURE and HOT_LEAD are never contacted via this path —
// suppression.ts catches those before this file is ever called.

import { sendWhatsAppBody, twilioConfigured } from '@/lib/twilio-whatsapp'

export function whatsAppEnabled(): boolean {
  return (
    process.env.RECOVERY_WHATSAPP_ENABLED === 'true' &&
    twilioConfigured()
  )
}

export interface RecoveryWhatsAppOpts {
  toPhone:    string
  clientName: string
  type:       string
  destination?: string
  resumeUrl:  string
}

function firstName(fullName: string): string {
  return fullName.trim().split(' ')[0] ?? fullName
}

function buildBody(opts: RecoveryWhatsAppOpts): string {
  const name = firstName(opts.clientName)
  const dest = opts.destination ? ` for ${opts.destination}` : ''

  switch (opts.type) {
    case 'ABANDONED_CART':
      return `Hi ${name} 👋 Your Walz Travels trip plan${dest} is still saved.\n\nTravel prices can change, so we'll check the latest availability when you're ready.\n\nResume here: ${opts.resumeUrl}`

    case 'UNPAID_PROPOSAL':
      return `Hi ${name} 👋 Your Walz Travels proposal${dest} is still available.\n\nIf you'd like to adjust anything — flights, hotel, activities or payment — just reply and our team will help.\n\nView your proposal: ${opts.resumeUrl}`

    case 'FAILED_PAYMENT':
      return `Hi ${name} 👋 We noticed your recent Walz Travels payment didn't complete.\n\nYour booking has not been confirmed. You can try again or contact us: ${opts.resumeUrl}`

    case 'INCOMPLETE_TRIP':
      return `Hi ${name} 👋 Your Walz Travels trip plan${dest} is still waiting for you.\n\nContinue where you left off: ${opts.resumeUrl}`

    default:
      return `Hi ${name} 👋 We noticed you haven't completed your Walz Travels booking. We're here to help.\n\n${opts.resumeUrl}`
  }
}

export async function sendRecoveryWhatsApp(opts: RecoveryWhatsAppOpts): Promise<boolean> {
  if (!whatsAppEnabled()) return false
  if (!opts.toPhone) return false

  try {
    const body   = buildBody(opts)
    const result = await sendWhatsAppBody(opts.toPhone, body)
    return result.ok
  } catch (err) {
    console.warn('[RecoveryWhatsApp] send failed:', (err as Error).message)
    return false
  }
}
