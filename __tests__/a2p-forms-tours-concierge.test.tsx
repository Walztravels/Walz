/**
 * @jest-environment jsdom
 *
 * A2P wiring for Group C forms (tours, packages, concierge). ConciergeRequestForm
 * is rendered for real (react-dom + act); the heavier payment/airport forms are
 * pinned at source level so the wiring cannot silently regress.
 */
import fs from 'fs'
import path from 'path'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { ConciergeRequestForm } from '@/components/concierge/ConciergeRequestForm'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ROOT = path.resolve(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ─── Rendered: ConciergeRequestForm ──────────────────────────────────────────

let container: HTMLDivElement
let root: Root
const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url) === '/api/concierge/requests') {
      return { ok: true, json: async () => ({ reference: 'CON-1', sla: '2h' }) }
    }
    return { ok: true, json: async () => ({}) }
  })
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
const consentCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/consent/'))
const bookingCalls = () => fetchMock.mock.calls.filter(([u]) => String(u) === '/api/concierge/requests')

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function textInputs() {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])'))
}
async function submit() {
  const form = container.querySelector('form')!
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}
function fillContact(phone: string) {
  const [name, email, ph] = textInputs()
  setInput(name, 'Jane Doe')
  setInput(email, 'jane@example.com')
  setInput(ph, phone)
}

describe('ConciergeRequestForm (rendered)', () => {
  const mount = () =>
    act(() => root.render(<ConciergeRequestForm categorySlug="chauffeur" categoryName="Chauffeur" fields={[]} />))

  it('renders the one box directly after the phone field, unticked and not required', () => {
    mount()
    const inputs = textInputs()
    const phoneInput = inputs[2]
    expect(boxes()).toHaveLength(1)
    for (const b of boxes()) {
      expect(b.checked).toBe(false)
      expect(b.required).toBe(false)
      expect(b.hasAttribute('required')).toBe(false)
      expect(b.getAttribute('aria-required')).toBeNull()
      // consent boxes come after the phone input in document order
      expect(phoneInput.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(container.querySelector('[data-consent-purpose="SMS_CUSTOMER_CARE"]')).not.toBeNull()
  })

  it('submits and records nothing when boxes are unticked (consent never gates the request)', async () => {
    mount()
    fillContact('+2348012345678')
    await submit()
    expect(bookingCalls()).toHaveLength(1)
    expect(consentCalls()).toHaveLength(0)
  })

  it('submits with no phone at all and sends no consent call even if ticked', async () => {
    mount()
    const [name, email] = textInputs()
    setInput(name, 'Jane Doe')
    setInput(email, 'jane@example.com')
    act(() => { boxes()[0].click() })
    await submit()
    expect(bookingCalls()).toHaveLength(1)
    expect(consentCalls()).toHaveLength(0)
  })

  it('records only the ticked box with the right capturePage/source on the submit path', async () => {
    mount()
    fillContact('+2348012345678')
    act(() => { boxes()[0].click() })
    await submit()
    expect(bookingCalls()).toHaveLength(1)
    const calls = consentCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('/api/consent/sms-customer-care')
    const body = JSON.parse(calls[0][1].body)
    expect(body).toMatchObject({
      phone: '+2348012345678',
      capturePage: '/concierge/chauffeur',
      source: 'web_form_sms',
      consent: true,
    })
  })

  it('a failing consent POST never affects the booking result', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/consent/')) throw new Error('boom')
      return { ok: true, json: async () => ({ reference: 'CON-9', sla: '2h' }) }
    })
    mount()
    fillContact('+2348012345678')
    act(() => { boxes()[0].click() })
    await submit()
    expect(container.textContent).toContain('CON-9')
  })
})

// ─── Source-level pins for the other forms ───────────────────────────────────

const HOOK_IMPORT = "from '@/components/consent/useSmsConsent'"

interface Pin {
  file: string
  fields: number // expected `{sms.fields}` occurrences
  records: { capturePage: RegExp; source: string }[]
  phoneMarker: RegExp // phone input appears before sms.fields
}

const PINS: Pin[] = [
  {
    file: 'app/tours/book/page.tsx',
    fields: 1,
    records: [{ capturePage: /capturePage: '\/tours\/book'/, source: 'CONSENT_SOURCE_TOUR_BOOKING' }],
    phoneMarker: /type="tel"/,
  },
  {
    file: 'app/tours/page.tsx',
    fields: 1,
    records: [{ capturePage: /capturePage: '\/tours'/, source: 'CONSENT_SOURCE_TOUR_BOOKING' }],
    phoneMarker: /register\('phone'\)/,
  },
  {
    file: 'components/PackageBookingModal.tsx',
    fields: 1,
    records: [
      { capturePage: /capturePage: '\/packages'/, source: 'CONSENT_SOURCE_WEB_FORM' },
      { capturePage: /capturePage: '\/packages'/, source: 'CONSENT_SOURCE_WEB_FORM' },
    ],
    phoneMarker: /id="client-phone"/,
  },
  {
    file: 'components/packages/BookingCard.tsx',
    fields: 1,
    records: [{ capturePage: /capturePage: '\/packages'/, source: 'CONSENT_SOURCE_WEB_FORM' }],
    phoneMarker: /Phone number \(optional\)/,
  },
  {
    file: 'app/concierge/private-aviation/CharterForm.tsx',
    fields: 1,
    records: [{ capturePage: /capturePage: '\/concierge\/private-aviation'/, source: 'CONSENT_SOURCE_WEB_FORM' }],
    phoneMarker: /form\.clientPhone/,
  },
  {
    file: 'components/concierge/ConciergeRequestForm.tsx',
    fields: 1,
    records: [{ capturePage: /capturePage: `\/concierge\/\$\{categorySlug\}`/, source: 'CONSENT_SOURCE_WEB_FORM' }],
    phoneMarker: /contactPhone/,
  },
  {
    file: 'app/concierge/airport-services/[type]/AirportServiceFlow.tsx',
    fields: 2, // StandardFlow + BaggageFlow
    records: [
      { capturePage: /capturePage: `\/concierge\/airport-services\/\$\{type\}`/, source: 'CONSENT_SOURCE_WEB_FORM' },
      { capturePage: /capturePage: '\/concierge\/airport-services\/baggage'/, source: 'CONSENT_SOURCE_WEB_FORM' },
    ],
    phoneMarker: /setLeadPhone/,
  },
]

describe.each(PINS)('$file wiring', (pin) => {
  const src = read(pin.file)

  it('uses the shared hook and renders its fields after the phone input', () => {
    expect(src).toContain(HOOK_IMPORT)
    expect(src).toContain('useSmsConsent()')
    const fieldsCount = (src.match(/\{sms\.fields\}/g) ?? []).length
    expect(fieldsCount).toBe(pin.fields)
    const phoneIdx = src.search(pin.phoneMarker)
    expect(phoneIdx).toBeGreaterThan(-1)
    expect(src.indexOf('{sms.fields}')).toBeGreaterThan(phoneIdx)
  })

  it('records with the right capturePage/source, fire-and-forget (never awaited)', () => {
    const calls = src.match(/sms\.record\(\{[\s\S]*?\}\)/g) ?? []
    expect(calls).toHaveLength(pin.records.length)
    calls.forEach((c, i) => {
      expect(c).toMatch(pin.records[i].capturePage)
      expect(c).toContain(`source: ${pin.records[i].source}`)
    })
    expect(src).not.toMatch(/await\s+sms\.record/)
    for (const c of pin.records) expect(src).toContain(`import { ${c.source} }`)
  })

  it('never makes consent required or gates submit/validation/disabled on it', () => {
    expect(src).not.toMatch(/sms\.customerCare/)
    expect(src).not.toMatch(/disabled=\{[^}]*sms/)
    expect(src).not.toMatch(/required[^\n]*sms\.|sms\.[^\n]*required/)
  })
})

describe('app/tours/book/page.tsx specifics', () => {
  const src = read('app/tours/book/page.tsx')

  it('records once in the shared handlePay step, after the terms check, before any gateway dispatch', () => {
    expect((src.match(/sms\.record\(/g) ?? []).length).toBe(1)
    const start = src.indexOf('function handlePay()')
    const body = src.slice(start, src.indexOf('return (', start))
    const termsGate = body.indexOf('if (!agreed)')
    const rec = body.indexOf('sms.record(')
    const dispatch = body.indexOf("if (gateway === 'stripe')")
    expect(termsGate).toBeGreaterThan(-1)
    expect(rec).toBeGreaterThan(termsGate)
    expect(dispatch).toBeGreaterThan(rec)
    expect(body).toContain('`${details.countryCode}${details.whatsapp}`')
  })

  it('keeps the SMS boxes out of the terms checkbox label (they live in step 2)', () => {
    const stepThree = src.slice(src.indexOf('function StepThree'), src.indexOf('function SuccessPage'))
    expect(stepThree).not.toContain('sms.fields')
    const termsLabel = stepThree.slice(stepThree.indexOf('T&C checkbox'), stepThree.indexOf('data-terms-error'))
    expect(termsLabel).not.toMatch(/sms|Sms/)
  })
})

describe('AirportServiceFlow records before the redirect', () => {
  const src = read('app/concierge/airport-services/[type]/AirportServiceFlow.tsx')
  it('calls record before window.location.href in both flows', () => {
    const parts = src.split('window.location.href = data.checkoutUrl')
    expect(parts.length - 1).toBe(2)
    parts.slice(0, 2).forEach((p) => {
      expect(p.lastIndexOf('sms.record(')).toBeGreaterThan(p.lastIndexOf('const handleCheckout'))
    })
  })
})
