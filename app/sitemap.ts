import { MetadataRoute } from 'next'
import prisma from '@/lib/db'

const BASE = 'https://www.walztravels.com'

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

  let tourPages: MetadataRoute.Sitemap = []
  try {
    const tours = await prisma.tourListing.findMany({
      where:   { active: true },
      select:  { slug: true, updatedAt: true },
    })
    tourPages = tours.map(tour => ({
      url:             `${BASE}/tours/${tour.slug}`,
      lastModified:    tour.updatedAt,
      changeFrequency: 'weekly' as const,
      priority:        0.7,
    }))
  } catch {}

  return [...staticPages, ...blogPages, ...tourPages]
}
