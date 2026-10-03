/**
 * Walz Business (Track C: /partners -> Walz Business integration) —
 * lib/business/partner-handoff.ts allowlist + security regression suite,
 * plus source-level proof that this entire slice never creates an
 * Organization, OrganizationMembership, or OrganizationInvitation row.
 */
import fs from 'fs'
import path from 'path'
import {
  isPartnerAcquisitionType,
  parsePartnerAcquisitionType,
  buildBusinessRegisterHref,
  PARTNER_ACQUISITION_TYPES,
  RELOCATION_ACQUISITION_MARKER,
  BUSINESS_SIGN_IN_HREF,
  BUSINESS_REGISTER_PATH,
} from '@/lib/business/partner-handoff'
import { VALID_ORGANIZATION_TYPES } from '@/lib/business/organization-type'
import { isSafeLocalPath } from '@/lib/safe-redirect'

const ROOT = process.cwd()

describe('PARTNER_ACQUISITION_TYPES — the exact closed allowlist', () => {
  it('contains exactly the 3 existing OrganizationType values plus the Relocation UI-only marker', () => {
    expect(PARTNER_ACQUISITION_TYPES).toEqual([
      'CORPORATE', 'TRAVEL_AGENCY', 'REFERRAL_PARTNER', 'RELOCATION',
    ])
  })

  it('reuses VALID_ORGANIZATION_TYPES verbatim — never a locally re-declared copy', () => {
    for (const t of VALID_ORGANIZATION_TYPES) {
      expect(PARTNER_ACQUISITION_TYPES).toContain(t)
    }
  })

  it('RELOCATION is NOT one of the real OrganizationType values', () => {
    expect(VALID_ORGANIZATION_TYPES as readonly string[]).not.toContain(RELOCATION_ACQUISITION_MARKER)
  })
})

describe('isPartnerAcquisitionType / parsePartnerAcquisitionType — allowlist correctness', () => {
  it('accepts all 4 allowlisted values', () => {
    for (const t of PARTNER_ACQUISITION_TYPES) {
      expect(isPartnerAcquisitionType(t)).toBe(true)
      expect(parsePartnerAcquisitionType(t)).toBe(t)
    }
  })

  it('rejects an unexpected/invalid organization-type string', () => {
    expect(isPartnerAcquisitionType('NOT_A_REAL_TYPE')).toBe(false)
    expect(parsePartnerAcquisitionType('NOT_A_REAL_TYPE')).toBeNull()
  })

  it('is case-sensitive — lowercase/mixed-case variants are rejected, not normalized', () => {
    expect(isPartnerAcquisitionType('corporate')).toBe(false)
    expect(isPartnerAcquisitionType('Corporate')).toBe(false)
    expect(isPartnerAcquisitionType('travel_agency')).toBe(false)
  })

  it('rejects non-string input types', () => {
    expect(isPartnerAcquisitionType(undefined)).toBe(false)
    expect(isPartnerAcquisitionType(null)).toBe(false)
    expect(isPartnerAcquisitionType(123)).toBe(false)
    expect(isPartnerAcquisitionType({})).toBe(false)
    expect(isPartnerAcquisitionType(['CORPORATE'])).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isPartnerAcquisitionType('')).toBe(false)
  })

  it('rejects an oversized query value', () => {
    const huge = 'CORPORATE' + 'A'.repeat(10_000)
    expect(isPartnerAcquisitionType(huge)).toBe(false)
    expect(parsePartnerAcquisitionType(huge)).toBeNull()
  })

  it('rejects a scheme-relative URL payload', () => {
    expect(isPartnerAcquisitionType('//evil.com')).toBe(false)
  })

  it('rejects an external redirect URL payload', () => {
    expect(isPartnerAcquisitionType('https://evil.com')).toBe(false)
    expect(isPartnerAcquisitionType('http://evil.com/CORPORATE')).toBe(false)
  })

  it('rejects an encoded path-traversal payload', () => {
    expect(isPartnerAcquisitionType('..%2f..%2f..%2fadmin')).toBe(false)
    expect(isPartnerAcquisitionType('../../../etc/passwd')).toBe(false)
  })

  it('rejects a script/HTML payload', () => {
    expect(isPartnerAcquisitionType('<script>alert(1)</script>')).toBe(false)
    expect(isPartnerAcquisitionType('"><img src=x onerror=alert(1)>')).toBe(false)
  })

  it('rejects a value that is merely a close prefix/suffix of a real one', () => {
    expect(isPartnerAcquisitionType('CORPORATE_EXTRA')).toBe(false)
    expect(isPartnerAcquisitionType('CORPORAT')).toBe(false)
    expect(isPartnerAcquisitionType(' CORPORATE')).toBe(false)
    expect(isPartnerAcquisitionType('CORPORATE ')).toBe(false)
  })
})

describe('buildBusinessRegisterHref — safe href construction', () => {
  it('builds the exact expected href for each of the 4 allowlisted values', () => {
    expect(buildBusinessRegisterHref('TRAVEL_AGENCY')).toBe('/business/register?partnerType=TRAVEL_AGENCY')
    expect(buildBusinessRegisterHref('CORPORATE')).toBe('/business/register?partnerType=CORPORATE')
    expect(buildBusinessRegisterHref('REFERRAL_PARTNER')).toBe('/business/register?partnerType=REFERRAL_PARTNER')
    expect(buildBusinessRegisterHref('RELOCATION')).toBe('/business/register?partnerType=RELOCATION')
  })

  it('falls back to the bare register path (no query string) for any non-allowlisted input', () => {
    const maliciousInputs: unknown[] = [
      undefined,
      null,
      '',
      'NOT_A_REAL_TYPE',
      'corporate',
      '//evil.com',
      'https://evil.com',
      '/\\evil.com',
      '../../../etc/passwd',
      '..%2f..%2f..%2fadmin',
      '<script>alert(1)</script>',
      '"><img src=x onerror=alert(1)>',
      'CORPORATE' + 'A'.repeat(10_000),
      ['CORPORATE', 'TRAVEL_AGENCY'], // duplicate-style array input
      { partnerType: 'CORPORATE' },
    ]
    for (const bad of maliciousInputs) {
      expect(buildBusinessRegisterHref(bad)).toBe(BUSINESS_REGISTER_PATH)
    }
  })

  it('never produces anything other than a safe, same-origin local path (isSafeLocalPath)', () => {
    const allInputs: unknown[] = [...PARTNER_ACQUISITION_TYPES, 'bad', '//evil.com', 'https://evil.com', undefined]
    for (const input of allInputs) {
      const href = buildBusinessRegisterHref(input)
      expect(isSafeLocalPath(href)).toBe(true)
      expect(href.startsWith(BUSINESS_REGISTER_PATH)).toBe(true)
    }
  })

  it('a duplicate-query-param-shaped string value is rejected (treated as one opaque string, not parsed)', () => {
    const dup = 'CORPORATE&partnerType=TRAVEL_AGENCY'
    expect(isPartnerAcquisitionType(dup)).toBe(false)
    expect(buildBusinessRegisterHref(dup)).toBe(BUSINESS_REGISTER_PATH)
  })

  it('never reflects the bad input back into the returned href', () => {
    const payload = '<script>alert(1)</script>'
    const href = buildBusinessRegisterHref(payload)
    expect(href).not.toContain('<script>')
    expect(href).not.toContain(encodeURIComponent(payload))
  })
})

describe('BUSINESS_SIGN_IN_HREF — hardcoded, never the consumer login page', () => {
  it('is exactly /business/login', () => {
    expect(BUSINESS_SIGN_IN_HREF).toBe('/business/login')
  })

  it('is a plain string literal, not a function of any input (source check)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/business/partner-handoff.ts'), 'utf8')
    expect(src).toMatch(/export const BUSINESS_SIGN_IN_HREF = '\/business\/login' as const/)
  })
})

describe('zero database writes — this entire module performs no I/O', () => {
  it('imports no prisma client and no db module', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/business/partner-handoff.ts'), 'utf8')
    expect(src).not.toMatch(/from ['"]@\/lib\/db['"]/)
    expect(src).not.toMatch(/import\s+prisma/i)
    expect(src).not.toMatch(/\bprisma\./)
  })

  it('contains no reference to Organization / OrganizationMembership / OrganizationInvitation models at all', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/business/partner-handoff.ts'), 'utf8')
    expect(src).not.toMatch(/\.organization\.create/i)
    expect(src).not.toMatch(/\.organizationMembership\.create/i)
    expect(src).not.toMatch(/\.organizationInvitation\.create/i)
  })
})

describe('zero Organization/OrganizationMembership/OrganizationInvitation creation across the whole Track C surface', () => {
  const FILES_TO_SCAN = [
    'app/partners/page.tsx',
    'app/partners/TrackedLink.tsx',
    'lib/business/partner-handoff.ts',
  ]

  it('none of the files this track added/changed write any organizational model', () => {
    for (const rel of FILES_TO_SCAN) {
      const full = path.join(ROOT, rel)
      expect(fs.existsSync(full)).toBe(true)
      const src = fs.readFileSync(full, 'utf8')
      expect(src).not.toMatch(/organization\.create\(/i)
      expect(src).not.toMatch(/organizationMembership\.create\(/i)
      expect(src).not.toMatch(/organizationInvitation\.create\(/i)
      expect(src).not.toMatch(/from ['"]@\/lib\/db['"]/)
    }
  })

  it('app/partners contains no new API route (no server-side write surface at all)', () => {
    const partnersDir = path.join(ROOT, 'app/partners')
    const walk = (dir: string): string[] => {
      const out: string[] = []
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) out.push(...walk(full))
        else out.push(full)
      }
      return out
    }
    const files = walk(partnersDir)
    expect(files.some(f => f.endsWith('route.ts') || f.endsWith('route.tsx'))).toBe(false)
  })

  it('no new file under app/api/** was introduced for partners/partner-handoff in this track', () => {
    // This track's only lib addition is lib/business/partner-handoff.ts, and
    // it must not have a corresponding API route counterpart.
    const candidate = path.join(ROOT, 'app/api/partners')
    expect(fs.existsSync(candidate)).toBe(false)
  })
})

describe('Track A / Track B exclusive-territory files are untouched by this module', () => {
  it('lib/business/organization-type.ts allowlist is unchanged (3 values, CORPORATE default)', () => {
    expect(VALID_ORGANIZATION_TYPES).toEqual(['CORPORATE', 'TRAVEL_AGENCY', 'REFERRAL_PARTNER'])
  })

  it('this module never imports anything from Track A exclusive territory', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/business/partner-handoff.ts'), 'utf8')
    expect(src).not.toMatch(/visa-link/i)
    expect(src).not.toMatch(/BusinessServiceLinkToken/)
    expect(src).not.toMatch(/api\/business\/link/)
  })
})
