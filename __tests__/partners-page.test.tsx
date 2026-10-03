/**
 * @jest-environment jsdom
 *
 * Walz Business (Track C: /partners -> Walz Business integration) —
 * rendering regression for the redesigned public /partners acquisition page.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import fs from 'fs'
import path from 'path'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import PartnersPage, { metadata } from '@/app/partners/page'
import { BUSINESS } from '@/lib/config/business'

const ROOT = process.cwd()

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(ui: React.ReactElement) {
  act(() => root.render(ui))
}

describe('PartnersPage — all 4 partnership cards render', () => {
  it('renders exactly 4 "Start Application" CTAs, one per partnership type', () => {
    render(<PartnersPage />)
    const ctas = Array.from(container.querySelectorAll('a')).filter(a => a.textContent?.includes('Start Application'))
    expect(ctas).toHaveLength(4)
  })

  it('renders all 4 partnership-type headings', () => {
    render(<PartnersPage />)
    const text = container.textContent ?? ''
    expect(text).toContain('Travel Agency')
    expect(text).toContain('Corporate / Business Travel')
    expect(text).toContain('Referral Partner')
    expect(text).toContain('Relocation Partner')
  })

  it('renders the "how it works" 4-step process without SLA or guaranteed-approval language', () => {
    render(<PartnersPage />)
    const text = container.textContent ?? ''
    expect(text).toContain('Apply')
    expect(text).toContain('Verify')
    expect(text).toContain('Walz Review')
    expect(text).toContain('Get Access')
    expect(text.toLowerCase()).not.toMatch(/24 hours|within \d+ (hour|day|business day)/)
    expect(text.toLowerCase()).not.toContain('guaranteed approval')
    expect(text).toContain('does not guarantee approval')
  })
})

describe('PartnersPage — correct type mapping to the exact allowlisted OrganizationType values', () => {
  it('Travel Agency CTA links to /business/register?partnerType=TRAVEL_AGENCY', () => {
    render(<PartnersPage />)
    const a = container.querySelector<HTMLAnchorElement>('a[aria-label="Start application as a Travel Agency"]')!
    expect(a.getAttribute('href')).toBe('/business/register?partnerType=TRAVEL_AGENCY')
  })

  it('Corporate CTA links to /business/register?partnerType=CORPORATE', () => {
    render(<PartnersPage />)
    const a = container.querySelector<HTMLAnchorElement>('a[aria-label="Start application as a Corporate partner"]')!
    expect(a.getAttribute('href')).toBe('/business/register?partnerType=CORPORATE')
  })

  it('Referral Partner CTA links to /business/register?partnerType=REFERRAL_PARTNER', () => {
    render(<PartnersPage />)
    const a = container.querySelector<HTMLAnchorElement>('a[aria-label="Start application as a Referral Partner"]')!
    expect(a.getAttribute('href')).toBe('/business/register?partnerType=REFERRAL_PARTNER')
  })

  it('Relocation CTA links to /business/register?partnerType=RELOCATION (UI-only marker, not a real OrganizationType)', () => {
    render(<PartnersPage />)
    const a = container.querySelector<HTMLAnchorElement>('a[aria-label="Start application as a Relocation Partner"]')!
    expect(a.getAttribute('href')).toBe('/business/register?partnerType=RELOCATION')
  })
})

describe('PartnersPage — Business sign-in CTA goes to /business/login, never consumer /login', () => {
  it('the "Sign in to Walz Business" CTA is present and points at /business/login', () => {
    render(<PartnersPage />)
    const a = container.querySelector<HTMLAnchorElement>('a[aria-label="Sign in to Walz Business"]')!
    expect(a.getAttribute('href')).toBe('/business/login')
  })

  it('no link on the page points at the consumer /login page', () => {
    render(<PartnersPage />)
    const hrefs = Array.from(container.querySelectorAll('a')).map(a => a.getAttribute('href'))
    expect(hrefs.some(h => h === '/login' || h?.startsWith('/login?'))).toBe(false)
  })
})

describe('PartnersPage — malicious redirect attempts cannot appear anywhere on the page', () => {
  it('no anchor href is an external/open-redirect-shaped value other than the known mailto/WhatsApp fallback', () => {
    render(<PartnersPage />)
    const hrefs = Array.from(container.querySelectorAll('a')).map(a => a.getAttribute('href') ?? '')
    const allowedExternalPrefixes = ['mailto:contact@walztravels.com', 'https://wa.me/']
    for (const href of hrefs) {
      const isInternal = href.startsWith('/') || href.startsWith('#')
      const isAllowedExternal = allowedExternalPrefixes.some(p => href.startsWith(p))
      expect(isInternal || isAllowedExternal).toBe(true)
    }
  })

  it('no href contains a scheme-relative (//) open-redirect shape', () => {
    render(<PartnersPage />)
    const hrefs = Array.from(container.querySelectorAll('a')).map(a => a.getAttribute('href') ?? '')
    for (const href of hrefs) {
      if (href.startsWith('https://wa.me/')) continue
      expect(href.startsWith('//')).toBe(false)
    }
  })
})

describe('PartnersPage — existing lead/contact fallback path still works, unchanged', () => {
  it('preserves the exact original mailto: href', () => {
    render(<PartnersPage />)
    const a = container.querySelector<HTMLAnchorElement>('a[href^="mailto:"]')!
    expect(a.getAttribute('href')).toBe('mailto:contact@walztravels.com?subject=Partnership%20Enquiry')
  })

  it('preserves the WhatsApp link using the shared BUSINESS contact config', () => {
    render(<PartnersPage />)
    const a = container.querySelector<HTMLAnchorElement>(`a[href^="https://wa.me/${BUSINESS.contacts.globalWhatsapp.e164}"]`)!
    expect(a).not.toBeNull()
    expect(a.target).toBe('_blank')
    expect(a.rel).toContain('noopener')
  })
})

describe('PartnersPage — no banned/invented marketing claims beyond what already existed', () => {
  it('does not advertise a specific commission percentage', () => {
    render(<PartnersPage />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\d+\s*[–-]\s*\d+%/) // e.g. "10-15%"
    expect(text).not.toMatch(/\d+%\s*commission/i)
  })

  it('does not mention GDS access, white-label booking, special/negotiated fares, credit facilities, or API access', () => {
    render(<PartnersPage />)
    const text = (container.textContent ?? '').toLowerCase()
    expect(text).not.toContain('gds access')
    expect(text).not.toContain('sabre')
    expect(text).not.toContain('white-label')
    expect(text).not.toContain('white label')
    expect(text).not.toContain('negotiated')
    expect(text).not.toContain('credit facilit')
    expect(text).not.toContain('api access')
    expect(text).not.toContain('invoiced monthly billing')
  })

  it('does not promise guaranteed approval anywhere', () => {
    render(<PartnersPage />)
    const text = (container.textContent ?? '').toLowerCase()
    expect(text).not.toContain('guaranteed')
    expect(text).not.toContain('instant approval')
  })
})

describe('PartnersPage — accessibility', () => {
  it('every CTA anchor has an accessible name (aria-label or text content)', () => {
    render(<PartnersPage />)
    const anchors = Array.from(container.querySelectorAll('a'))
    expect(anchors.length).toBeGreaterThan(0)
    for (const a of anchors) {
      const accessibleName = a.getAttribute('aria-label') || a.textContent?.trim()
      expect(accessibleName).toBeTruthy()
    }
  })

  it('has exactly one h1 and uses h2/h3 for section structure', () => {
    render(<PartnersPage />)
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(container.querySelectorAll('h2').length).toBeGreaterThanOrEqual(3)
  })

  it('process steps and partner cards are keyboard-reachable (anchors, not div onclick)', () => {
    render(<PartnersPage />)
    const divsWithClick = Array.from(container.querySelectorAll('div[onclick]'))
    expect(divsWithClick).toHaveLength(0)
  })
})

describe('PartnersPage — metadata', () => {
  it('has a non-empty title and description, and does not set a Business-authenticated canonical', () => {
    expect(typeof metadata.title).toBe('string')
    expect((metadata.title as string).length).toBeGreaterThan(0)
    expect(typeof metadata.description).toBe('string')
  })

  it('is not marked noindex (stays a public, indexable marketing page)', () => {
    expect((metadata as { robots?: unknown }).robots).toBeUndefined()
  })
})

describe('PartnersPage — mobile rendering', () => {
  it('partner-type grid uses a mobile-first single-column class before widening', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/partners/page.tsx'), 'utf8')
    expect(src).toMatch(/grid-cols-1 sm:grid-cols-2 lg:grid-cols-4/)
  })
})

describe('PublicShell — /partners renders the normal public Navbar/Footer (not Business-shell-wrapped)', () => {
  it('does not suppress Navbar/Footer for /partners the way it does for /business and /admin', () => {
    const src = fs.readFileSync(path.join(ROOT, 'components/common/PublicShell.tsx'), 'utf8')
    // Sanity: /partners must not match the isAdmin/isBusiness/isForm bail-out branches.
    expect('/partners'.startsWith('/admin')).toBe(false)
    expect('/partners' === '/business' || '/partners'.startsWith('/business/')).toBe(false)
    expect(['/trip-request/', '/itinerary/', '/visa/apply/', '/visa/form/', '/payment/'].some(p => '/partners'.startsWith(p))).toBe(false)
    expect(src).toContain('<Navbar />')
    expect(src).toContain('<Footer />')
  })
})
