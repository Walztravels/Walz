import { MetadataRoute } from 'next'

// Crawl exclusions for private route families. robots.txt is a crawl hint,
// never the privacy control — auth and hashed tokens remain the real
// protection, and each of these families also carries noindex metadata.
const BLOCKED = [
  '/admin/',
  '/portal/',
  '/api/',
  '/auth/',
  '/dashboard/',
  '/my-account/',
  // Careers: private candidate flows (the job pages themselves stay crawlable)
  '/careers/application/',
  '/careers/interview/',
  '/careers/offer/',
  // Client itineraries, proposals, quotes and trip flows
  '/itinerary/',
  '/trip/',
  '/trip-request/',
  '/quote/',
  '/quote-proposal/',
  '/plan/',
  '/group/',
  '/group-visa/',
  // Payment, checkout and tokenized flows
  '/checkout/',
  '/cart',
  '/payment/',
  '/pay/',
  '/authorize/',
  '/credit-card-authorization/',
  '/payment-authentication/',
  '/upload/',
  '/track/',
  '/visa/track/',
  '/report/',
  // Flight search — rolling-date query strings produce an unbounded crawl surface
  '/flights/search',
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
