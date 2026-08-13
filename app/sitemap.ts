import { MetadataRoute } from 'next'
import prisma from '@/lib/db'
import { ISO2_TO_SLUG } from '@/lib/visa-config'

export const dynamic = 'force-dynamic'

const BASE = 'https://www.walztravels.com'

// Concierge hub + dedicated sub-pages (all verified 200 on production)
const CONCIERGE_STATIC = [
  { path: '/concierge',                  priority: 0.80 as const },
  { path: '/concierge/airport-services', priority: 0.75 as const },
  { path: '/concierge/private-aviation', priority: 0.75 as const },
]

// [slug] pages — verified 200 on production before being added
const CONCIERGE_SLUGS = [
  'executive-transport',
  'yacht-marine',
  'lifestyle-concierge',
  'tickets-entertainment',
  'vip-experiences',
]

// 19 programmatic flight route pages — declared now, built out as programmatic SEO pages
const FLIGHT_ROUTES = [
  'los-lhr', 'acc-lhr', 'los-dxb', 'los-jfk', 'acc-jfk',
  'los-yyz', 'acc-yyz', 'los-nbo', 'los-jnb', 'los-bom',
  'acc-dxb', 'acc-nbo', 'los-cdg', 'los-fra', 'acc-cdg',
  'los-ams', 'acc-ams', 'los-iad', 'los-atl',
]

// 16 visa destination pages — high commercial intent
const VISA_DESTINATIONS = [
  'united-kingdom', 'canada', 'usa', 'schengen', 'uae',
  'australia', 'nigeria', 'ghana', 'germany', 'france',
  'netherlands', 'turkey', 'india', 'china', 'south-africa', 'brazil',
]

// 7 programmatic SEO visa landing pages — nationality-specific, high intent
const VISA_SEO_PAGES = [
  'uk-visa-nigeria',
  'uk-visa-ghana',
  'canada-visa-nigeria',
  'canada-visa-ghana',
  'schengen-visa-nigeria',
  'canada-relocation-guide-nigeria',
]

// Non-route SEO flight hub pages
const FLIGHT_HUB_PAGES = [
  'cheap-flights-from-lagos',
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE,                      lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/visa`,            lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${BASE}/rates`,           lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${BASE}/flights`,         lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/hotels`,          lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8 },
    { url: `${BASE}/tours`,           lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE}/activities`,      lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE}/packages`,        lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE}/esim`,            lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/blog`,            lastModified: new Date(), changeFrequency: 'daily',   priority: 0.7 },
    { url: `${BASE}/about`,           lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/contact`,         lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/help`,            lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE}/privacy`,         lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${BASE}/terms`,           lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3 },
    // 16 visa destination pages — priority 0.90 (high commercial intent)
    ...VISA_DESTINATIONS.map(dest => ({
      url:             `${BASE}/visa/apply/${dest}`,
      lastModified:    new Date(),
      changeFrequency: 'monthly' as const,
      priority:        0.90,
    })),
    // 19 programmatic flight route pages — priority 0.85, daily (price-sensitive)
    ...FLIGHT_ROUTES.map(route => ({
      url:             `${BASE}/flights/${route}`,
      lastModified:    new Date(),
      changeFrequency: 'daily' as const,
      priority:        0.85,
    })),
    // 7 nationality-specific visa SEO pages — priority 0.90 (high commercial intent)
    ...VISA_SEO_PAGES.map(slug => ({
      url:             `${BASE}/visa/${slug}`,
      lastModified:    new Date(),
      changeFrequency: 'monthly' as const,
      priority:        0.90,
    })),
    // Flight hub SEO pages (non-route)
    ...FLIGHT_HUB_PAGES.map(slug => ({
      url:             `${BASE}/flights/${slug}`,
      lastModified:    new Date(),
      changeFrequency: 'weekly' as const,
      priority:        0.85,
    })),
    // Concierge hub + dedicated sub-pages
    ...CONCIERGE_STATIC.map(({ path, priority }) => ({
      url:             `${BASE}${path}`,
      lastModified:    new Date(),
      changeFrequency: 'weekly' as const,
      priority,
    })),
    // Concierge [slug] category pages — verified 200 in production
    ...CONCIERGE_SLUGS.map(slug => ({
      url:             `${BASE}/concierge/${slug}`,
      lastModified:    new Date(),
      changeFrequency: 'monthly' as const,
      priority:        0.70,
    })),
    // Additional high-value pages
    { url: `${BASE}/insurance`,     lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/transfers`,     lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/gift`,          lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/partners`,      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE}/press`,         lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE}/careers`,       lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE}/accessibility`, lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.2 },
  ]

  let blogPages: MetadataRoute.Sitemap = []
  try {
    const posts = await prisma.blogPost.findMany({
      where:   { published: true },
      select:  { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    })
    blogPages = posts.map(post => ({
      url:             `${BASE}/blog/${post.slug}`,
      lastModified:    post.updatedAt,
      changeFrequency: 'monthly' as const,
      priority:        0.6,
    }))
  } catch {}

  // Visa info pages — only include destinations that have portal data in the DB
  let visaInfoPages: MetadataRoute.Sitemap = []
  try {
    const portals = await prisma.countryPortal.findMany({
      select: { destinationIso2: true, updatedAt: true },
    })
    visaInfoPages = portals
      .filter(p => ISO2_TO_SLUG[p.destinationIso2])
      .map(p => ({
        url:             `${BASE}/visa/${ISO2_TO_SLUG[p.destinationIso2]}`,
        lastModified:    p.updatedAt,
        changeFrequency: 'monthly' as const,
        priority:        0.80,
      }))
  } catch {}

  let tourPages: MetadataRoute.Sitemap = []
  let packagePages: MetadataRoute.Sitemap = []
  try {
    const listings = await prisma.tourListing.findMany({
      where:   { active: true },
      select:  { slug: true, updatedAt: true, type: true },
    })
    tourPages = listings
      .filter(l => l.type !== 'package')
      .map(l => ({
        url:             `${BASE}/tours/${l.slug}`,
        lastModified:    l.updatedAt,
        changeFrequency: 'weekly' as const,
        priority:        0.7,
      }))
    packagePages = listings
      .filter(l => l.type === 'package')
      .map(l => ({
        url:             `${BASE}/packages/${l.slug}`,
        lastModified:    l.updatedAt,
        changeFrequency: 'weekly' as const,
        priority:        0.8,
      }))
  } catch {}

  return [...staticPages, ...visaInfoPages, ...blogPages, ...tourPages, ...packagePages]
}
