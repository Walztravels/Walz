/**
 * @jest-environment jsdom
 *
 * Integration: the real /contact page -> real consent client -> real
 * customer-care route handler (Prisma mocked). Customer-care SMS only.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const mockPrisma = {
  consentRecord: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  consentEvent: { create: jest.fn() },
  $transaction: jest.fn(),
}
// jsdom has no fetch Request/Response; the route only needs NextResponse.json.
jest.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }) },
}))
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import ContactPage from '@/app/contact/page'
import { POST as carePost } from '@/app/api/consent/sms-customer-care/route'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
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
const q = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)!
const setValue = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) =>
  act(() => {
    const proto = Object.getPrototypeOf(el)
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
const fill = () => {
  setValue(q('input[aria-label="Full name"]'), 'Ada')
  setValue(q('input[aria-label="Email address"]'), 'a@b.co')
  setValue(q('input[aria-label="Phone or WhatsApp number"]'), '+447700900000')
  setValue(q('select[aria-label="Enquiry subject"]'), 'General Enquiry')
  setValue(q('textarea[aria-label="Your message"]'), 'hello')
}
const submit = async () => {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => /Send Enquiry/.test(b.textContent ?? ''))!
  await act(async () => { btn.click() })
}
const contactCalls = () => fetchMock.mock.calls.filter(([u]) => u === '/api/contact')
const consentCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/consent/'))

describe('/contact -> customer-care consent, end to end', () => {
  it('renders exactly one unticked, non-required consent checkbox', () => {
    act(() => root.render(<ContactPage />))
    expect(boxes()).toHaveLength(1)
    expect(boxes()[0].checked).toBe(false)
    expect(boxes()[0].required).toBe(false)
    expect(boxes()[0].getAttribute('aria-required')).toBeNull()
  })

  it('unticked: contact API called, NO consent request', async () => {
    act(() => root.render(<ContactPage />))
    fill()
    await submit()
    expect(contactCalls()).toHaveLength(1)
    expect(consentCalls()).toHaveLength(0)
  })

  it('ticked: one POST to the customer-care route, which upserts exactly one SMS_CUSTOMER_CARE row', async () => {
    act(() => root.render(<ContactPage />))
    fill()
    act(() => { boxes()[0].click() })
    await submit()
    expect(contactCalls()).toHaveLength(1)

    const calls = consentCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('/api/consent/sms-customer-care')
    const body = JSON.parse(calls[0][1].body)
    expect(body).toMatchObject({ consent: true, capturePage: '/contact', source: 'contact_form_sms' })

    // Feed the captured request into the real route handler.
    const h = new Map([['x-forwarded-for', '203.0.113.99'], ['user-agent', 'jest']])
    const res = await carePost({
      headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
      json: async () => body,
    } as unknown as Parameters<typeof carePost>[0])
    await expect(res.json()).resolves.toEqual({ recorded: true, purpose: 'SMS_CUSTOMER_CARE', status: 'GRANTED' })

    expect(mockPrisma.consentRecord.create).toHaveBeenCalledTimes(1)
    const arg = mockPrisma.consentRecord.create.mock.calls[0][0]
    expect(arg.data).toMatchObject({
      purpose: 'SMS_CUSTOMER_CARE',
      status: 'GRANTED',
      disclosureVersion: 'sms-customer-care-v2',
      source: 'contact_form_sms',
    })
    const purposes = mockPrisma.consentRecord.create.mock.calls.map(
      (c: [{ data: { purpose: string } }]) => c[0].data.purpose,
    )
    expect(purposes).not.toContain('SMS_MARKETING')
  })
})
