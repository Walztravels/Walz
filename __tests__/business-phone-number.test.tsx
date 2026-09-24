/**
 * @jest-environment jsdom
 *
 * Business phone-number correction. The Walz Travels PHONE (call) number and
 * WHATSAPP number are the SAME number: +1 231 790 2336 (E.164 +12317902336).
 * A wrong, separately-typed copy of the phone number had reached the live
 * site (footer, contact card, structured data, settings). These tests pin
 * the single source of truth and guard against a stale copy returning.
 */
import fs from 'fs'
import path from 'path'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import ContactPage from '@/app/contact/page'
import { BUSINESS, waLink } from '@/lib/config/business'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ROOT = process.cwd()
const CORRECT_DISPLAY = '+1 231 790 2336'
const CORRECT_E164 = '12317902336'

// Built from parts so this test file itself never contains the literal.
const WRONG_VARIANTS = [
  ['1', '984', '388', '0110'].join(''),
  ['984', '388', '0110'].join(''),
  ['984', '388', '0110'].join(' '),
  ['984', '388', '0110'].join('-'),
  ['+1', '984'].join(' '),
]

describe('single source of truth', () => {
  it('phone and WhatsApp are the SAME number', () => {
    expect(BUSINESS.contacts.emergencyPhone.display).toBe(CORRECT_DISPLAY)
    expect(BUSINESS.contacts.emergencyPhone.e164).toBe(CORRECT_E164)
    expect(BUSINESS.contacts.globalWhatsapp.display).toBe(CORRECT_DISPLAY)
    expect(BUSINESS.contacts.globalWhatsapp.e164).toBe(CORRECT_E164)
    expect(BUSINESS.contacts.emergencyPhone).toBe(BUSINESS.contacts.globalWhatsapp)
  })

  it('builds the required tel: and wa.me links', () => {
    expect(`tel:+${BUSINESS.contacts.emergencyPhone.e164}`).toBe('tel:+12317902336')
    expect(waLink(BUSINESS.contacts.globalWhatsapp.e164)).toBe('https://wa.me/12317902336')
  })

  it('structured data telephone comes from the same source (+12317902336)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'components/StructuredData.tsx'), 'utf8')
    expect(src).toMatch(/telephone:\s*`\+\$\{BUSINESS\.contacts\.emergencyPhone\.e164\}`/)
    expect(`+${BUSINESS.contacts.emergencyPhone.e164}`).toBe('+12317902336')
  })
})

describe('no stale copy of the wrong number anywhere in shipped sources', () => {
  const SCAN_DIRS = ['app', 'lib', 'components', 'public', 'prisma', 'supabase', 'docs']
  const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.claude'])
  // The correction SQL legitimately names the wrong number as its match pattern.
  const ALLOWED = new Set([path.join('scripts', 'business_phone_correction_v1.sql')])

  const walk = (dir: string, out: string[] = []): string[] => {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) return out
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(rel, out)
      } else if (/\.(ts|tsx|js|jsx|json|md|txt|sql|prisma|html|css|mjs)$/.test(e.name)) out.push(rel)
    }
    return out
  }

  it('none of the wrong-number variants appear in app/lib/components/public/prisma/supabase/docs', () => {
    const hits: string[] = []
    for (const f of SCAN_DIRS.flatMap((d) => walk(d))) {
      if (ALLOWED.has(f)) continue
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8')
      for (const v of WRONG_VARIANTS) if (s.includes(v)) hits.push(`${f}: ${v}`)
    }
    expect(hits).toEqual([])
  })

  it('llms.txt lists the correct phone', () => {
    const t = fs.readFileSync(path.join(ROOT, 'public/llms.txt'), 'utf8')
    expect(t).toContain('- Phone: +12317902336')
  })
})

describe('the rendered /contact page', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    ;(globalThis as unknown as { fetch: unknown }).fetch = jest.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('shows the phone card with +1 231 790 2336 and tel:+12317902336, and WhatsApp with wa.me/12317902336', () => {
    act(() => root.render(<ContactPage />))
    const tel = container.querySelector<HTMLAnchorElement>('a[href^="tel:"]')!
    expect(tel.getAttribute('href')).toBe('tel:+12317902336')
    expect(tel.textContent).toContain('+1 231 790 2336')
    const wa = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="https://wa.me/"]'))
    expect(wa.length).toBeGreaterThan(0)
    for (const a of wa) expect(a.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/12317902336/)
    expect(container.textContent).toContain('+1 231 790 2336')
    for (const v of WRONG_VARIANTS) expect(container.innerHTML).not.toContain(v)
  })

  it('leaves the approved A2P consent panel untouched (one unchecked, optional box)', () => {
    act(() => root.render(<ContactPage />))
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect(boxes).toHaveLength(1)
    expect(boxes[0].checked).toBe(false)
    expect(boxes[0].required).toBe(false)
    expect(container.textContent).toContain(
      'I agree to receive SMS messages from The Walz Travels Inc., operating as Walz Travels, regarding my travel enquiries, bookings, payments, itinerary updates, visa-service updates and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.',
    )
  })
})
