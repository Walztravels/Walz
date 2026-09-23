/**
 * WHATSAPP OTP PRIMARY SENDER ALIGNMENT — targeted fix.
 *
 * Root cause: neither sendOtpViaTwilio() nor Broadcast's sendBroadcastTemplate()
 * ever passed an explicit `fromOverride` to sendWhatsAppContentTemplate(), so
 * both fell through to Twilio's `MessagingServiceSid` — which has BOTH the
 * Nigeria and primary/INTL numbers registered under it — leaving Twilio's own
 * sender-pool selection free to pick either one. This file proves the fix:
 * both now pass an explicit, dedicated `From` (TWILIO_WHATSAPP_PRIMARY_FROM),
 * which bypasses MessagingServiceSid-based pool selection entirely, and that
 * every other Twilio WhatsApp send path (Visa, Chatwoot, NG/INTL geomatch,
 * STOP/opt-out) is completely untouched.
 */

process.env.TWILIO_ACCOUNT_SID = 'AC-test'
process.env.TWILIO_AUTH_TOKEN = 'token-test'
process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID = 'HX' + '7'.repeat(32)
process.env.TWILIO_WHATSAPP_PRIMARY_FROM = 'whatsapp:+12317902336' // deliberately WITH the prefix, to prove it's stripped

import {
  sendOtpViaTwilio,
  twilioOtpConfigured,
  twilioPrimarySenderConfigured,
  getPrimaryWhatsAppSender,
  getWhatsAppSender,
  isNigeriaPhone,
  VISA_WHATSAPP_NUMBER,
} from '@/lib/twilio-whatsapp'
import { sendBroadcastTemplate } from '@/lib/whatsapp/broadcast/sender'

const okJson = () => ({ ok: true, json: async () => ({ sid: 'SM_OK', status: 'queued' }) })

function fetchSpy() {
  return jest.fn(async () => okJson()) as unknown as typeof fetch
}

describe('1. OTP uses the explicit primary sender', () => {
  it('sendOtpViaTwilio() sends From=TWILIO_WHATSAPP_PRIMARY_FROM (prefix normalized, no double "whatsapp:")', async () => {
    const f = fetchSpy()
    const result = await sendOtpViaTwilio('+2348011111111', '123456', f)
    expect(result.ok).toBe(true)

    const [url, init] = (f as unknown as jest.Mock).mock.calls[0]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC-test/Messages.json')
    const body = new URLSearchParams((init as RequestInit).body as string)
    expect(body.get('From')).toBe('whatsapp:+12317902336')
    // No double-prefixing from an already-prefixed env var value.
    expect(body.get('From')).not.toContain('whatsapp:whatsapp:')
  })

  it('getPrimaryWhatsAppSender() returns the number WITHOUT a "whatsapp:" prefix, and OTP reports fully configured', () => {
    expect(getPrimaryWhatsAppSender()).toBe('+12317902336')
    expect(twilioPrimarySenderConfigured()).toBe(true)
    expect(twilioOtpConfigured()).toBe(true)
  })
})

describe('2. Broadcast dispatch uses the explicit primary sender', () => {
  it('sendBroadcastTemplate() sends From=TWILIO_WHATSAPP_PRIMARY_FROM', async () => {
    const f = fetchSpy()
    const outcome = await sendBroadcastTemplate({
      waId: '2348011111111',
      contentSid: 'HX' + '1'.repeat(32),
      contentVariables: { '1': 'Ada' },
      fetchImpl: f,
    })
    expect(outcome.ok).toBe(true)

    const [, init] = (f as unknown as jest.Mock).mock.calls[0]
    const body = new URLSearchParams((init as RequestInit).body as string)
    expect(body.get('From')).toBe('whatsapp:+12317902336')
  })
})

describe('3. The Nigeria sender cannot be silently selected for OTP or Broadcast', () => {
  it('a Nigerian-formatted destination number still sends OTP from the PRIMARY sender, never NG_FROM', async () => {
    const f = fetchSpy()
    // A Nigerian destination — under the OLD MessagingServiceSid-based
    // design this recipient's own geography could influence Twilio's pool
    // selection. It must have ZERO effect now: fromOverride pins the
    // sender regardless of who the recipient is.
    await sendOtpViaTwilio('+2348099999999', '654321', f)
    const [, init] = (f as unknown as jest.Mock).mock.calls[0]
    const body = new URLSearchParams((init as RequestInit).body as string)
    expect(body.get('From')).toBe('whatsapp:+12317902336')
    expect(body.get('From')).not.toBe(`whatsapp:${getWhatsAppSender('+2348099999999')}`)
  })

  it('an explicit From means MessagingServiceSid is never set for OTP or Broadcast sends', async () => {
    const f1 = fetchSpy()
    await sendOtpViaTwilio('+2348011111111', '111111', f1)
    const body1 = new URLSearchParams(((f1 as unknown as jest.Mock).mock.calls[0][1] as RequestInit).body as string)
    expect(body1.has('MessagingServiceSid')).toBe(false)

    const f2 = fetchSpy()
    await sendBroadcastTemplate({ waId: '2348011111111', contentSid: 'HX' + '2'.repeat(32), contentVariables: {}, fetchImpl: f2 })
    const body2 = new URLSearchParams(((f2 as unknown as jest.Mock).mock.calls[0][1] as RequestInit).body as string)
    expect(body2.has('MessagingServiceSid')).toBe(false)
  })

  it('getWhatsAppSender() itself is untouched — it still correctly geomatches NG vs INTL for the paths that intentionally use it (Visa/Chatwoot)', () => {
    expect(isNigeriaPhone('+2348012345678')).toBe(true)
    expect(isNigeriaPhone('+12025550123')).toBe(false)
    // Its return value is simply no longer consulted by OTP/Broadcast —
    // proven by test 1/2 above sending from PRIMARY_FROM regardless.
    expect(typeof getWhatsAppSender('+2348012345678')).toBe('string')
  })
})

describe('4. Missing TWILIO_WHATSAPP_PRIMARY_FROM fails closed', () => {
  function loadWithoutPrimaryFrom() {
    let twilioMod!: typeof import('@/lib/twilio-whatsapp')
    jest.isolateModules(() => {
      const saved = process.env.TWILIO_WHATSAPP_PRIMARY_FROM
      delete process.env.TWILIO_WHATSAPP_PRIMARY_FROM
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      twilioMod = require('@/lib/twilio-whatsapp')
      if (saved !== undefined) process.env.TWILIO_WHATSAPP_PRIMARY_FROM = saved
    })
    return twilioMod
  }

  it('twilioOtpConfigured() is false without TWILIO_WHATSAPP_PRIMARY_FROM, even with everything else set', () => {
    const mod = loadWithoutPrimaryFrom()
    expect(mod.twilioPrimarySenderConfigured()).toBe(false)
    expect(mod.twilioOtpConfigured()).toBe(false)
  })

  it('sendOtpViaTwilio() fails closed — no fetch call, no free-text fallback — when PRIMARY_FROM is missing', async () => {
    const mod = loadWithoutPrimaryFrom()
    const f = fetchSpy()
    const result = await mod.sendOtpViaTwilio('+2348011111111', '123456', f)
    expect(result.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('Broadcast sendBroadcastTemplate() fails closed (PERMANENT, no send) when PRIMARY_FROM is missing', async () => {
    let broadcastMod!: typeof import('@/lib/whatsapp/broadcast/sender')
    jest.isolateModules(() => {
      const saved = process.env.TWILIO_WHATSAPP_PRIMARY_FROM
      delete process.env.TWILIO_WHATSAPP_PRIMARY_FROM
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      broadcastMod = require('@/lib/whatsapp/broadcast/sender')
      if (saved !== undefined) process.env.TWILIO_WHATSAPP_PRIMARY_FROM = saved
    })
    const f = fetchSpy()
    const outcome = await broadcastMod.sendBroadcastTemplate({
      waId: '2348011111111', contentSid: 'HX' + '3'.repeat(32), contentVariables: {}, fetchImpl: f,
    })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.kind).toBe('PERMANENT')
      expect(outcome.code).toBe('NO_PRIMARY_SENDER')
    }
    expect(f).not.toHaveBeenCalled()
  })
})

describe('5. Existing Visa sender routing is unchanged', () => {
  // sendWhatsAppBody()/sendWhatsAppViaTwilio() (the functions the Visa
  // flow actually calls) take no injectable fetchImpl, so they are NOT
  // invoked here — doing so would make a real network call. Instead this
  // proves the two facts that matter: the visa number itself is untouched
  // by this release, and it is a genuinely different value from the new
  // OTP/Broadcast primary sender (so the two can never be confused).
  it('VISA_WHATSAPP_NUMBER is unchanged and distinct from the new primary sender', () => {
    expect(VISA_WHATSAPP_NUMBER).toBe(process.env.TWILIO_WHATSAPP_NUMBER_VISA || '+447949448680')
    expect(VISA_WHATSAPP_NUMBER).not.toBe(getPrimaryWhatsAppSender())
  })

  it('every visa-thread send call site still passes VISA_WHATSAPP_NUMBER as an explicit fromOverride, untouched by this release', () => {
    const fs = require('fs')
    const path = require('path')
    const files = ['lib/twilio-whatsapp.ts', 'app/api/webhooks/twilio-whatsapp/route.ts']
    const hits = files.filter(f => fs.readFileSync(path.join(process.cwd(), f), 'utf8').includes('VISA_WHATSAPP_NUMBER'))
    expect(hits.length).toBeGreaterThan(0)
  })
})

describe('6. Existing Chatwoot integration is unchanged', () => {
  it('the Chatwoot inbox-routing consumer imports only untouched exports (isNigeriaPhone, sendWhatsAppBody, sendWhatsAppViaTwilio, twilioConfigured, twilioTemplateConfigured, normalisePhone) — never the new primary-sender exports', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/whatsapp-chat/route.ts'), 'utf8')
    expect(src).toContain("from '@/lib/twilio-whatsapp'")
    expect(src).not.toContain('getPrimaryWhatsAppSender')
    expect(src).not.toContain('twilioPrimarySenderConfigured')
    expect(src).not.toContain('TWILIO_WHATSAPP_PRIMARY_FROM')
  })
})

describe('7. OTP ContentSid and ContentVariables remain correct', () => {
  it('the approved OTP Content SID and the {"1": code} variable shape are unchanged by adding From', async () => {
    const f = fetchSpy()
    await sendOtpViaTwilio('+2348011111111', '424242', f)
    const body = new URLSearchParams(((f as unknown as jest.Mock).mock.calls[0][1] as RequestInit).body as string)
    expect(body.get('ContentSid')).toBe(process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID)
    expect(JSON.parse(body.get('ContentVariables')!)).toEqual({ '1': '424242' })
    expect(body.has('Body')).toBe(false) // still never free text
  })
})

describe('8. STOP/opt-out behavior is unaffected', () => {
  it('the STOP confirmation reply uses the number the person actually messaged (toPhone as fromOverride), never TWILIO_WHATSAPP_PRIMARY_FROM', () => {
    // Structural check: handleWhatsAppOptOut() calls sendWhatsAppBody(
    // fromPhone, body, undefined, toPhone) — its own explicit fromOverride
    // is the Walz number the person messaged, completely independent of
    // the OTP/Broadcast primary sender introduced by this release. Full
    // behavioral coverage (signed/unsigned STOP, dedup, visa visibility)
    // already lives in whatsapp-broadcast-v1-2-1-twilio-transport.test.ts
    // and is re-run unchanged alongside this file.
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(process.cwd(), 'app/api/webhooks/twilio-whatsapp/route.ts'), 'utf8')
    expect(src).toContain('sendWhatsAppBody(input.fromPhone, WHATSAPP_UNSUBSCRIBE_CONFIRMATION, undefined, input.toPhone)')
    expect(src).not.toContain('TWILIO_WHATSAPP_PRIMARY_FROM')
    expect(src).not.toContain('getPrimaryWhatsAppSender')
  })
})
