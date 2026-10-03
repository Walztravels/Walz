/**
 * @jest-environment jsdom
 *
 * Walz Business (V1-C Phase 2, Slice B) — VisaLinkForm's new intake
 * FORM -> REVIEW flow, rendered in the 'valid' preview branch.
 *
 * Covers, per the slice brief:
 *   - Rendering: valid preview renders the actual discovered fields;
 *     required fields correctly marked; an invalid preview state never
 *     renders the form; only minimal org/traveller context is shown.
 *   - Validation: valid values proceed to review; destination validation
 *     matches the exact domain rule (strict 2-letter ISO, rejects
 *     malformed rather than silently truncating); email format is NOT
 *     validated client-side — only length — matching submitVisaIntake()'s
 *     own rule exactly (SLICE C ADDENDUM FIX: Slice B originally added a
 *     stricter-than-domain EMAIL_SHAPE regex; that LOW was fixed per an
 *     authorized follow-up instruction — see VisaLinkForm.tsx's updated
 *     header comment and validate() for the full write-up); overlength
 *     fields rejected per the exact FIELD_LIMITS; required fields block
 *     proceeding; whitespace/trim/case handling matches the domain's own
 *     handling.
 *   - Privacy: no scope IDs anywhere in rendered output or hidden inputs,
 *     no token hash, no linkTokenId, form state never serialized into the
 *     URL, no localStorage/sessionStorage usage.
 *   - Write safety: zero calls to submitVisaIntake(), consumeServiceLinkToken(),
 *     storeCaseDocument(), any VisaApplication/VisaCaseDocument create/update,
 *     or any token write method — across both successful form completion and
 *     invalid-input attempts.
 *
 * This file does NOT re-test the preview API route itself (that is
 * __tests__/business-v1c-phase2-slice-a-visa-link-preview.test.ts, untouched
 * by this slice) — it mocks global.fetch directly to drive the component's
 * own state machine, exactly as the API route test already proved that
 * machine's contract at the HTTP layer.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// Write-surface mocks — asserted NOT called anywhere in this file. Listed
// explicitly so a missing assertion is visible in a diff.
const submitVisaIntake = jest.fn()
jest.mock('@/lib/business/visa-intake', () => ({
  submitVisaIntake: (...args: unknown[]) => submitVisaIntake(...args),
}))
const consumeServiceLinkToken = jest.fn()
const validateServiceLinkToken = jest.fn()
jest.mock('@/lib/business/service-link-token', () => ({
  consumeServiceLinkToken: (...args: unknown[]) => consumeServiceLinkToken(...args),
  validateServiceLinkToken: (...args: unknown[]) => validateServiceLinkToken(...args),
}))
const storeCaseDocument = jest.fn()
jest.mock('@/lib/intelligence/document-store', () => ({
  storeCaseDocument: (...args: unknown[]) => storeCaseDocument(...args),
}))
const mockPrisma = {
  visaApplication: { create: jest.fn(), update: jest.fn() },
  visaCaseDocument: { create: jest.fn(), update: jest.fn() },
  businessServiceLinkToken: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import VisaLinkForm from '@/app/business/visa-link/[token]/VisaLinkForm'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TOKEN = 'a'.repeat(64)

const fetchMock = jest.fn()
let container: HTMLDivElement
let root: Root
let consoleSpies: jest.SpyInstance[]
let storageSpies: jest.SpyInstance[]
let historySpies: jest.SpyInstance[]

function mockValidPreview(overrides: Partial<{ organizationDisplayName: string; travellerFirstName: string; destinationPlaceholder: string }> = {}) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      organizationDisplayName: 'Acme Corp',
      travellerFirstName: 'Jordan',
      destinationPlaceholder: 'Visa application',
      ...overrides,
    }),
  })
}

function mockInvalidPreview() {
  fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ ok: false }) })
}

async function renderAndFlush(token: string = TOKEN) {
  await act(async () => {
    root.render(React.createElement(VisaLinkForm, { token }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

const setValue = (el: HTMLInputElement, v: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })

const input = (name: string) => container.querySelector<HTMLInputElement>(`input[name="${name}"]`)
const buttonWithText = (text: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === text)
const clickContinueToReview = async () => {
  await act(async () => { buttonWithText('Continue to review')!.click() })
}
const bodyText = () => container.textContent ?? ''

beforeEach(() => {
  jest.clearAllMocks()
  fetchMock.mockReset()
  ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  consoleSpies = (['log', 'warn', 'error', 'info', 'debug'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => {}))
  storageSpies = [
    jest.spyOn(Storage.prototype, 'setItem'),
    jest.spyOn(Storage.prototype, 'getItem'),
    jest.spyOn(Storage.prototype, 'removeItem'),
  ]
  historySpies = [jest.spyOn(window.history, 'pushState'), jest.spyOn(window.history, 'replaceState')]
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  consoleSpies.forEach(s => s.mockRestore())
  storageSpies.forEach(s => s.mockRestore())
  historySpies.forEach(s => s.mockRestore())
})

function expectNoWrites() {
  expect(submitVisaIntake).not.toHaveBeenCalled()
  expect(consumeServiceLinkToken).not.toHaveBeenCalled()
  expect(storeCaseDocument).not.toHaveBeenCalled()
  expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
  expect(mockPrisma.visaApplication.update).not.toHaveBeenCalled()
  expect(mockPrisma.visaCaseDocument.create).not.toHaveBeenCalled()
  expect(mockPrisma.visaCaseDocument.update).not.toHaveBeenCalled()
  expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  expect(mockPrisma.businessServiceLinkToken.update).not.toHaveBeenCalled()
  expect(mockPrisma.businessServiceLinkToken.updateMany).not.toHaveBeenCalled()
  expect(mockPrisma.businessServiceLinkToken.delete).not.toHaveBeenCalled()
}

function expectNoConsoleCalls() {
  consoleSpies.forEach(s => expect(s).not.toHaveBeenCalled())
}

function expectNoStorageOrUrlUsage() {
  storageSpies.forEach(s => expect(s).not.toHaveBeenCalled())
  historySpies.forEach(s => expect(s).not.toHaveBeenCalled())
}

describe('VisaLinkForm — Slice B rendering', () => {
  it('a valid preview renders the exact discovered fields: destinationIso2, visaType, firstName, lastName, email — nothing else', async () => {
    mockValidPreview()
    await renderAndFlush()
    expect(input('destinationIso2')).not.toBeNull()
    expect(input('visaType')).not.toBeNull()
    expect(input('firstName')).not.toBeNull()
    expect(input('lastName')).not.toBeNull()
    expect(input('email')).not.toBeNull()
    // No forbidden fields anywhere: passport, DOB, nationality, address,
    // employment, family, travel history, refusal history, financial.
    // "family-name" is excluded from this check: it is the standard HTML
    // autocomplete token on the lastName <input> (autoComplete="family-name"),
    // not a family-information field — stripped before the substring check.
    const html = container.innerHTML.toLowerCase().replace(/autocomplete="family-name"/g, '')
    for (const forbidden of ['passport', 'dob', 'dateofbirth', 'nationality', 'address', 'employ', 'family', 'refusal', 'financ', 'income', 'bankstatement']) {
      expect(html).not.toContain(forbidden)
    }
  })

  it('marks destinationIso2 as required (aria-required) and the rest as optional', async () => {
    mockValidPreview()
    await renderAndFlush()
    expect(input('destinationIso2')!.getAttribute('aria-required')).toBe('true')
    expect(bodyText()).toMatch(/Visa type.*\(optional\)/s)
    expect(bodyText()).toMatch(/First name.*\(optional\)/s)
    expect(bodyText()).toMatch(/Last name.*\(optional\)/s)
    expect(bodyText()).toMatch(/Email.*\(optional\)/s)
  })

  it('prefills firstName from the already-exposed travellerFirstName preview field, still editable', async () => {
    mockValidPreview({ travellerFirstName: 'Priya' })
    await renderAndFlush()
    expect(input('firstName')!.value).toBe('Priya')
    setValue(input('firstName')!, 'Priyanka')
    expect(input('firstName')!.value).toBe('Priyanka')
  })

  it('leaves lastName and email empty (not prefilled) — Slice A preview never exposes them', async () => {
    mockValidPreview()
    await renderAndFlush()
    expect(input('lastName')!.value).toBe('')
    expect(input('email')!.value).toBe('')
  })

  it('an invalid preview state never renders the form at all', async () => {
    mockInvalidPreview()
    await renderAndFlush()
    expect(input('destinationIso2')).toBeNull()
    expect(input('visaType')).toBeNull()
    expect(input('firstName')).toBeNull()
    expect(input('lastName')).toBeNull()
    expect(input('email')).toBeNull()
    expect(bodyText()).toMatch(/no longer available/i)
  })

  it('a fetch-failed state also never renders the form', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    await renderAndFlush()
    expect(input('destinationIso2')).toBeNull()
  })

  it('only minimal org/traveller context is shown — the two Slice A preview strings, nothing more', async () => {
    mockValidPreview({ organizationDisplayName: 'Acme Corp', travellerFirstName: 'Jordan' })
    await renderAndFlush()
    expect(bodyText()).toContain('Acme Corp')
    expect(bodyText()).toContain('Jordan')
  })
})

describe('VisaLinkForm — Slice B validation (mirrors submitVisaIntake() exactly)', () => {
  it('valid values proceed to the review step', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    await clickContinueToReview()
    expect(bodyText()).toMatch(/Review your answers/)
    expect(buttonWithText('Continue to review')).toBeUndefined()
  })

  it('blocks proceeding when destinationIso2 (the only hard-required field) is empty', async () => {
    mockValidPreview()
    await renderAndFlush()
    await clickContinueToReview()
    expect(bodyText()).toMatch(/Destination country is required/)
    expect(bodyText()).not.toMatch(/Review your answers/)
  })

  it('rejects a malformed 3-letter destination code rather than silently truncating it to 2 letters', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'USA')
    await clickContinueToReview()
    expect(bodyText()).toMatch(/2-letter country code/)
    expect(bodyText()).not.toMatch(/Review your answers/)
    // Never silently cut down — the field still shows what was typed, not a
    // truncated "US".
    expect(input('destinationIso2')!.value).toBe('USA')
  })

  it('rejects a 1-letter or non-letter destination code', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, '7U')
    await clickContinueToReview()
    expect(bodyText()).toMatch(/2-letter country code/)
  })

  it('accepts lowercase/mixed-case and trims whitespace, normalizing to uppercase exactly as submitVisaIntake() does', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, '  us  ')
    await clickContinueToReview()
    expect(bodyText()).toMatch(/Review your answers/)
    // Displayed normalized in the review step.
    expect(bodyText()).toMatch(/US/)
  })

  // SLICE C ADDENDUM FIX (was "rejects an invalid email shape"): Slice B
  // originally rejected this value via a client-only EMAIL_SHAPE regex
  // that has no counterpart in submitVisaIntake() (which never validates
  // email FORMAT, only length) — an authorized follow-up instruction fixed
  // that LOW. This test now proves the fix: an odd-shaped-but-short email
  // is NO LONGER rejected and proceeds to review, exactly matching the
  // domain's own length-only rule.
  it('does not reject an odd-shaped-but-short email — the domain itself never validates email format, only length', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    setValue(input('email')!, 'not-an-email')
    await clickContinueToReview()
    expect(bodyText()).not.toMatch(/valid email address/)
    expect(bodyText()).toMatch(/Review your answers/)
  })

  it('an empty email is valid (optional field) and proceeds to review', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    await clickContinueToReview()
    expect(bodyText()).toMatch(/Review your answers/)
  })

  it('rejects an overlength visaType per FIELD_LIMITS.VISA_TYPE (50)', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    setValue(input('visaType')!, 'x'.repeat(51))
    await clickContinueToReview()
    expect(bodyText()).toMatch(/Visa type must be at most 50 characters/)
  })

  it('accepts a visaType exactly at the 50-character limit', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    setValue(input('visaType')!, 'x'.repeat(50))
    await clickContinueToReview()
    expect(bodyText()).toMatch(/Review your answers/)
  })

  it('rejects an overlength firstName per FIELD_LIMITS.PERSON_NAME (150)', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    setValue(input('firstName')!, 'x'.repeat(151))
    await clickContinueToReview()
    expect(bodyText()).toMatch(/First name must be at most 150 characters/)
  })

  it('rejects an overlength lastName per FIELD_LIMITS.PERSON_NAME (150)', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    setValue(input('lastName')!, 'x'.repeat(151))
    await clickContinueToReview()
    expect(bodyText()).toMatch(/Last name must be at most 150 characters/)
  })

  it('rejects an overlength email per FIELD_LIMITS.EMAIL (254)', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    setValue(input('email')!, `${'x'.repeat(250)}@a.co`)
    await clickContinueToReview()
    expect(bodyText()).toMatch(/Email must be at most 254 characters/)
  })

  it('an edit from review returns to the form without losing previously entered values', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'GB')
    setValue(input('visaType')!, 'business')
    await clickContinueToReview()
    expect(bodyText()).toMatch(/Review your answers/)
    await act(async () => { buttonWithText('Edit answers')!.click() })
    expect(input('destinationIso2')!.value).toBe('GB')
    expect(input('visaType')!.value).toBe('business')
  })

  it('the review step explicitly labels blank optional fields as using existing/default data, never implying loss', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    setValue(input('firstName')!, '')
    await clickContinueToReview()
    expect(bodyText()).toMatch(/defaults to "tourist"/)
    expect(bodyText()).toMatch(/will use what's on file/)
  })
})

describe('VisaLinkForm — Slice B privacy', () => {
  it('no scope identifiers (org/traveller/request/service/membership/token) appear anywhere in rendered output', async () => {
    mockValidPreview()
    await renderAndFlush()
    const html = container.innerHTML
    for (const leaked of [/organizationId/i, /businessTravellerId/i, /travelRequestId/i, /travelRequestServiceId/i, /membershipId/i, /linkTokenId/i, /tokenHash/i]) {
      expect(html).not.toMatch(leaked)
    }
    expect(html).not.toContain(TOKEN)
  })

  it('no hidden input fields exist anywhere in the form', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    await clickContinueToReview()
    expect(container.querySelectorAll('input[type="hidden"]').length).toBe(0)
  })

  it('never reads or writes localStorage/sessionStorage, across the full form -> review -> edit flow', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    setValue(input('email')!, 'person@example.com')
    await clickContinueToReview()
    await act(async () => { buttonWithText('Edit answers')!.click() })
    expectNoStorageOrUrlUsage()
  })

  it('never serializes form state or the token into the URL/history', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    setValue(input('email')!, 'person@example.com')
    await clickContinueToReview()
    expectNoStorageOrUrlUsage()
    expect(window.location.search).toBe('')
  })

  it('never calls console.* with the token or any field value, across valid and invalid attempts', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'USA') // invalid attempt
    await clickContinueToReview()
    setValue(input('destinationIso2')!, 'US') // then valid
    await clickContinueToReview()
    expectNoConsoleCalls()
  })
})

describe('VisaLinkForm — Slice B write safety', () => {
  it('zero write calls across a fully successful form -> review -> edit cycle', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    setValue(input('visaType')!, 'business')
    setValue(input('firstName')!, 'Jordan')
    setValue(input('lastName')!, 'Smith')
    setValue(input('email')!, 'jordan@example.com')
    await clickContinueToReview()
    await act(async () => { buttonWithText('Edit answers')!.click() })
    expectNoWrites()
  })

  it('zero write calls when validation fails repeatedly', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'USA')
    await clickContinueToReview()
    setValue(input('email')!, 'not-an-email')
    await clickContinueToReview()
    expectNoWrites()
  })

  it('the "Continue to Documents" control in review is disabled and non-functional — clicking it triggers no fetch or write', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    await clickContinueToReview()
    const continueBtn = buttonWithText('Continue to Documents')!
    expect(continueBtn.hasAttribute('disabled')).toBe(true)
    const fetchCallsBefore = fetchMock.mock.calls.length
    await act(async () => { continueBtn.click() })
    expect(fetchMock.mock.calls.length).toBe(fetchCallsBefore)
    expectNoWrites()
  })

  it('exactly one fetch call total (the preview GET) across the whole lifecycle — never a second call for submission', async () => {
    mockValidPreview()
    await renderAndFlush()
    setValue(input('destinationIso2')!, 'US')
    await clickContinueToReview()
    await act(async () => { buttonWithText('Edit answers')!.click() })
    await clickContinueToReview()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/business/link/${TOKEN}/preview`)
  })
})
