/**
 * @jest-environment jsdom
 *
 * A2P 10DLC — booking-flow + insurance forms wired to useSmsConsent.
 * Modals and PassengerForm are rendered for real (react-dom + act); the three
 * full pages (/book checkout via PassengerForm, /hotels/book, /flights/traveller)
 * and /insurance are pinned at source level because they need router/session/
 * Stripe context.
 */
import fs from 'fs'
import path from 'path'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { CONSENT_SOURCE_HOTEL_BOOKING, CONSENT_SOURCE_WEB_FORM } from '@/lib/consent/purposes'

jest.mock('@/components/booking/PaymentForm', () => ({ PaymentForm: () => null }))

import { HotelBookingModal } from '@/components/hotels/HotelBookingModal'
import { TransferBookingModal } from '@/components/transfers/TransferBookingModal'
import { ActivityBookingModal } from '@/components/activities/ActivityBookingModal'
import { PassengerForm } from '@/components/booking/PassengerForm'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

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

const boxes = () => Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
const box = (purpose: string) =>
  container.querySelector<HTMLInputElement>(`[data-consent-purpose="${purpose}"] input[type="checkbox"]`)!
const consentCalls = () =>
  fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/consent/'))
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body)

function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const telInput = () => container.querySelector<HTMLInputElement>('input[type="tel"]')!
const inputByType = (t: string) => container.querySelector<HTMLInputElement>(`input[type="${t}"]`)!
const continueBtn = () =>
  Array.from(container.querySelectorAll('button')).find(b => /Continue to Payment/.test(b.textContent ?? ''))!

function expectBoxesSane() {
  expect(boxes()).toHaveLength(1)
  for (const b of boxes()) {
    expect(b.checked).toBe(false)
    expect(b.required).toBe(false)
    expect(b.hasAttribute('required')).toBe(false)
    expect(b.getAttribute('aria-required')).toBeNull()
    expect(b.disabled).toBe(false)
  }
  expect(container.querySelector('[data-consent-purpose="SMS_CUSTOMER_CARE"]')).not.toBeNull()
}

/** The group renders after the phone input in document order. */
function expectAfterPhone() {
  const group = container.querySelector('[data-consent-purpose="SMS_CUSTOMER_CARE"]')!
  const pos = telInput().compareDocumentPosition(group)
  expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
}

const hotel: any = {
  id: 'h1', name: 'Test Hotel', stars: 4, address: 'x', city: 'London', imageUrl: '',
  pricePerNight: { amount: 100, currency: 'GBP' }, totalPrice: { amount: 200, currency: 'GBP' },
  roomType: 'Double', mealPlan: 'BB', isRefundable: true, rateKey: 'rk', images: [],
}
const transfer: any = { id: 't1', vehicleName: 'Sedan', transferType: 'PRIVATE', price: 50, currency: 'GBP', rateKey: 'rk' }
const activity: any = {
  code: 'a1', name: 'Tour', modalities: [{ code: 'm1', name: 'Std', amountFrom: '20', currency: 'GBP' }],
  images: [],
}

const modalCases: Array<{
  name: string
  render: () => React.ReactElement
  capturePage: string
  source: string
}> = [
  {
    name: 'HotelBookingModal',
    render: () => (
      <HotelBookingModal hotel={hotel} checkIn="2026-10-01" checkOut="2026-10-03" adults={2} rooms={1} onClose={() => {}} />
    ),
    capturePage: '/hotels',
    source: CONSENT_SOURCE_HOTEL_BOOKING,
  },
  {
    name: 'TransferBookingModal',
    render: () => <TransferBookingModal transfer={transfer} search={{ fromCode: 'LHR', fromName: 'Heathrow', toCode: 'X', toName: 'Hotel', fromDate: '2026-10-01', fromTime: '10:00', adults: 1, children: 0 }} onClose={() => {}} />,
    capturePage: '/transfers',
    source: CONSENT_SOURCE_WEB_FORM,
  },
  {
    name: 'ActivityBookingModal',
    render: () => (
      <ActivityBookingModal activity={activity} serviceDate="2026-10-01" adults={1} children={0} onClose={() => {}} />
    ),
    capturePage: '/activities',
    source: CONSENT_SOURCE_WEB_FORM,
  },
]

describe.each(modalCases)('$name', ({ render, capturePage, source }) => {
  function fill() {
    setValue(container.querySelector<HTMLInputElement>('input[type="text"]')!, 'Ada Lovelace')
    setValue(inputByType('email'), 'ada@example.com')
    setValue(telInput(), '+447700900123')
  }

  it('renders one unticked, non-required box beneath the phone input', () => {
    act(() => root.render(render()))
    expectBoxesSane()
    expectAfterPhone()
  })

  it('records the ticked box on Continue to Payment with the right capturePage/source and the typed phone', () => {
    act(() => root.render(render()))
    fill()
    act(() => { box('SMS_CUSTOMER_CARE').click() })
    act(() => { continueBtn().click() })
    const calls = consentCalls()
    expect(calls.map(c => c[0])).toEqual(['/api/consent/sms-customer-care'])
    for (const c of calls) {
      const b = bodyOf(c)
      expect(b).toMatchObject({ phone: '+447700900123', consent: true, capturePage, source })
      expect((c[1] as RequestInit).keepalive).toBe(true)
    }
  })

  it('does not gate Continue on the boxes: unticked proceeds to payment and posts nothing', () => {
    act(() => root.render(render()))
    fill()
    act(() => { continueBtn().click() })
    expect(consentCalls()).toHaveLength(0)
    expect(container.textContent).not.toMatch(/Continue to Payment/)
  })

  it('a consent-network failure does not affect the flow', () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    act(() => root.render(render()))
    fill()
    act(() => { box('SMS_CUSTOMER_CARE').click() })
    expect(() => act(() => { continueBtn().click() })).not.toThrow()
    expect(container.textContent).not.toMatch(/Continue to Payment/)
  })
})

describe('PassengerForm (/book checkout)', () => {
  it('renders the one box unticked/non-required after the contact phone; submit is not gated on them', () => {
    const onSubmit = jest.fn()
    act(() => root.render(<PassengerForm onSubmit={onSubmit} />))
    expectBoxesSane()
    const contactPhone = container.querySelector<HTMLInputElement>('input[name="contactPhone"]')!
    expect(contactPhone).not.toBeNull()
    const group = container.querySelector('[data-consent-purpose="SMS_CUSTOMER_CARE"]')!
    expect(contactPhone.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('source pins: records from the submit handler with /book and the submitted contactPhone, no consent arg on onSubmit', () => {
    const src = read('components/booking/PassengerForm.tsx')
    expect(src).toContain('const sms = useSmsConsent()')
    expect(src).toMatch(/void sms\.record\(\{ phone: data\.contactPhone, capturePage: '\/book' \}\)/)
    expect(src).toContain('{sms.fields}')
    expect(src).not.toContain('SmsCustomerCareConsent')
    // not part of the zod schema (declared before `type FormData`)
    expect(src.slice(src.indexOf('const formSchema'), src.indexOf('type FormData'))).not.toMatch(/sms|consent/i)
  })

  it('app/book/page.tsx no longer double-posts consent itself', () => {
    const src = read('app/book/page.tsx')
    expect(src).not.toContain('/api/consent/')
    expect(src).not.toContain('smsConsent')
  })
})

describe('source pins for the full pages', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('/hotels/book: hook, fields under the phone loop, record before payment step with hotel source', () => {
    const src = strip(read('app/hotels/book/page.tsx'))
    expect(src).toContain('const sms = useSmsConsent()')
    expect(src).toContain('{sms.fields}')
    expect(src).toMatch(
      /void sms\.record\(\{ phone, capturePage: '\/hotels\/book', source: CONSENT_SOURCE_HOTEL_BOOKING \}\)\s*\n\s*setStep\('payment'\)/,
    )
    expect(src).not.toContain('SmsCustomerCareConsent')
    expect(src).not.toMatch(/await sms\.record/)
  })

  it('/flights/traveller: hook, fields directly after the lead phone field, record after validation, before navigation', () => {
    const src = strip(read('app/(public)/flights/traveller/page.tsx'))
    expect(src).toContain('const sms = useSmsConsent()')
    expect(src).toContain('{sms.fields}')
    expect(src.indexOf("field('phone'")).toBeLessThan(src.indexOf('{sms.fields}'))
    const rec = src.indexOf("void sms.record({ phone: pax[0]?.phone ?? '', capturePage: '/flights/traveller' })")
    expect(rec).toBeGreaterThan(-1)
    expect(rec).toBeLessThan(src.indexOf("router.push('/flights/extras')"))
    expect(rec).toBeGreaterThan(src.indexOf('if (!validate())'))
    expect(src).not.toContain('SmsCustomerCareConsent')
  })

  it('/insurance: hook in the checkout modal, fields after the phone field, record on submit before the order request', () => {
    const src = strip(read('app/insurance/page.tsx'))
    expect(src).toContain('const sms = useSmsConsent()')
    expect(src).toMatch(/field\('phone'[^\n]*\n\s*\{sms\.fields\}/)
    const rec = src.indexOf("void sms.record({ phone: form.phone, capturePage: '/insurance', source: CONSENT_SOURCE_WEB_FORM })")
    expect(rec).toBeGreaterThan(-1)
    expect(rec).toBeLessThan(src.indexOf("fetch('/api/insurance/order'"))
    expect(src).not.toMatch(/await sms\.record/)
  })

  it.each([
    'app/hotels/book/page.tsx',
    'app/(public)/flights/traveller/page.tsx',
    'app/insurance/page.tsx',
    'components/booking/PassengerForm.tsx',
    'components/hotels/HotelBookingModal.tsx',
    'components/transfers/TransferBookingModal.tsx',
    'components/activities/ActivityBookingModal.tsx',
  ])('%s never gates or disables anything on the consent state, nor sets it', file => {
    const src = strip(read(file))
    expect(src).not.toMatch(/sms\.customerCare\b/)
    expect(src).not.toMatch(/sms\.setCustomerCare\(/)
    expect(src).not.toMatch(/disabled=\{[^}]*sms\./)
  })

  it('OneTapModal (saved passenger) is intentionally untouched', () => {
    expect(read('components/flights/OneTapModal.tsx')).not.toContain('useSmsConsent')
  })
})
