/**
 * @jest-environment jsdom
 *
 * A2P SMS consent wiring: contact page (rendered for real) plus source-level
 * pins for the visa application form, group-visa hive and trip-request forms.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'fs'
import { join } from 'path'

import ContactPage from '@/app/contact/page'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const fetchMock = jest.fn()
let container: HTMLDivElement
let root: Root

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
const consentCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/consent/'))
const setValue = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) =>
  act(() => {
    const proto = Object.getPrototypeOf(el)
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
const q = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)!

describe('/contact (rendered)', () => {
  it('shows one unticked, optional box directly below the phone field with links and sender phrase', () => {
    act(() => root.render(<ContactPage />))
    expect(boxes()).toHaveLength(1)
    for (const b of boxes()) {
      expect(b.checked).toBe(false)
      expect(b.required).toBe(false)
      expect(b.getAttribute('aria-required')).toBeNull()
    }
    const phone = q<HTMLInputElement>('input[aria-label="Phone or WhatsApp number"]')
    const group = q('[data-consent-purpose="SMS_CUSTOMER_CARE"]')
    expect(phone.parentElement!.contains(group)).toBe(true)
    expect(phone.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const hrefs = Array.from(group.querySelectorAll('a')).map(a => a.getAttribute('href'))
    expect(hrefs.some(h => h?.startsWith('/privacy'))).toBe(true)
    expect(hrefs.some(h => h?.startsWith('/terms'))).toBe(true)
    expect(group.textContent).toMatch(/Walz Travels/)
  })

  async function fill(phone: string) {
    setValue(q('input[aria-label="Full name"]'), 'Ada')
    setValue(q('input[aria-label="Email address"]'), 'a@b.co')
    setValue(q('input[aria-label="Phone or WhatsApp number"]'), phone)
    setValue(q('select[aria-label="Enquiry subject"]'), 'General Enquiry')
    setValue(q('textarea[aria-label="Your message"]'), 'hello')
  }
  const submit = async () => {
    const btn = Array.from(container.querySelectorAll('button')).find(b => /Send Enquiry/.test(b.textContent ?? ''))!
    await act(async () => { btn.click() })
  }

  it('submits without ticking anything (not gated) and records nothing', async () => {
    act(() => root.render(<ContactPage />))
    await fill('+447700900000')
    await submit()
    expect(fetchMock.mock.calls.some(([u]) => u === '/api/contact')).toBe(true)
    expect(consentCalls()).toHaveLength(0)
  })

  it('records only after the API responds ok, for the ticked box, with contact source', async () => {
    act(() => root.render(<ContactPage />))
    await fill('+447700900000')
    act(() => { boxes()[0].click() })
    await submit()
    const calls = consentCalls()
    expect(calls).toHaveLength(1)
    const body = String(calls[0][1]?.body)
    expect(body).toContain('+447700900000')
    expect(body).toContain('/contact')
    expect(body).toContain('contact_form_sms')
  })

  it('records nothing when phone is empty', async () => {
    act(() => root.render(<ContactPage />))
    await fill('')
    act(() => { boxes()[0].click() })
    await submit()
    expect(consentCalls()).toHaveLength(0)
  })
})

describe('visa application form (source pins)', () => {
  const s = src('components/VisaApplicationForm.tsx')
  it('renders consent under the phone field and only outside admin-token mode', () => {
    expect(s).toContain('useSmsConsent()')
    expect(s).toMatch(/smsFields=\{isAdminFlow \? null : sms\.fields\}/)
    expect(s).toMatch(/if \(isAdminFlow \|\| !form\.phone\.trim\(\)\) return/)
    const phoneIdx = s.indexOf('label="Phone Number (with country code)"')
    expect(s.indexOf('{smsFields ?', phoneIdx)).toBeGreaterThan(phoneIdx)
    expect(s.indexOf('{smsFields ?', phoneIdx) - phoneIdx).toBeLessThan(400)
  })
  it('records with the visa source and never gates validation on the boxes', () => {
    expect(s).toContain('CONSENT_SOURCE_VISA_APPLICATION')
    expect(s).toContain("capturePage: '/visa/apply'")
    expect(s).not.toMatch(/sms\.customerCare/)
    // admin submit branch must not record
    const admin = s.slice(s.indexOf('if (isAdminFlow && appId && adminToken) {'), s.indexOf('} else if (isManual && appId) {'))
    expect(admin).not.toContain('recordSmsConsent')
    // record only at final submit paths (client-submit ok + payment hand-off), not in autosave
    expect(s.match(/recordSmsConsent\(\)/g)).toHaveLength(2)
    const auto = s.slice(s.indexOf('function useAutoSave'), s.indexOf('function useAutoSave') + 900)
    expect(auto).not.toContain('recordSmsConsent')
  })
  it('does not wire the family phone', () => {
    expect(s).not.toMatch(/record\([^)]*familyPhone/)
  })
})

describe.each([
  ['app/(public)/group-visa/hive/[slug]/page.tsx', 'CONSENT_SOURCE_VISA_APPLICATION', "'/group-visa/hive'", 'value={form.phone}'],
  ['app/trip-request/[token]/page.tsx', 'CONSENT_SOURCE_WEB_FORM', "'/trip-request'", 'value={form.phone}'],
])('%s (source pins)', (file, source, page, phoneAnchor) => {
  const s = src(file)
  it('renders fields right after the phone input and records on successful submit', () => {
    const p = s.indexOf(phoneAnchor)
    const f = s.indexOf('{sms.fields}', p)
    expect(f).toBeGreaterThan(p)
    expect(f - p).toBeLessThan(600)
    expect(s).toContain(`source: ${source}`)
    expect(s).toContain(`capturePage: ${page}`)
    expect(s).toMatch(/void sms\.record\(/)
    expect(s).not.toMatch(/await sms\.record/)
    expect(s).not.toMatch(/sms\.customerCare/)
    expect(s).not.toMatch(/required[^\n]*sms|sms[^\n]*required/)
  })
})

describe('trip-request terms checkbox stays separate', () => {
  const s = src('app/trip-request/[token]/page.tsx')
  it('agreedToTerms gating unchanged and not mixed with sms', () => {
    expect(s).toContain('disabled={submitting || !form.agreedToTerms || !form.signature}')
    const i = s.indexOf('checked={form.agreedToTerms}')
    expect(s.slice(i - 600, i + 1200)).not.toContain('sms.')
  })
})
