/**
 * WhatsApp Broadcast V1.2 P1 FIX — independent-review adversarial addition.
 *
 * GAP FOUND: __tests__/whatsapp-broadcast-v12-otp.test.ts's "routes" describe
 * block deliberately uses a fresh random x-forwarded-for IP per request
 * (see its `req()` helper) specifically so the real, shared
 * whatsappOtpSendRateLimit / whatsappOtpVerifyRateLimit limiters never
 * trigger — its own comment says the IP-level limiter is "enforced in the
 * ROUTE... route-level coverage is in the routes describe block below", but
 * that block never actually drives the limiter to its cap. So nothing in
 * the suite proves send-code/verify-code's 429 path is wired up at all, nor
 * that whatsappOtpSendRateLimit/whatsappOtpVerifyRateLimit (lib/rate-limit.ts)
 * hold the limits documented there (5 sends / 10 min, 20 verifies / 10 min).
 *
 * This file closes that gap: real lib/rate-limit.ts (NOT mocked — its
 * module-level Map is shared process-wide, so this file uses IPs no other
 * test in the suite uses, from the TEST-NET-2 documentation range, to avoid
 * any cross-test interference), consent-otp mocked so no live network call
 * to Meta ever happens.
 */

const sendOtpMock = jest.fn(async () => ({ outcome: 'SENT' as const }))
const verifyOtpMock = jest.fn(async () => ({ outcome: 'INVALID' as const }))
jest.mock('@/lib/whatsapp/consent-otp', () => ({
  __esModule: true,
  sendOtp: (...args: unknown[]) => sendOtpMock(...args),
  verifyOtp: (...args: unknown[]) => verifyOtpMock(...args),
}))
jest.mock('@/lib/db', () => ({ __esModule: true, default: {}, prisma: {} }))

import { POST as sendCodePOST } from '@/app/api/whatsapp/preferences/send-code/route'
import { POST as verifyCodePOST } from '@/app/api/whatsapp/preferences/verify-code/route'
import { whatsappOtpSendRateLimit, whatsappOtpVerifyRateLimit } from '@/lib/rate-limit'

function req(url: string, ip: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

describe('whatsappOtpSendRateLimit / whatsappOtpVerifyRateLimit — config values', () => {
  it('send limiter allows exactly 5 requests per IP then blocks the 6th, within the 10-minute window', () => {
    const ip = '198.51.100.201' // unique to this file — TEST-NET-2, never used elsewhere in the suite
    for (let i = 0; i < 5; i++) {
      expect(whatsappOtpSendRateLimit(ip).allowed).toBe(true)
    }
    const sixth = whatsappOtpSendRateLimit(ip)
    expect(sixth.allowed).toBe(false)
  })

  it('verify limiter allows exactly 20 requests per IP then blocks the 21st', () => {
    const ip = '198.51.100.202'
    for (let i = 0; i < 20; i++) {
      expect(whatsappOtpVerifyRateLimit(ip).allowed).toBe(true)
    }
    const twentyFirst = whatsappOtpVerifyRateLimit(ip)
    expect(twentyFirst.allowed).toBe(false)
  })

  it('the two limiters are keyed independently — exhausting send does not block verify for the same IP', () => {
    const ip = '198.51.100.203'
    for (let i = 0; i < 5; i++) whatsappOtpSendRateLimit(ip)
    expect(whatsappOtpSendRateLimit(ip).allowed).toBe(false)
    expect(whatsappOtpVerifyRateLimit(ip).allowed).toBe(true)
  })

  it('a different IP is never affected by another IP exhausting its cap', () => {
    const hot = '198.51.100.204'
    const cold = '198.51.100.205'
    for (let i = 0; i < 5; i++) whatsappOtpSendRateLimit(hot)
    expect(whatsappOtpSendRateLimit(hot).allowed).toBe(false)
    expect(whatsappOtpSendRateLimit(cold).allowed).toBe(true)
  })
})

describe('send-code / verify-code routes actually 429 once the real IP limiter is exhausted', () => {
  it('POST /send-code returns 429 on the 6th call from the same IP, and never called sendOtp() on that 6th call', async () => {
    const ip = '198.51.100.211'
    let lastStatus = 0
    for (let i = 0; i < 6; i++) {
      const res = await sendCodePOST(req('http://x/send-code', ip, { phone: '+2348012340001', consent: true }) as never)
      lastStatus = res.status
    }
    expect(lastStatus).toBe(429)
    // 5 allowed calls reached sendOtp; the 6th was turned away by the route
    // before ever calling it.
    expect(sendOtpMock).toHaveBeenCalledTimes(5)
  })

  it('POST /verify-code returns 429 on the 21st call from the same IP, and never called verifyOtp() on that 21st call', async () => {
    const ip = '198.51.100.212'
    let lastStatus = 0
    for (let i = 0; i < 21; i++) {
      const res = await verifyCodePOST(req('http://x/verify-code', ip, { phone: '+2348012340002', code: '000000' }) as never)
      lastStatus = res.status
    }
    expect(lastStatus).toBe(429)
    expect(verifyOtpMock).toHaveBeenCalledTimes(20)
  })

  it('the 429 body never distinguishes IP-rate-limited from any other outcome shape used elsewhere in this feature (still no oracle)', async () => {
    const ip = '198.51.100.213'
    for (let i = 0; i < 5; i++) {
      await sendCodePOST(req('http://x/send-code', ip, { phone: '+2348012340003', consent: true }) as never)
    }
    const res = await sendCodePOST(req('http://x/send-code', ip, { phone: '+2348012340003', consent: true }) as never)
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body).toEqual({ error: 'Too many requests' })
  })
})
