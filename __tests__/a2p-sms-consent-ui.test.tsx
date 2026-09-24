/**
 * @jest-environment jsdom
 *
 * UI behaviour for the single customer-care SMS consent box, the shared
 * useSmsConsent hook, and the footer entity block. Real React rendering
 * (react-dom/client + act) — no testing-library dependency.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { SmsCustomerCareConsent } from '@/components/consent/SmsCustomerCareConsent'
import { useSmsConsent, type UseSmsConsent } from '@/components/consent/useSmsConsent'
import { postSmsConsents } from '@/lib/consent/client'
import { Footer } from '@/components/common/Footer'
import {
  SMS_CUSTOMER_CARE_DISCLOSURE_BODY,
} from '@/lib/consent/purposes'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
const fetchMock = jest.fn()

beforeEach(() => {
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

let hook: UseSmsConsent
function Harness() {
  hook = useSmsConsent()
  return <form>{hook.fields}</form>
}
const boxes = () => Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
const box = () => container.querySelector<HTMLInputElement>('[data-consent-purpose="SMS_CUSTOMER_CARE"] input[type="checkbox"]')!
const click = (el: HTMLElement) => act(() => { el.click() })
const consentCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/consent/'))

describe('the single customer-care box, rendered', () => {
  it('exactly one checkbox, unchecked by default, never required', () => {
    act(() => root.render(<Harness />))
    expect(boxes()).toHaveLength(1)
    const b = box()
    expect(b.checked).toBe(false)
    expect(b.required).toBe(false)
    expect(b.hasAttribute('required')).toBe(false)
    expect(b.getAttribute('aria-required')).toBeNull()
    expect(container.querySelector('[data-consent-purpose="SMS_MARKETING"]')).toBeNull()
    expect(container.querySelector('[data-consent-purpose="SMS_CUSTOMER_CARE"]')!.getAttribute('data-disclosure-version')).toBe('sms-customer-care-v2')
  })

  it('hook exposes no marketing state', () => {
    act(() => root.render(<Harness />))
    expect(Object.keys(hook).sort()).toEqual(['customerCare', 'fields', 'record', 'reset', 'setCustomerCare'])
  })

  it('renders the exact wording, optional note, real links, and nothing promotional', () => {
    act(() => root.render(<Harness />))
    const care = container.querySelector('[data-consent-purpose="SMS_CUSTOMER_CARE"]')!
    expect(SMS_CUSTOMER_CARE_DISCLOSURE_BODY).toBe(
      'I agree to receive SMS messages from The Walz Travels Inc., operating as Walz Travels, regarding my travel enquiries, bookings, payments, itinerary updates, visa-service updates and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.',
    )
    expect(care.textContent).toContain(SMS_CUSTOMER_CARE_DISCLOSURE_BODY)
    const hrefs = Array.from(care.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/terms', '/privacy'])
    for (const a of Array.from(care.querySelectorAll('a'))) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
    }
    expect(container.textContent).toContain('Optional — leaving this unticked will not affect your booking or enquiry.')
    expect(container.textContent).not.toMatch(/promotion|promotional|marketing|offer|deal/i)
  })

  it('standalone component is controlled and unticked when given false', () => {
    act(() => root.render(<SmsCustomerCareConsent checked={false} onChange={() => {}} />))
    expect(boxes().every((b) => !b.checked)).toBe(true)
  })
})

describe('toggle + reset', () => {
  it('ticking and resetting works', () => {
    act(() => root.render(<Harness />))
    click(box())
    expect(box().checked).toBe(true)
    expect(hook.customerCare).toBe(true)
    act(() => hook.reset())
    expect(box().checked).toBe(false)
  })
})

describe('hook.record — posts only when ticked, never throws', () => {
  const info = { phone: '+2348012345678', capturePage: '/tours/book' }

  it('unticked -> nothing sent', async () => {
    act(() => root.render(<Harness />))
    await act(async () => { await hook.record(info) })
    expect(consentCalls()).toHaveLength(0)
  })

  it('ticked -> exactly one post, to the customer-care route only', async () => {
    act(() => root.render(<Harness />))
    click(box())
    await act(async () => { await hook.record({ ...info, source: 'tour_booking_sms', evidence: 'ref-1' }) })
    expect(consentCalls().map(([u]) => u)).toEqual(['/api/consent/sms-customer-care'])
    expect(JSON.parse(consentCalls()[0][1].body)).toEqual({
      phone: info.phone, consent: true, capturePage: '/tours/book', evidence: 'ref-1', source: 'tour_booking_sms',
    })
  })

  it('no request is ever made to a marketing endpoint', async () => {
    act(() => root.render(<Harness />))
    click(box())
    await act(async () => { await hook.record(info) })
    expect(fetchMock.mock.calls.some(([u]) => /marketing/i.test(String(u)))).toBe(false)
  })

  it('a rejecting or throwing fetch never throws out of record()', async () => {
    act(() => root.render(<Harness />))
    click(box())
    fetchMock.mockRejectedValue(new Error('network'))
    await expect(hook.record(info)).resolves.toBeUndefined()
    fetchMock.mockImplementation(() => { throw new Error('sync boom') })
    await expect(hook.record(info)).resolves.toBeUndefined()
    expect(() => postSmsConsents({ ...info, customerCare: true })).not.toThrow()
  })

  it('an empty phone sends nothing; non-boolean-true flags send nothing', () => {
    postSmsConsents({ phone: '', capturePage: '/x', customerCare: true }, fetchMock)
    postSmsConsents({ phone: '+2348012345678', capturePage: '/x', customerCare: 'true' as unknown as boolean }, fetchMock)
    expect(consentCalls()).toHaveLength(0)
  })
})

describe('Footer', () => {
  it('renders the corporate disclosure and both entity lines next to the copyright and policy links', () => {
    act(() => root.render(<Footer />))
    const text = container.textContent ?? ''
    expect(text).toContain('Walz Travels is an international travel services brand operated through locally registered entities in Canada and the United Kingdom.')
    expect(text).toContain('Canada: The Walz Travels Inc.')
    expect(text).toContain('United Kingdom: Walz Travels Ltd')
    expect(text).toContain('All rights reserved.')
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/privacy')
    expect(hrefs).toContain('/terms')
  })
})
