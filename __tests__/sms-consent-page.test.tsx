/**
 * @jest-environment jsdom
 *
 * /sms-consent — public SMS customer-care opt-in page. Real form -> real
 * consent route handler (Prisma mocked with ONLY consentRecord.create).
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import fs from 'fs'
import path from 'path'

const mockPrisma = {
  consentRecord: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  consentEvent: { create: jest.fn() },
  $transaction: jest.fn(),
}
jest.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }) },
}))
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import SmsConsentPage, { metadata } from '@/app/sms-consent/page'
import SmsConsentForm from '@/app/sms-consent/SmsConsentForm'
import { POST as carePost } from '@/app/api/consent/sms-customer-care/route'
import { SMS_CUSTOMER_CARE_DISCLOSURE_BODY, CONSENT_SOURCE_ALLOWLIST } from '@/lib/consent/purposes'
import { PRIVACY_SECTIONS } from '@/lib/content/legal-content'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const formSrc = read('app/sms-consent/SmsConsentForm.tsx')
const pageSrc = read('app/sms-consent/page.tsx')

const fetchMock = jest.fn()
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma))
  mockPrisma.consentRecord.findUnique.mockResolvedValue(null)
  mockPrisma.consentRecord.create.mockResolvedValue({ id: 'x' })
  mockPrisma.consentEvent.create.mockResolvedValue({ id: 'e1' })
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ recorded: true }) })
  ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const boxes = () => Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
const phoneInput = () => container.querySelector<HTMLInputElement>('input[type="tel"]')!
const setValue = (el: HTMLInputElement, v: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
const submit = async () => {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => /Sign up for SMS updates/.test(b.textContent ?? ''))!
  await act(async () => { btn.click() })
}
const text = () => container.textContent ?? ''
const SUCCESS = "You're signed up for Walz Travels SMS customer-care updates. Reply STOP to opt out or HELP for help."
const renderForm = () => act(() => root.render(<SmsConsentForm />))

describe('page module', () => {
  it('exports a component and correct metadata', () => {
    expect(typeof SmsConsentPage).toBe('function')
    expect(metadata.title).toBe('SMS Customer Care Updates — Opt In')
    expect(metadata.alternates?.canonical).toBe('https://www.walztravels.com/sms-consent')
  })
  it('is public: no auth/session/redirect/cookies/db usage', () => {
    for (const re of [/auth/i, /session/i, /redirect/, /getServerSession/, /cookies\(/, /prisma/i, /@\/lib\/db/]) {
      expect(pageSrc).not.toMatch(re)
    }
  })
  it('is not matched by middleware and not disallowed by robots', () => {
    const mw = read('middleware.ts')
    const m = mw.match(/matcher:\s*\[([\s\S]*?)\]/)![1]
    expect(m).not.toMatch(/sms-consent/)
    const patterns = Array.from(m.matchAll(/'([^']+)'/g)).map((x) => x[1])
    expect(patterns.some((p) => p === '/' || p.startsWith('/:') || p.startsWith('/(('))).toBe(false)
    expect(read('app/robots.ts')).not.toMatch(/sms-consent/)
  })
})

describe('rendered form', () => {
  it('has exactly one unticked, optional checkbox', () => {
    renderForm()
    expect(boxes()).toHaveLength(1)
    expect(boxes()[0].checked).toBe(false)
    expect(boxes()[0].required).toBe(false)
    expect(boxes()[0].disabled).toBe(false)
    expect(boxes()[0].getAttribute('aria-required')).toBeNull()
  })
  it('renders the approved disclosure verbatim and the program details', () => {
    renderForm()
    expect(text()).toContain(SMS_CUSTOMER_CARE_DISCLOSURE_BODY)
    for (const s of [
      'Message frequency varies', 'Message and data rates may apply', 'Reply STOP to opt out or HELP for help',
      'Consent is not a condition of purchase', 'The Walz Travels Inc., operating as Walz Travels',
      'Program details', 'Walz Travels SMS Customer Care',
      'This opt-in is for customer-care/service communications and does not enroll you in promotional or marketing SMS messages.',
      'Mobile information, including your mobile phone number and SMS opt-in consent, will not be shared with third parties or affiliates for their marketing or promotional purposes.',
    ]) expect(text()).toContain(s)
    expect(container.querySelector('h1')!.textContent).toBe('Walz Travels SMS Customer Care Updates')
  })
  it('has no other promotional-SMS enrollment wording', () => {
    renderForm()
    const stripped = text()
      .replace('does not enroll you in promotional or marketing SMS messages', '')
      .replace('for their marketing or promotional purposes', '')
    expect(stripped).not.toMatch(/promotional SMS/i)
    expect(stripped).not.toMatch(/marketing SMS/i)
  })
  it('shows visible privacy and terms links (inline and Legal row)', () => {
    renderForm()
    const hrefs = (h: string) => container.querySelectorAll(`a[href="${h}"]`).length
    expect(hrefs('/privacy')).toBeGreaterThanOrEqual(2)
    expect(hrefs('/terms')).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('nav[aria-label="Legal"]')).not.toBeNull()
  })
})

describe('behaviour', () => {
  it('empty phone: error, no fetch', async () => {
    renderForm()
    await submit()
    expect(text()).toContain('Please enter your mobile phone number.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('phone but unticked: message, no fetch', async () => {
    renderForm()
    setValue(phoneInput(), '+447700900123')
    await submit()
    expect(text()).toContain('Please tick the box above to opt in to SMS updates.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('ticked + valid: one fetch, bridged into the real route, one SMS_CUSTOMER_CARE upsert', async () => {
    renderForm()
    setValue(phoneInput(), '+447700900123')
    act(() => { boxes()[0].click() })
    await submit()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/consent/sms-customer-care')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ consent: true, capturePage: '/sms-consent', source: 'sms_consent_page' })
    expect(text()).toContain(SUCCESS)
    expect(text()).not.toContain('+447700900123')

    const h = new Map([['x-forwarded-for', '203.0.113.7'], ['user-agent', 'jest']])
    const res = await carePost({
      headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
      json: async () => body,
    } as unknown as Parameters<typeof carePost>[0])
    await expect(res.json()).resolves.toEqual({ recorded: true, purpose: 'SMS_CUSTOMER_CARE', status: 'GRANTED' })
    expect(mockPrisma.consentRecord.create).toHaveBeenCalledTimes(1)
    const arg = mockPrisma.consentRecord.create.mock.calls[0][0]
    expect(arg.data).toMatchObject({
      purpose: 'SMS_CUSTOMER_CARE', status: 'GRANTED', disclosureVersion: 'sms-customer-care-v2', source: 'sms_consent_page',
    })
    const purposes = mockPrisma.consentRecord.create.mock.calls.map(
      (c: [{ data: { purpose: string } }]) => c[0].data.purpose,
    )
    expect(purposes).toEqual(['SMS_CUSTOMER_CARE'])
    expect(purposes).not.toContain('SMS_MARKETING')
    expect(purposes).not.toContain('WHATSAPP_MARKETING')
  })
  it('recorded:false INVALID_NUMBER (real route, national format): hint, no success', async () => {
    fetchMock.mockImplementation(async (_u: string, init: { body: string }) => {
      const h = new Map([['x-forwarded-for', '203.0.113.8'], ['user-agent', 'jest']])
      const res = await carePost({
        headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
        json: async () => JSON.parse(init.body),
      } as unknown as Parameters<typeof carePost>[0])
      return { ok: res.status < 400, status: res.status, json: () => res.json() }
    })
    renderForm()
    setValue(phoneInput(), '08031234567')
    act(() => { boxes()[0].click() })
    await submit()
    expect(text()).toContain("We couldn't read that number. Please enter it with your country code, e.g. +44 7700 900123.")
    expect(text()).not.toContain("You're signed up")
    expect(mockPrisma.consentRecord.create).not.toHaveBeenCalled()
  })
  it('recorded:false PREVIOUSLY_OPTED_OUT: clear opt-out message, no success', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ recorded: false, reason: 'PREVIOUSLY_OPTED_OUT' }) })
    renderForm()
    setValue(phoneInput(), '+447700900123')
    act(() => { boxes()[0].click() })
    await submit()
    expect(text()).toContain('This number previously opted out of SMS. To subscribe again, contact contact@walztravels.com.')
    expect(text()).not.toContain("You're signed up")
  })
  it('ok but recorded not true: no success', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ recorded: false, reason: 'NOT_CHECKED' }) })
    renderForm()
    setValue(phoneInput(), '+447700900123')
    act(() => { boxes()[0].click() })
    await submit()
    expect(text()).not.toContain("You're signed up")
    expect(text()).toContain('Something went wrong')
  })
  it('429 and 500 and network error show errors, never success', async () => {
    const cases: Array<[() => void, string]> = [
      [() => fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }), 'Too many attempts. Please try again in a few minutes.'],
      [() => fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ recorded: false, reason: 'WRITE_FAILED' }) }), 'Something went wrong. Please try again.'],
      [() => fetchMock.mockRejectedValue(new Error('net')), 'Something went wrong. Please try again.'],
    ]
    for (const [setup, msg] of cases) {
      setup()
      renderForm()
      setValue(phoneInput(), '+447700900123')
      if (!boxes()[0].checked) act(() => { boxes()[0].click() })
      await submit()
      expect(text()).toContain(msg)
      expect(text()).not.toContain("You're signed up")
      act(() => root.unmount())
      root = createRoot(container)
    }
  })
})

describe('independence and wiring', () => {
  it('form has no whatsapp / marketing references', () => {
    expect(formSrc).not.toMatch(/whatsapp/i)
    expect(pageSrc).not.toMatch(/whatsapp/i)
    expect(formSrc).not.toMatch(/SMS_MARKETING|WHATSAPP_MARKETING|useSmsConsent/)
    expect(formSrc).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
  })
  it('source is allowlisted', () => {
    expect(CONSENT_SOURCE_ALLOWLIST).toContain('sms_consent_page')
  })
  it('footer and sitemap link to /sms-consent', () => {
    expect(read('components/common/Footer.tsx')).toContain("href: '/sms-consent'")
    expect(read('app/sitemap.ts')).toContain('/sms-consent')
  })
  it('privacy s13 and s5 carry the no-sharing statement', () => {
    const s13 = PRIVACY_SECTIONS.find((s) => s.key === 'privacy_s13')!
    const s5 = PRIVACY_SECTIONS.find((s) => s.key === 'privacy_s5')!
    expect(s13.body).toContain('will not be shared with third parties or affiliates for their marketing or promotional purposes')
    expect(s5.body).toContain('will not be shared with third parties or affiliates for marketing or promotional purposes')
    expect(s5.body).toContain('Mobile information')
  })
})
