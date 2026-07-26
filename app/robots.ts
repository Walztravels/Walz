import { MetadataRoute } from 'next'

const BLOCKED = [
  '/admin/',
  '/portal/',
  '/api/',
  '/auth/',
  // Concierge transactional pages — booking refs and vouchers must never be indexed
  '/concierge/bookings/',
  '/concierge/airport-services/lounge/checkout',
  '/concierge/airport-services/meet-greet/checkout',
  '/concierge/airport-services/transfer/checkout',
  '/concierge/airport-services/sleeping-pod/checkout',
  '/concierge/airport-services/baggage/checkout',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*',             allow: '/', disallow: BLOCKED },
      // AI crawlers — explicitly allow so Walz appears in ChatGPT/Perplexity/Claude answers
      { userAgent: 'GPTBot',        allow: '/', disallow: BLOCKED },
      { userAgent: 'Claude-Web',    allow: '/', disallow: BLOCKED },
      { userAgent: 'anthropic-ai',  allow: '/', disallow: BLOCKED },
      { userAgent: 'PerplexityBot', allow: '/', disallow: BLOCKED },
    ],
    sitemap: 'https://www.walztravels.com/sitemap.xml',
  }
}
