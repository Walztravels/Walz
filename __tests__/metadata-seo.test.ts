/**
 * Metadata / SEO audit tests (careers fixes + route-family metadata).
 *
 * Covers the verification checklist: job + apply titles, robots classes for
 * forms/status/interview/itinerary/admin, visa-specific titles, semantic
 * bullet lists, sitemap inclusion rules, canonical safety, template
 * de-duplication, and the careers data-fix migration.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Mocks (page modules import the real prisma client) ────────────────────────

const findFirstMock = jest.fn()
const db = { jobOpening: { findFirst: findFirstMock }, jobApplication: { findUnique: jest.fn() } }
jest.mock('@/lib/db', () => ({ __esModule: true, default: db, prisma: db }))

const SALES_JOB = {
  id: 'job1', slug: 'sales-marketing-representative-o38270',
  title: 'Sales & Marketing Representative',
  location: 'Nigeria & Ghana', type: 'Commission-based', workplaceType: 'remote',
  description: 'Sell Walz Travels services to new clients across Nigeria and Ghana.',
  publishedAt: new Date('2026-09-01'), createdAt: new Date('2026-09-01'),
  deadline: null, compensationMin: null, compensationMax: null,
  currency: 'NGN', compensationType: 'commission', positions: 5,
}

// ── 1–3. Careers titles & robots ──────────────────────────────────────────────

describe('careers metadata', () => {
  it('the job detail page titles the actual job with canonical + social', async () => {
    findFirstMock.mockResolvedValueOnce(SALES_JOB)
    const { generateMetadata } = await import('@/app/careers/[slug]/page')
    const meta = await generateMetadata({ params: { slug: SALES_JOB.slug } })
    expect(meta.title).toBe('Sales & Marketing Representative — Careers')
    expect(meta.alternates?.canonical).toBe('https://www.walztravels.com/careers/sales-marketing-representative-o38270')
    expect(String(meta.description)).toContain('Sales & Marketing Representative')
    expect(meta.openGraph?.title).toContain('Sales & Marketing Representative')
    expect((meta as { twitter?: { card?: string } }).twitter?.card).toBe('summary_large_image')
  })

  it('unknown or non-public slugs return safe, non-indexable metadata', async () => {
    findFirstMock.mockResolvedValueOnce(null)
    const { generateMetadata } = await import('@/app/careers/[slug]/page')
    const meta = await generateMetadata({ params: { slug: 'ghost-job' } })
    expect(meta.title).toBe('Careers')
    expect(meta.robots).toMatchObject({ index: false })
    // the page itself 404s non-public jobs
    expect(read('app/careers/[slug]/page.tsx')).toContain('notFound()')
  })

  it('the application form page is purpose-titled, noindex/follow, canonical → job page', async () => {
    findFirstMock.mockResolvedValueOnce({ title: SALES_JOB.title, slug: SALES_JOB.slug })
    const { generateMetadata } = await import('@/app/careers/[slug]/apply/page')
    const meta = await generateMetadata({ params: { slug: SALES_JOB.slug } })
    expect(meta.title).toBe('Apply for Sales & Marketing Representative')
    expect(meta.description).toBe('Apply online for the Sales & Marketing Representative position at Walz Travels.')
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(meta.alternates?.canonical).toBe('https://www.walztravels.com/careers/sales-marketing-representative-o38270')
  })

  it('root template appends the brand exactly once', () => {
    const root = read('app/layout.tsx')
    expect(root).toContain("template: '%s | Walz Travels'")
    // page/apply titles must NOT embed the brand themselves
    expect(read('app/careers/[slug]/page.tsx')).not.toMatch(/title = `[^`]*Walz Travels[^`]*`/)
    expect(read('app/careers/[slug]/apply/page.tsx')).not.toMatch(/`Apply for \$\{job\.title\}[^`]*Walz Travels[^`]*`/)
  })
})

// ── 4–5. Candidate-private pages ──────────────────────────────────────────────

describe('candidate-private metadata', () => {
  const STRICT = { index: false, follow: false, noarchive: true, nosnippet: true }

  it('application status pages are strictly private with no candidate data', async () => {
    const { metadata } = await import('@/app/careers/application/[reference]/status/page')
    expect(metadata.robots).toEqual(STRICT)
    expect(JSON.stringify(metadata)).not.toMatch(/reference|token|\$\{/)
  })

  it('AI interview pages use the exact generic title and strict robots', async () => {
    const { metadata } = await import('@/app/careers/interview/layout')
    expect(metadata.title).toEqual({ absolute: 'Walz Travels Interview' })
    expect(metadata.robots).toEqual(STRICT)
  })

  it('offer pages are strictly private', async () => {
    const { metadata } = await import('@/app/careers/offer/layout')
    expect(metadata.robots).toEqual(STRICT)
  })
})

// ── 6–7. Visa metadata ────────────────────────────────────────────────────────

describe('visa metadata', () => {
  it('country-specific visa pages have visa-specific titles and descriptions', () => {
    const uk = read('app/(public)/visa/uk-visa-nigeria/page.tsx')
    expect(uk).toContain("title: 'UK Visa Nigeria")
    expect(uk).toMatch(/description:\s*['"`]/)
    const ca = read('app/(public)/visa/canada-visa-nigeria/page.tsx')
    expect(ca).toContain("title: 'Canada Visa Nigeria")
    const apply = read('app/visa/apply/[country]/page.tsx')
    expect(apply).toContain('Apply for ${name} Visa')
  })

  it('visa tracker/assessment/payment pages are private and expose no applicant data', () => {
    for (const file of [
      'app/visa/track/layout.tsx',
      'app/(public)/visa/[country]/results/layout.tsx',
      'app/(public)/visa/[country]/[token]/layout.tsx',
      'app/visa/apply/[country]/payment/layout.tsx',
      'app/visa/apply/confirmation/layout.tsx',
    ]) {
      const src = read(file)
      expect(src).toContain('privateMetadata')
      expect(src).not.toMatch(/\$\{/)   // static strings only — nothing interpolated
    }
  })
})

// ── 8–9. Itinerary metadata ───────────────────────────────────────────────────

describe('itinerary metadata', () => {
  it('client itinerary pages are strictly private with generic titles', async () => {
    const { metadata } = await import('@/app/itinerary/layout')
    expect(metadata.robots).toEqual({ index: false, follow: false, noarchive: true, nosnippet: true })
    expect(metadata.title).toEqual({ absolute: 'Your Travel Itinerary | Walz Travels' })
    // the [ref] page no longer leaks the itinerary's own title/destination
    const refPage = read('app/itinerary/[ref]/page.tsx')
    expect(refPage).toContain("absolute: 'Your Travel Itinerary | Walz Travels'")
    expect(refPage).not.toMatch(/itin\?\.title/)
  })

  it('public marketing itineraries (tours/packages) stay indexable from their records', () => {
    const tours = read('app/tours/[slug]/layout.tsx')
    expect(tours).toContain('generateMetadata')
    expect(tours).not.toContain('index: false')
    const packages = read('app/packages/[slug]/page.tsx')
    expect(packages).toContain('generateMetadata')
    expect(packages).toMatch(/\$\{pkg\.name\}/)
  })

  it('no user-facing "itinary" misspelling exists', () => {
    // spot-check the itinerary family sources
    for (const file of ['app/itinerary/layout.tsx', 'app/itinerary/[ref]/page.tsx']) {
      expect(read(file).toLowerCase()).not.toContain('itinary')
    }
  })
})

// ── 10–11. Dynamic detail pages ───────────────────────────────────────────────

describe('dynamic detail metadata', () => {
  it('activity/esim/flight-route pages title their actual record', () => {
    expect(read('app/activities/[slug]/page.tsx')).toMatch(/title:\s*`\$\{a\.title\}`/)
    expect(read('app/esim/[code]/page.tsx')).toContain('${flag} ${name} eSIM Plans')
    expect(read('app/(public)/flights/[route]/page.tsx')).toContain('generateMetadata')
  })
})

// ── 12–13. Sitemap rules ──────────────────────────────────────────────────────

describe('sitemap', () => {
  const src = read('app/sitemap.ts')
  it('includes only published, in-deadline jobs', () => {
    expect(src).toContain("status: 'published'")
    expect(src).toContain('deadline: { gt: new Date() }')
    expect(src).toContain('jobPages')
    expect(src).toContain('/careers/${job.slug}')
  })
  it('never lists private URL families', () => {
    for (const bad of ['/careers/application', '/careers/interview', '/itinerary/', '/checkout', '/portal', '/admin', 'token']) {
      expect(src).not.toContain(`\${BASE}${bad}`)
    }
  })
})

// ── 14. Canonical safety ──────────────────────────────────────────────────────

describe('canonicals', () => {
  it('the base URL helper refuses localhost and preview origins', () => {
    jest.isolateModules(() => {
      process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000'
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SITE_URL } = require('@/lib/seo')
      expect(SITE_URL).toBe('https://www.walztravels.com')
    })
    jest.isolateModules(() => {
      process.env.NEXT_PUBLIC_BASE_URL = 'https://walz-git-branch-abc.vercel.app'
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SITE_URL } = require('@/lib/seo')
      expect(SITE_URL).toBe('https://www.walztravels.com')
    })
    delete process.env.NEXT_PUBLIC_BASE_URL
  })
  it('the root layout self-canonicalizes per route instead of pinning the homepage', () => {
    const root = read('app/layout.tsx')
    expect(root).toContain('metadataBase')
    expect(root).toContain("canonical: './'")
    expect(root).not.toContain("canonical: 'https://www.walztravels.com'")
  })
})

// ── 15. No double branding ────────────────────────────────────────────────────

describe('brand de-duplication', () => {
  it.each([
    'app/tours/layout.tsx',
    'app/hotels/layout.tsx',
    'app/visa/layout.tsx',
    'app/cart/layout.tsx',
    'app/(public)/flights/layout.tsx',
  ])('%s document title no longer embeds the brand', file => {
    const src = read(file)
    // first title (document title, top level) must not carry the brand;
    // openGraph/twitter titles legitimately keep it
    const docTitle = src.match(/export const metadata[^]*?title:\s*(['"`])(.*?)\1/)
    expect(docTitle).not.toBeNull()
    expect(docTitle![2]).not.toContain('Walz Travels')
  })
})

// ── 16. Admin ─────────────────────────────────────────────────────────────────

describe('admin metadata', () => {
  it('the admin layout is titled and never indexable', () => {
    const src = read('app/admin/layout.tsx')
    expect(src).toContain("title: 'Walz Admin'")
    expect(src).toContain('index: false, follow: false')
  })
})

// ── 18. Semantic job lists ────────────────────────────────────────────────────

describe('parseBulletBlocks (semantic lists)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseBulletBlocks } = require('@/lib/recruitment/format')

  it('turns bullet-per-line text into one list, preserving exact text', () => {
    const blocks = parseBulletBlocks('• Sell packages\n• Find new clients\n- Follow up leads')
    expect(blocks).toEqual([{ kind: 'ul', items: ['Sell packages', 'Find new clients', 'Follow up leads'] }])
  })
  it('splits legacy inline "•" paragraphs into items', () => {
    const blocks = parseBulletBlocks('Sell packages • Find new clients • Follow up leads')
    expect(blocks).toEqual([{ kind: 'ul', items: ['Sell packages', 'Find new clients', 'Follow up leads'] }])
  })
  it('never splits ordinary paragraphs or abbreviations', () => {
    const text = 'We are a U.K.-based travel company. Commission is paid monthly - no cap.'
    expect(parseBulletBlocks(text)).toEqual([{ kind: 'p', items: [text] }])
  })
  it('mixes paragraphs and lists in order', () => {
    const blocks = parseBulletBlocks('About the role:\n• First\n• Second\nMore detail follows.')
    expect(blocks.map((b: { kind: string }) => b.kind)).toEqual(['p', 'ul', 'p'])
  })
  it('the job page renders blocks as real <ul>/<li> elements without raw HTML', () => {
    const src = read('app/careers/[slug]/page.tsx')
    expect(src).toContain('parseBulletBlocks')
    expect(src).toContain('<ul')
    expect(src).toContain('<li')
    // JSON-LD script is the page's only sanctioned dangerouslySetInnerHTML use
    expect((src.match(/dangerouslySetInnerHTML/g) ?? []).length).toBe(1)
    expect(src).toMatch(/application\/ld\+json/)
  })
})

// ── 19–20 + Task 1. Careers data fix ─────────────────────────────────────────

describe('careers data fix', () => {
  const sql = read('prisma/migrations/recruitment_fix_sales_marketing_job.sql')
  it('corrects the stored location so admin and public views agree', () => {
    expect(sql).toContain(`"location" = 'Nigeria & Ghana'`)
    expect(sql).toContain('sales-marketing-representative-o38270')
    // the page renders "{location} · {workplace}" from the stored record
    expect(read('app/careers/[slug]/page.tsx')).toContain('{job.location} · {WORKPLACE_LABEL[job.workplaceType]')
  })
  it('replaces the how-to-apply copy and never shows a raw /careers URL', () => {
    expect(sql).toContain('Click Apply Now below to complete the online application and upload your current CV.')
    expect(sql).toContain('Only shortlisted candidates will be contacted.')
  })
  it('seeds the eight role-specific screening questions idempotently', () => {
    for (const key of ['sales_experience', 'client_sourcing', 'objection', 'follow_up',
                       'whatsapp_social', 'commission', 'availability', 'location']) {
      expect(sql).toContain(`'${key}'`)
    }
    expect(sql).toContain('NOT EXISTS')
    expect(sql).toContain('commission-based')
  })
  it('the work-authorization placeholder is location-neutral', () => {
    const form = read('components/careers/ApplyForm.tsx')
    expect(form).toContain("authorized to work in the role's location")
    expect(form).not.toContain('UK citizen')
  })
})

// ── Robots.txt families ───────────────────────────────────────────────────────

describe('robots.txt', () => {
  const src = read('app/robots.ts')
  it('blocks every private route family (as a hint — auth remains the control)', () => {
    for (const path of ['/admin/', '/portal/', '/dashboard/', '/careers/application/',
                        '/careers/interview/', '/careers/offer/', '/itinerary/', '/checkout/',
                        '/cart', '/payment/', '/quote/', '/upload/', '/visa/track/']) {
      expect(src).toContain(`'${path}'`)
    }
    expect(src).toContain('never the privacy control')
  })
})

// ── Service landing pages ─────────────────────────────────────────────────────

describe('service landing metadata', () => {
  // [file, required document title] — brand appended once by the root template
  const SERVICES: Array<[string, string]> = [
    ['app/visa/layout.tsx',              'Visa Assistance Services'],
    ['app/(public)/flights/page.tsx',    'Flight Booking Services'],
    ['app/hotels/layout.tsx',            'Hotel Booking Services'],
    ['app/tours/layout.tsx',             'Tours & Travel Experiences'],
    ['app/activities/page.tsx',          'Tours, Activities & Attractions'],
    ['app/transfers/layout.tsx',         'Airport Transfer Services'],
    ['app/insurance/layout.tsx',         'Travel Insurance'],
    ['app/esim/page.tsx',                'International Travel eSIM'],
    ['app/concierge/page.tsx',           'Luxury Travel Concierge'],
    ['app/gift/layout.tsx',              'Travel Gift Vouchers'],
    ['app/currency/layout.tsx',          'Travel Currency & Exchange Rates'],
  ]

  it.each(SERVICES)('%s uses its required service title without embedded brand', (file, title) => {
    const src = read(file)
    expect(src).toContain(`'${title}'`)
    const docTitle = src.match(/export const metadata[^]*?title:\s*(['"`])(.*?)\1/)
    expect(docTitle![2]).toBe(title)
  })

  it.each(SERVICES)('%s has its own description and canonical', file => {
    const src = read(file)
    expect(src).toMatch(/description:/)
    expect(src).toMatch(/canonical:/)
    expect(src).not.toContain('localhost')
  })

  it('service descriptions are unique across pages', () => {
    const descs = SERVICES.map(([file]) => {
      const m = read(file).match(/description:\s*\n?\s*(['"`])(.*?)\1/)
      return m?.[2] ?? file
    })
    expect(new Set(descs).size).toBe(descs.length)
  })
})

// ── JSON-LD honesty ───────────────────────────────────────────────────────────

describe('JobPosting JSON-LD', () => {
  const src = read('app/careers/[slug]/page.tsx')
  it('uses schema.org employment types and never invents salary', () => {
    expect(src).toContain("'Commission-based': 'OTHER'")
    expect(src).toContain('hasRealComp')
    expect(src).toMatch(/hasRealComp\s*\?\s*\{/)
    expect(src).toContain('applicantLocationRequirements')
    expect(src).toContain('directApply: true')
  })
})
