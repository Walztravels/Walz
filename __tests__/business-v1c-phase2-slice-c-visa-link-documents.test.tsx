/**
 * @jest-environment jsdom
 *
 * Walz Business (V1-C Phase 2, Slice C) — VisaLinkForm's new client-side
 * document-attachment section, rendered inside the existing (Slice B)
 * review step.
 *
 * Covers, per the slice brief and its addendum:
 *   - Rendering: the file-input UI appears once the recipient reaches the
 *     review step; it does not exist before that.
 *   - Validation: wrong MIME/content, oversized files, and file-count-over-
 *     cap are all rejected with a clear message; valid files are added to
 *     state and shown in review; the remove control works; selection at
 *     the SECURE_LINK_MAX_FILES cap is accepted, one more is rejected.
 *   - Content-spoofing: an executable/HTML/SVG renamed to an allowed
 *     extension is rejected (thin end-to-end proof — the exhaustive matrix
 *     lives in business-v1c-phase2-slice-c-document-validation.test.ts).
 *   - Write safety: fetch() is called exactly once (the Slice A preview
 *     GET) across the ENTIRE flow, including selecting/removing files —
 *     selecting a file never triggers a second call. Zero calls to
 *     storeCaseDocument() or any VisaApplication/VisaCaseDocument/
 *     businessServiceLinkToken write.
 *   - Privacy: no scope IDs/token hash anywhere in rendered output; never
 *     reads or writes localStorage/sessionStorage, even with files
 *     selected; terminology says "Selected", never "Uploaded".
 *
 * This file does NOT re-test the preview API route (Slice A) or the
 * form/review state machine itself (Slice B) — see those slices' own test
 * files, both of which are run unmodified (bar one authorized fix) as
 * regression alongside this one.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

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
const signedDocumentUrl = jest.fn()
jest.mock('@/lib/intelligence/document-store', () => ({
  storeCaseDocument: (...args: unknown[]) => storeCaseDocument(...args),
  signedDocumentUrl: (...args: unknown[]) => signedDocumentUrl(...args),
}))
const mockPrisma = {
  visaApplication: { create: jest.fn(), update: jest.fn() },
  visaCaseDocument: { create: jest.fn(), update: jest.fn() },
  businessServiceLinkToken: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import VisaLinkForm from '@/app/business/visa-link/[token]/VisaLinkForm'
import { SECURE_LINK_MAX_FILES, SECURE_LINK_MAX_FILE_BYTES } from '@/lib/business/visa-link-document-validation'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TOKEN = 'a'.repeat(64)

const fetchMock = jest.fn()
let container: HTMLDivElement
let root: Root
let storageSpies: jest.SpyInstance[]

function mockValidPreview() {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      organizationDisplayName: 'Acme Corp',
      travellerFirstName: 'Jordan',
      destinationPlaceholder: 'Visa application',
    }),
  })
}

async function renderAndFlush() {
  await act(async () => {
    root.render(React.createElement(VisaLinkForm, { token: TOKEN }))
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
const bodyText = () => container.textContent ?? ''

async function goToReview() {
  setValue(input('destinationIso2')!, 'US')
  await act(async () => {
    buttonWithText('Continue to review')!.click()
  })
}

function fileInput(): HTMLInputElement {
  return input('documents')!
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function selectFiles(files: File[]) {
  const el = fileInput()
  Object.defineProperty(el, 'files', { value: files, configurable: true })
  await act(async () => {
    el.dispatchEvent(new Event('change', { bubbles: true }))
    // FileReader's onload fires as a real (macro)task in jsdom, not a
    // microtask — a Promise.resolve() chain alone never flushes it. One
    // real-timer tick per selected file (plus slack) reliably drains the
    // whole async validation pipeline (size check -> FileReader read ->
    // signature check) for every file in this batch.
    for (let i = 0; i < files.length + 2; i++) {
      await wait(0)
    }
  })
}

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}
function asciiBytes(text: string): Uint8Array {
  return new Uint8Array(Array.from(text, c => c.charCodeAt(0)))
}
function padded(sig: Uint8Array, totalLength = 16): Uint8Array {
  const out = new Uint8Array(Math.max(totalLength, sig.length))
  out.set(sig)
  return out
}

function makeFile(name: string, type: string, content: Uint8Array): File {
  return new File([content], name, { type })
}

const PDF_BYTES = padded(asciiBytes('%PDF-1.7'))
const JPEG_BYTES = padded(bytes(0xff, 0xd8, 0xff, 0xe0))
const EXE_BYTES = padded(bytes(0x4d, 0x5a, 0x90, 0))
const HTML_BYTES = padded(asciiBytes('<!DOCTYPE html>'))
const SVG_BYTES = padded(asciiBytes('<svg xmlns="x">'))

function validPdf(name = 'passport.pdf'): File {
  return makeFile(name, 'application/pdf', PDF_BYTES)
}

beforeEach(() => {
  jest.clearAllMocks()
  fetchMock.mockReset()
  ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  storageSpies = [
    jest.spyOn(Storage.prototype, 'setItem'),
    jest.spyOn(Storage.prototype, 'getItem'),
    jest.spyOn(Storage.prototype, 'removeItem'),
  ]
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  storageSpies.forEach(s => s.mockRestore())
})

function expectNoWrites() {
  expect(submitVisaIntake).not.toHaveBeenCalled()
  expect(consumeServiceLinkToken).not.toHaveBeenCalled()
  expect(storeCaseDocument).not.toHaveBeenCalled()
  expect(signedDocumentUrl).not.toHaveBeenCalled()
  expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
  expect(mockPrisma.visaApplication.update).not.toHaveBeenCalled()
  expect(mockPrisma.visaCaseDocument.create).not.toHaveBeenCalled()
  expect(mockPrisma.visaCaseDocument.update).not.toHaveBeenCalled()
  expect(mockPrisma.businessServiceLinkToken.create).not.toHaveBeenCalled()
  expect(mockPrisma.businessServiceLinkToken.update).not.toHaveBeenCalled()
}

describe('VisaLinkForm — Slice C document-attachment rendering', () => {
  it('the file input does not exist before reaching the review step', async () => {
    mockValidPreview()
    await renderAndFlush()
    expect(fileInput()).toBeNull()
  })

  it('the file input appears in the review step, alongside the Slice B form answers', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    expect(bodyText()).toMatch(/Review your answers/)
    expect(fileInput()).not.toBeNull()
    expect(bodyText()).toMatch(/Attach documents/)
    // Form answers still shown in the same screen.
    expect(bodyText()).toMatch(/Destination country code/)
  })

  it('uses "Selected" language and never claims a file WAS uploaded (disclaimers that upload is not yet available are fine)', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([validPdf()])
    expect(bodyText()).toMatch(/selected/i)
    const text = bodyText().toLowerCase()
    // The copy legitimately says files are "not uploaded yet" / upload
    // "isn't available yet" — that is a disclaimer, not a success claim.
    // What must never appear is language implying the upload already
    // happened.
    expect(text).not.toMatch(/uploaded successfully|has been uploaded|file uploaded\b|documents uploaded\b/)
  })
})

describe('VisaLinkForm — Slice C validation', () => {
  it('a valid PDF is accepted and shown in the review list', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([validPdf('my-passport.pdf')])
    expect(bodyText()).toContain('my-passport.pdf')
    expect(bodyText()).toMatch(/1 of \d+ files selected/)
  })

  it('rejects a declared-mismatched MIME type with a clear message', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([makeFile('doc.zip', 'application/zip', bytes(0x50, 0x4b, 0x03, 0x04))])
    expect(bodyText()).toMatch(/Unsupported file type/i)
    expect(bodyText()).not.toContain('doc.zip was added')
  })

  it('rejects an oversized file with a clear message', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    const big = new Uint8Array(SECURE_LINK_MAX_FILE_BYTES + 1)
    big.set(PDF_BYTES)
    await selectFiles([makeFile('huge.pdf', 'application/pdf', big)])
    expect(bodyText()).toMatch(/too large/i)
    expect(bodyText()).not.toContain('huge.pdf (')
  })

  it('accepts a file exactly at the size limit', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    const atLimit = new Uint8Array(SECURE_LINK_MAX_FILE_BYTES)
    atLimit.set(PDF_BYTES)
    await selectFiles([makeFile('at-limit.pdf', 'application/pdf', atLimit)])
    expect(bodyText()).toContain('at-limit.pdf')
    expect(bodyText()).not.toMatch(/too large/i)
  })

  it(`accepts exactly ${10} files at the SECURE_LINK_MAX_FILES cap`, async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    const files = Array.from({ length: SECURE_LINK_MAX_FILES }, (_, i) => validPdf(`doc-${i}.pdf`))
    await selectFiles(files)
    expect(bodyText()).toMatch(new RegExp(`${SECURE_LINK_MAX_FILES} of ${SECURE_LINK_MAX_FILES} files selected`))
    expect(bodyText()).not.toMatch(/maximum of/i)
  })

  it('rejects the (SECURE_LINK_MAX_FILES + 1)th file once the cap is already full', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    const atCap = Array.from({ length: SECURE_LINK_MAX_FILES }, (_, i) => validPdf(`doc-${i}.pdf`))
    await selectFiles(atCap)
    await selectFiles([validPdf('one-too-many.pdf')])
    expect(bodyText()).toMatch(/maximum of \d+ files/i)
    expect(bodyText()).not.toContain('one-too-many.pdf (')
    expect(bodyText()).toMatch(new RegExp(`${SECURE_LINK_MAX_FILES} of ${SECURE_LINK_MAX_FILES} files selected`))
  })

  it('the remove control removes a selected file from the list', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([validPdf('to-remove.pdf')])
    expect(bodyText()).toContain('to-remove.pdf')
    await act(async () => {
      buttonWithText('Remove')!.click()
    })
    expect(bodyText()).not.toContain('to-remove.pdf')
    expect(bodyText()).toMatch(/0 of \d+ files selected/)
  })

  it('removing a file frees up a slot for a new one at the cap', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    const atCap = Array.from({ length: SECURE_LINK_MAX_FILES }, (_, i) => validPdf(`doc-${i}.pdf`))
    await selectFiles(atCap)
    await act(async () => {
      buttonWithText('Remove')!.click()
    })
    await selectFiles([validPdf('replacement.pdf')])
    expect(bodyText()).toContain('replacement.pdf')
  })
})

describe('VisaLinkForm — Slice C content-spoofing (thin end-to-end proof)', () => {
  it('rejects an executable renamed .pdf', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([makeFile('invoice.pdf', 'application/pdf', EXE_BYTES)])
    expect(bodyText()).toMatch(/executable/i)
    expect(bodyText()).not.toContain('invoice.pdf (')
  })

  it('rejects an HTML file renamed .pdf', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([makeFile('letter.pdf', 'application/pdf', HTML_BYTES)])
    expect(bodyText()).toMatch(/HTML/i)
  })

  it('rejects an SVG file renamed .jpg declared as image/jpeg', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([makeFile('photo.jpg', 'image/jpeg', SVG_BYTES)])
    expect(bodyText()).toMatch(/SVG/i)
  })

  it('accepts a genuinely valid JPEG for contrast (the detector is not simply rejecting everything)', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([makeFile('real.jpg', 'image/jpeg', JPEG_BYTES)])
    expect(bodyText()).toContain('real.jpg')
  })
})

describe('VisaLinkForm — Slice C write safety (zero network calls, zero writes)', () => {
  it('exactly one fetch call total (the preview GET) across selecting, removing, and rejecting files', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([validPdf('a.pdf')])
    await selectFiles([makeFile('bad.exe', 'application/pdf', EXE_BYTES)])
    await act(async () => {
      buttonWithText('Remove')!.click()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/business/link/${TOKEN}/preview`)
  })

  it('zero storeCaseDocument/VisaApplication/VisaCaseDocument/token writes across a full select->remove cycle', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([validPdf('a.pdf'), makeFile('bad.exe', 'application/pdf', EXE_BYTES)])
    await act(async () => {
      buttonWithText('Remove')!.click()
    })
    expectNoWrites()
  })

  it('the final "Continue to Documents" action stays disabled and non-functional exactly as Slice B left it', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([validPdf()])
    const continueBtn = buttonWithText('Continue to Documents')!
    expect(continueBtn.hasAttribute('disabled')).toBe(true)
    const fetchCallsBefore = fetchMock.mock.calls.length
    await act(async () => {
      continueBtn.click()
    })
    expect(fetchMock.mock.calls.length).toBe(fetchCallsBefore)
    expectNoWrites()
  })
})

describe('VisaLinkForm — Slice C privacy', () => {
  it('no scope identifiers or token hash appear anywhere, even with files selected', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([validPdf()])
    const html = container.innerHTML
    for (const leaked of [/organizationId/i, /businessTravellerId/i, /travelRequestId/i, /travelRequestServiceId/i, /membershipId/i, /linkTokenId/i, /tokenHash/i]) {
      expect(html).not.toMatch(leaked)
    }
    expect(html).not.toContain(TOKEN)
  })

  it('never reads or writes localStorage/sessionStorage, even after selecting and removing files', async () => {
    mockValidPreview()
    await renderAndFlush()
    await goToReview()
    await selectFiles([validPdf('a.pdf')])
    await act(async () => {
      buttonWithText('Remove')!.click()
    })
    storageSpies.forEach(s => expect(s).not.toHaveBeenCalled())
  })
})
