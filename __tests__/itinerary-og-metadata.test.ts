import fs from 'fs'
import path from 'path'

const mockFind = jest.fn()
jest.mock('@/lib/db', () => ({ prisma: { itinerary: { findUnique: (...a: unknown[]) => mockFind(...a) } } }))

import { buildItineraryMetadata, formatDateRange, normalizeOgImageUrl, isOptimizableImageHost, OPTIMIZABLE_IMAGE_PATTERNS, GENERIC_ITINERARY_METADATA } from '@/lib/itinerary/og-metadata'
import { resolveItineraryMetadata } from '@/lib/itinerary/og-loader'
import robots from '@/app/robots'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const D = (s: string) => new Date(s + 'T00:00:00.000Z')
const base = { referenceNumber: 'WALZ-JVUSUS', destination: 'Doha, Qatar', clientName: 'Ada Obi', startDate: D('2026-12-01'), endDate: D('2026-12-07'), coverImage: null }
const title = (m: any) => m.title.absolute as string

describe('buildItineraryMetadata', () => {
  it('title', () => {
    const m = buildItineraryMetadata(base)
    expect(title(m)).toBe('Walz Travels Itinerary | Doha, Qatar')
    expect(title(m)).toContain('Itinerary')
    expect(title(buildItineraryMetadata({ ...base, destination: '  ' }))).toBe('Your Walz Travels Itinerary')
    expect(title(buildItineraryMetadata({ ...base, destination: 'X'.repeat(300) })).length).toBeLessThanOrEqual(70)
  })
  it('description variants', () => {
    expect(buildItineraryMetadata(base).description).toBe('Ada Obi · 1–7 December 2026. Your personalised travel itinerary by Walz Travels.')
    expect(formatDateRange(D('2026-11-28'), D('2026-12-04'))).toBe('28 November – 4 December 2026')
    expect(formatDateRange(D('2026-12-28'), D('2027-01-03'))).toBe('28 December 2026 – 3 January 2027')
    expect(formatDateRange(D('2026-12-01'), D('2026-12-01'))).toBe('1 December 2026')
    expect(formatDateRange(null, null)).toBe('')
    expect(buildItineraryMetadata({ ...base, startDate: null, endDate: null }).description).toBe('Ada Obi. Your personalised travel itinerary by Walz Travels.')
    expect(buildItineraryMetadata({ ...base, clientName: '' }).description).toBe('1–7 December 2026. Your personalised travel itinerary by Walz Travels.')
    expect(buildItineraryMetadata({ ...base, clientName: '', startDate: null, endDate: null }).description).toBe('Your personalised travel itinerary by Walz Travels.')
    expect((buildItineraryMetadata({ ...base, clientName: 'N'.repeat(500) }).description as string).length).toBeLessThanOrEqual(200)
  })
  it('UTC formatting avoids off-by-one', () => {
    expect(formatDateRange(new Date('2026-12-01T23:30:00.000Z'), new Date('2026-12-07T23:30:00.000Z'))).toBe('1–7 December 2026')
  })
  it('supabase cover is wrapped in the optimizer, identically for og and twitter', () => {
    const url = 'https://bxacijnrgqgmyqyfgumg.supabase.co/storage/v1/object/public/itinerary-images/a/cover.jpg'
    const m: any = buildItineraryMetadata({ ...base, coverImage: url })
    const expected = `https://www.walztravels.com/_next/image?url=${encodeURIComponent(url)}&w=1200&q=75`
    expect(m.openGraph.images[0].url).toBe(expected)
    expect(m.twitter.images[0]).toBe(expected)
    expect(m.openGraph.images[0].width).toBeUndefined()
    expect(m.openGraph.images[0].height).toBeUndefined()
  })
  it('off-allowlist host is used as-is; existing optimizer URLs and non-https never wrapped', () => {
    expect(normalizeOgImageUrl('https://other-cdn.example.com/a.jpg')).toEqual({ url: 'https://other-cdn.example.com/a.jpg' })
    const opt = 'https://www.walztravels.com/_next/image?url=x&w=1200&q=75'
    expect(normalizeOgImageUrl(opt)?.url).toBe(opt)
    expect(normalizeOgImageUrl('https://bxacijnrgqgmyqyfgumg.supabase.co/other/a.jpg')?.url).toBe('https://bxacijnrgqgmyqyfgumg.supabase.co/other/a.jpg')
    expect(isOptimizableImageHost('http://pics.avs.io/a.jpg')).toBe(false)
    expect(isOptimizableImageHost('https://x.hotelbeds.com/a.jpg')).toBe(true)
    expect(isOptimizableImageHost('https://hotelbeds.com/a.jpg')).toBe(false)
  })
  it('only the www optimizer URL is trusted; other hosts /_next/image are treated normally', () => {
    const evil = 'https://evil.com/_next/image?url=x&w=1200&q=75'
    expect(normalizeOgImageUrl(evil)?.url).toBe(evil)  // off-allowlist: as-is, not "trusted optimizer"
    const cdn = 'https://cdn.walztravels.com/_next/image?url=x'
    expect(normalizeOgImageUrl(cdn)?.url).toContain('https://www.walztravels.com/_next/image?url=' + encodeURIComponent(cdn))  // allowlisted host: wrapped
    const ours = 'https://www.walztravels.com/_next/image?url=x&w=1200&q=75'
    expect(normalizeOgImageUrl(ours)?.url).toBe(ours)
  })
  it('helper mirrors every next.config.mjs remotePattern', () => {
    const cfg = read('next.config.mjs')
    const hosts = [...cfg.matchAll(/hostname:\s*'([^']+)'/g)].map(m => m[1])
    expect(hosts.length).toBeGreaterThan(10)
    const known = OPTIMIZABLE_IMAGE_PATTERNS.map(p => p.hostname)
    for (const h of hosts) expect(known).toContain(h)
    for (const k of known) expect(hosts).toContain(k)
  })
  it('unsplash gets 1200x630 params', () => {
    const m: any = buildItineraryMetadata({ ...base, coverImage: 'https://images.unsplash.com/photo-1?w=1600&q=90&fit=crop' })
    const u = new URL(m.openGraph.images[0].url)
    expect(u.searchParams.get('w')).toBe('1200'); expect(u.searchParams.get('h')).toBe('630')
    expect(u.searchParams.get('fit')).toBe('crop'); expect(u.searchParams.get('q')).toBe('75')
    expect(m.openGraph.images[0].width).toBe(1200); expect(m.openGraph.images[0].height).toBe(630)
  })
  it('relative cover becomes absolute; http upgraded only for known hosts', () => {
    expect(normalizeOgImageUrl('/uploads/a.jpg')?.url).toBe(`https://www.walztravels.com/_next/image?url=${encodeURIComponent('https://www.walztravels.com/uploads/a.jpg')}&w=1200&q=75`)
    expect(normalizeOgImageUrl('http://images.unsplash.com/p?x=1')?.url.startsWith('https://')).toBe(true)
    expect(normalizeOgImageUrl('http://evil.example.com/a.jpg')).toBeNull()
  })
  it.each([
    'data:image/png;base64,AAAA', 'javascript:alert(1)', 'blob:https://x/y', 'file:///etc/passwd',
    'https://localhost/a.jpg', 'https://127.0.0.1/a.jpg', 'https://192.168.1.5/a.jpg', 'https://10.0.0.1/a.jpg',
    '', '   ', 'https://ex.com/' + 'a'.repeat(2100), 'not a url', '//cdn.x.com/a.jpg',
  ])('rejects unusable cover %s', (bad) => {
    expect(normalizeOgImageUrl(bad)).toBeNull()
    const m: any = buildItineraryMetadata({ ...base, coverImage: bad })
    expect(m.openGraph.images[0].url).toBe('https://www.walztravels.com/og/itinerary/WALZ-JVUSUS')
  })
  it('non-string cover rejected', () => { expect(normalizeOgImageUrl(42)).toBeNull(); expect(normalizeOgImageUrl(null)).toBeNull() })
  it('missing cover -> fallback route, absolute https www', () => {
    const m: any = buildItineraryMetadata(base)
    expect(m.openGraph.images[0].url).toBe('https://www.walztravels.com/og/itinerary/WALZ-JVUSUS')
    expect(m.twitter.images[0]).toBe(m.openGraph.images[0].url)
    expect(m.openGraph.images[0].url).toMatch(/^https:\/\/www\.walztravels\.com\/og\/itinerary\//)
    expect(m.openGraph.images[0].alt).toBe('Walz Travels itinerary — Doha, Qatar')
  })
  it('canonical == og:url with stored reference; twitter card; robots unchanged', () => {
    const m: any = buildItineraryMetadata(base)
    expect(m.alternates.canonical).toBe('https://www.walztravels.com/itinerary/WALZ-JVUSUS')
    expect(m.openGraph.url).toBe(m.alternates.canonical)
    expect(m.openGraph.siteName).toBe('Walz Travels'); expect(m.openGraph.locale).toBe('en_GB'); expect(m.openGraph.type).toBe('website')
    expect(m.twitter.card).toBe('summary_large_image')
    expect(m.robots).toEqual({ index: false, follow: false, noarchive: true, nosnippet: true })
  })
  it('sanitises control chars, newlines and markup', () => {
    const m: any = buildItineraryMetadata({ ...base, clientName: 'Ada\n<script>alert(1)</script>\u0007 Obi', destination: 'Do\r\nha\t<b>Qatar</b>' })
    const s = JSON.stringify(m)
    expect(s).not.toMatch(/[<>]/); expect(s).not.toContain('\\n'); expect(s).not.toContain('\\u0007')
    expect(title(m)).toBe('Walz Travels Itinerary | Do ha Qatar')
  })
})

describe('resolveItineraryMetadata (mocked DB)', () => {
  const POISON = ['INTERNAL-TITLE-XYZ', 'SECRET-NOTES', 'SUPPLIER-COST-999', 'itin_internal_id_123', 'supplier-id-77', 'MARGIN-55', 'PRICEBREAKDOWN-X', 'TOTAL-88888']
  const row = {
    id: 'itin_internal_id_123', referenceNumber: 'WALZ-JVUSUS', status: 'proposal', title: 'INTERNAL-TITLE-XYZ', notes: 'SECRET-NOTES',
    priceBreakdown: 'PRICEBREAKDOWN-X', totalPrice: 'TOTAL-88888', supplierCost: 'SUPPLIER-COST-999', margin: 'MARGIN-55',
    flights: '[{"supplierId":"supplier-id-77"}]', hotels: '[{"supplierId":"supplier-id-77"}]',
    clientName: 'Ada Obi', destination: 'Doha, Qatar', startDate: D('2026-12-01'), endDate: D('2026-12-07'), coverImage: null,
  }
  beforeEach(() => mockFind.mockReset())

  it('public itinerary -> specific metadata, selects only needed columns, no leakage', async () => {
    mockFind.mockImplementation(async ({ where, select }: any) => {
      const out: any = {}; for (const k of Object.keys(select)) out[k] = (row as any)[k]; return where.referenceNumber === row.referenceNumber ? out : null
    })
    const m = await resolveItineraryMetadata('WALZ-JVUSUS')
    expect(title(m)).toBe('Walz Travels Itinerary | Doha, Qatar')
    const sel = mockFind.mock.calls[0][0].select
    expect(Object.keys(sel).sort()).toEqual(['clientName', 'coverImage', 'destination', 'endDate', 'referenceNumber', 'startDate', 'status'])
    const s = JSON.stringify(m)
    for (const p of POISON) expect(s).not.toContain(p)
    // even if the DB layer over-returned every column
    mockFind.mockResolvedValue(row)
    const s2 = JSON.stringify(await resolveItineraryMetadata('WALZ-JVUSUS'))
    for (const p of POISON) expect(s2).not.toContain(p)
  })
  it('unknown ref, non-public status, DB error -> generic', async () => {
    mockFind.mockResolvedValue(null)
    expect(await resolveItineraryMetadata('NOPE')).toEqual(GENERIC_ITINERARY_METADATA)
    mockFind.mockResolvedValue({ ...row, status: 'draft' })
    const m = await resolveItineraryMetadata('WALZ-JVUSUS')
    expect(m).toEqual(GENERIC_ITINERARY_METADATA); expect(JSON.stringify(m)).not.toContain('Doha')
    mockFind.mockRejectedValue(new Error('db down'))
    await expect(resolveItineraryMetadata('WALZ-JVUSUS')).resolves.toEqual(GENERIC_ITINERARY_METADATA)
  })
  it('never returns another itinerary for a different ref', async () => {
    mockFind.mockImplementation(async ({ where }: any) => (where.referenceNumber === 'WALZ-A' ? { ...row, referenceNumber: 'WALZ-A' } : null))
    const other: any = await resolveItineraryMetadata('WALZ-B')
    expect(other).toEqual(GENERIC_ITINERARY_METADATA)
    const a: any = await resolveItineraryMetadata('WALZ-A')
    expect(a.alternates.canonical).toContain('WALZ-A')
  })
  it('generic fallback equals the previous static object', () => {
    expect(GENERIC_ITINERARY_METADATA).toEqual({
      title: { absolute: 'Your Travel Itinerary | Walz Travels' },
      description: 'Review your customized travel itinerary from Walz Travels.',
      robots: { index: false, follow: false, noarchive: true, nosnippet: true },
    })
  })
})

describe('wiring', () => {
  it('page exports generateMetadata and not a static metadata', () => {
    const src = read('app/itinerary/[ref]/page.tsx')
    expect(src).toMatch(/export async function generateMetadata/)
    expect(src).not.toMatch(/export const metadata/)
  })
  it('root layout metadata stays generic', () => {
    const src = read('app/layout.tsx')
    expect(src).toContain("title: 'Walz Travels | Flights, Visas & Tours'")
    expect(src).toContain('walz-travels-og-share-image.png')
    expect(src).not.toContain('/og/itinerary')
  })
  it('og image route exports only allowed fields', () => {
    const src = read('app/og/itinerary/[ref]/route.tsx')
    const exports = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)].map(m => m[1]).sort()
    expect(exports).toEqual(['GET', 'dynamic', 'runtime'])
    expect(src.replace(/\/\/.*/g, '')).not.toMatch(/clientName|referenceNumber|price/i)
  })
  it('robots: social bots may fetch /itinerary/ and /og/; * and AI bots still blocked', () => {
    const r: any = robots()
    const rule = (ua: string) => r.rules.find((x: any) => x.userAgent === ua)
    for (const ua of ['facebookexternalhit', 'Facebot', 'Twitterbot', 'LinkedInBot', 'Slackbot', 'TelegramBot', 'Discordbot', 'WhatsApp']) {
      const x = rule(ua)
      expect(x.allow).toEqual(expect.arrayContaining(['/itinerary/', '/og/']))
      expect(x.disallow).not.toContain('/itinerary/')
      expect(x.disallow).toContain('/admin/'); expect(x.disallow).toContain('/api/')
      expect(x.disallow).toEqual(expect.arrayContaining(['/itinerary/*/portal', '/itinerary/*/approve']))
      for (const b of ['/portal/', '/checkout/', '/quote/', '/trip/']) expect(x.disallow).toContain(b)
    }
    for (const ua of ['*', 'GPTBot', 'Claude-Web', 'anthropic-ai', 'PerplexityBot']) expect(rule(ua).disallow).toContain('/itinerary/')
  })
})
