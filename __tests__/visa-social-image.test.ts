/**
 * Approved visa social graphic: every public visa route must share one
 * og:image / twitter:image (native 1168x784, no crop), with destination titles kept.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'
import {
  VISA_SOCIAL_IMAGE, VISA_SOCIAL_IMAGE_WIDTH, VISA_SOCIAL_IMAGE_HEIGHT, VISA_SOCIAL_IMAGE_ALT, visaSocialMetadata,
} from '@/lib/seo/visa-social'

const ROOT = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const portalMock = jest.fn()
const db = { countryPortal: { findUnique: portalMock } }
jest.mock('@/lib/db', () => ({ __esModule: true, default: db, prisma: db }))
jest.mock('@/app/visa/apply/[country]/VisaApplyClient', () => ({ __esModule: true, default: () => null }))

jest.mock('react', () => ({ ...jest.requireActual('react'), cache: (fn: any) => fn }))

const ASSET = 'public/images/social/walz-visa-assistance-og.jpg'

describe('(a) the artwork', () => {
  const buf = fs.readFileSync(path.join(ROOT, ASSET))
  it('is the exact supplied JPEG', () => {
    expect(buf.subarray(0, 3).toString('hex')).toBe('ffd8ff')
    expect(buf.length).toBe(198320)
    expect(buf.length).toBeLessThan(300 * 1024)
    expect(crypto.createHash('sha256').update(buf).digest('hex').startsWith('5bd421f2a49bc085')).toBe(true)
  })
  it('is 1168x784 (SOF parse) and the constants declare exactly that', () => {
    let i = 2, w = 0, h = 0
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue }
      const m = buf[i + 1]
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break }
      i += 2 + buf.readUInt16BE(i + 2)
    }
    expect([w, h]).toEqual([1168, 784])
    expect([VISA_SOCIAL_IMAGE_WIDTH, VISA_SOCIAL_IMAGE_HEIGHT]).toEqual([1168, 784])
  })
})

describe('(b) public URL', () => {
  it('is absolute https on www.walztravels.com and maps to the file under public/', () => {
    const u = new URL(VISA_SOCIAL_IMAGE)
    expect(u.protocol).toBe('https:')
    expect(u.host).toBe('www.walztravels.com')
    expect(fs.existsSync(path.join(ROOT, 'public', u.pathname))).toBe(true)
    expect(path.join('public', u.pathname)).toBe(ASSET)
  })
  it('helper output shape', () => {
    const m = visaSocialMetadata({ title: 'T', description: 'D', url: 'https://www.walztravels.com/x' })
    expect(m.openGraph).toMatchObject({ type: 'website', title: 'T', description: 'D', url: 'https://www.walztravels.com/x', siteName: 'Walz Travels' })
    expect(m.openGraph.images).toEqual([{ url: VISA_SOCIAL_IMAGE, width: 1168, height: 784, alt: VISA_SOCIAL_IMAGE_ALT }])
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', images: [VISA_SOCIAL_IMAGE] })
    expect('url' in visaSocialMetadata({ title: 'T', description: 'D' }).openGraph).toBe(false)
  })
})

function expectVisaSocial(meta: any) {
  const img = meta.openGraph?.images
  expect(img).toHaveLength(1)
  expect(img[0]).toMatchObject({ url: VISA_SOCIAL_IMAGE, width: 1168, height: 784 })
  expect(meta.twitter?.card).toBe('summary_large_image')
  expect(meta.twitter?.images).toEqual([VISA_SOCIAL_IMAGE])
}

describe('(c) every visa route resolves the same image', () => {
  const SLUGS = ['canada', 'uk', 'usa', 'schengen', 'south-africa', 'dubai', 'uae', 'zz-unknown-slug']

  it('static layouts and pages', async () => {
    const mods = [
      'app/visa/layout', 'app/visa/apply/layout', 'app/visa/track/layout',
      'app/(public)/group-visa/layout', 'app/visa/apply/success/layout', 'app/visa/apply/confirmation/layout',
      'app/visa/apply/cancelled/layout', 'app/visa/apply/[country]/payment/layout',
      'app/(public)/visa/[country]/results/layout', 'app/(public)/visa/[country]/[token]/layout',
      'app/(public)/visa/canada-visa-nigeria/page', 'app/(public)/visa/canada-visa-ghana/page',
      'app/(public)/visa/uk-visa-nigeria/page', 'app/(public)/visa/uk-visa-ghana/page',
      'app/(public)/visa/schengen-visa-nigeria/page', 'app/(public)/visa/canada-relocation-guide-nigeria/page',
    ]
    for (const m of mods) {
      const { metadata } = await import(`@/${m}`)
      expectVisaSocial(metadata)
    }
  })

  it('private/token routes keep noindex and hold no applicant data', async () => {
    for (const m of ['app/visa/track/layout', 'app/visa/apply/success/layout', 'app/visa/apply/confirmation/layout',
      'app/visa/apply/cancelled/layout', 'app/visa/apply/[country]/payment/layout', 'app/(public)/group-visa/layout',
      'app/(public)/visa/[country]/results/layout', 'app/(public)/visa/[country]/[token]/layout']) {
      const { metadata } = await import(`@/${m}`)
      expect(metadata.robots).toMatchObject({ index: false, follow: false, noarchive: true, nosnippet: true })
    }
  })

  it('apply/[country] page + layout: destination titles kept, same image for all slugs', async () => {
    const page = await import('@/app/visa/apply/[country]/page')
    const layout = await import('@/app/visa/apply/[country]/layout')
    const urls = new Set<string>()
    for (const s of SLUGS) {
      for (const gm of [page.generateMetadata, layout.generateMetadata]) {
        const meta: any = await gm({ params: { country: s } } as any)
        expectVisaSocial(meta)
        urls.add(meta.openGraph.images[0].url)
        expect(String(meta.title)).toMatch(/^Apply for .+ Visa$/)
      }
    }
    expect(urls.size).toBe(1)
    const canada: any = await page.generateMetadata({ params: { country: 'canada' } })
    expect(canada.title).toBe('Apply for Canada Visa')
    expect(canada.openGraph.title).toBe('Apply for Canada Visa — Walz Travels')
  })

  it('visa/[country] page: portal and unknown destinations share the image', async () => {
    const { generateMetadata } = await import('@/app/visa/[country]/page')
    const urls = new Set<string>()
    for (const s of SLUGS) {
      portalMock.mockResolvedValueOnce(s.startsWith('zz') ? null : { countryName: s.toUpperCase() })
      const meta: any = await generateMetadata({ params: { country: s } })
      expectVisaSocial(meta)
      urls.add(meta.openGraph.images[0].url)
      expect(meta.title).toBe(s.startsWith('zz') ? 'Visa Requirements' : `${s.toUpperCase()} Visa Requirements`)
    }
    expect(urls.size).toBe(1)
  })
})

describe('(d) source regression guard', () => {
  const dirs = ['app/visa', 'app/visa-hub', 'app/(public)/visa', 'app/(public)/group-visa']
  const files: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (/\.(tsx?|ts)$/.test(e.name)) files.push(p)
    }
  }
  dirs.forEach(walk)

  it('no stock-photo URL inside any metadata/openGraph/twitter block', () => {
    for (const f of files) {
      const src = read(f)
      const blocks = src.match(/(export const metadata|generateMetadata)[\s\S]*?\n\}\n/g) || []
      for (const b of blocks) expect(b).not.toMatch(/unsplash|pexels|pixabay|photo-\d/i)
    }
  })
  it('the artwork path is only referenced from the centralized module', () => {
    for (const f of files) expect(read(f)).not.toContain('walz-visa-assistance-og')
    const all = execSync(`grep -rl "walz-visa-assistance-og" app lib components --include=*.ts --include=*.tsx || true`, { cwd: ROOT }).toString().trim()
    expect(all).toBe('lib/seo/visa-social.ts')
  })
})

describe('(e) out-of-scope metadata untouched', () => {
  it('root layout keeps its generic brand openGraph (title + sintra image)', () => {
    const src = read('app/layout.tsx')
    expect(src).toContain("title: 'Walz Travels | Flights, Visas & Tours'")
    expect(src).toContain('walz-travels-og-share-image.png')
    expect(src).not.toContain('visa-social')
  })
  it('git is available and root/itinerary/flight/hotel/tour metadata is unchanged vs base', () => {
    const out = execSync(
      'git diff ee02398a --name-only -- app/layout.tsx lib/itinerary app/itinerary app/og app/flights app/hotels app/tours app/page.tsx',
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    ).toString().trim()
    expect(out).toBe('')
  })
})

// ── Scanner: visa route files may only get social metadata via the central helper ──
const HELPER_RE = /\b(visaSocialMetadata|privateMetadataWithVisaSocial)\b/
const FORBIDDEN: Array<[string, RegExp]> = [
  ['raw openGraph literal', /\bopenGraph\s*:/],
  ['raw twitter literal', /\btwitter\s*:/],
  ['socialPreview', /\bsocialPreview\b/],
  ['DEFAULT_OG_IMAGE', /\bDEFAULT_OG_IMAGE\b/],
  ['sintra generic image', /sintra/i],
  ['walz-travels-og-share-image', /walz-travels-og-share-image/],
  ['images field', /\bimages\s*:/],
  ['stock photo', /unsplash|pexels|pixabay|photo-\d/i],
  ['visa artwork path', /walz-visa-assistance-og/],
]
export function scanVisaSource(src: string): string[] {
  return FORBIDDEN.filter(([, re]) => re.test(src)).map(([n]) => n)
}

describe('(f) every visa page/layout gets social metadata only via the helper', () => {
  const roots = ['app/visa', 'app/visa-hub', 'app/(public)/visa', 'app/(public)/group-visa']
  const files: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (/^(page|layout)\.tsx?$/.test(e.name)) files.push(p)
    }
  }
  roots.forEach(walk)

  it('finds the visa tree', () => { expect(files.length).toBeGreaterThan(15) })

  it('no page/layout has raw openGraph/twitter, generic-OG helpers or image fields', () => {
    const bad: Record<string, string[]> = {}
    for (const f of files) {
      const src = read(f)
      const hasMeta = /export\s+(const\s+metadata|async\s+function\s+generateMetadata|function\s+generateMetadata)/.test(src)
      // on-page hero imagery (no metadata export) is out of scope for the stock-photo rule
      const v = scanVisaSource(src).filter(n => hasMeta || n !== 'stock photo')
      if (v.length) bad[f] = v
    }
    expect(bad).toEqual({})
  })

  it('every metadata-exporting file uses the helper or has a helper-using ancestor layout', () => {
    const treeRoots = roots
    const missing: string[] = []
    for (const f of files) {
      const src = read(f)
      if (!/export\s+(const\s+metadata|async\s+function\s+generateMetadata|function\s+generateMetadata)/.test(src)) continue
      if (HELPER_RE.test(src)) continue
      let dir = path.posix.dirname(f)
      let ok = false
      while (true) {
        const isRoot = treeRoots.includes(dir)
        for (const ext of ['tsx', 'ts']) {
          const lp = `${dir}/layout.${ext}`
          if (lp !== f && fs.existsSync(path.join(ROOT, lp)) && HELPER_RE.test(read(lp))) ok = true
        }
        if (ok || isRoot || dir === 'app') break
        dir = path.posix.dirname(dir)
      }
      if (!ok) missing.push(f)
    }
    expect(missing).toEqual([])
  })

  it('scanner self-test: flags violations, passes compliant source', () => {
    expect(scanVisaSource("export const metadata = { openGraph: { title: 'x' } }")).toContain('raw openGraph literal')
    expect(scanVisaSource("export const metadata = { twitter: { card: 'summary' } }")).toContain('raw twitter literal')
    expect(scanVisaSource("import { DEFAULT_OG_IMAGE } from '@/lib/seo'")).toContain('DEFAULT_OG_IMAGE')
    expect(scanVisaSource('...socialPreview(t, d, u)')).toContain('socialPreview')
    expect(scanVisaSource("images: [{ url: 'https://images.unsplash.com/photo-1?w=1' }]")).toEqual(expect.arrayContaining(['images field', 'stock photo']))
    expect(scanVisaSource("const u='https://us.chat-img.sintra.ai/x/walz-travels-og-share-image.png'")).toEqual(expect.arrayContaining(['sintra generic image', 'walz-travels-og-share-image']))
    expect(scanVisaSource("import { visaSocialMetadata } from '@/lib/seo/visa-social'\nexport const metadata = { title: 'T', ...visaSocialMetadata({ title: 'T', description: 'D' }) }")).toEqual([])
  })
})
