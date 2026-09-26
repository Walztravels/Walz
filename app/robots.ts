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

// Link-preview fetchers. A 'Disallow: /itinerary/' makes several of them
// (Meta, Twitter/X, LinkedIn, Slack, Telegram, Discord, WhatsApp) skip the page
// and show a bare link. These groups let them fetch the share page and the
// /og/ fallback image only; the page itself stays noindex via its meta tag, so
// this does not make itineraries searchable. Everything else stays blocked.
const SOCIAL_PREVIEW_BOTS = [
  'facebookexternalhit', 'Facebot', 'meta-externalagent', 'Twitterbot', 'LinkedInBot', 'Slackbot',
  'Slack-ImgProxy', 'TelegramBot', 'Discordbot', 'WhatsApp',
]
const SOCIAL_PREVIEW_ALLOW = ['/', '/itinerary/', '/og/']
// Longest-match wins, so these beat 'Allow: /itinerary/' — the token-protected
// sub-routes (app/itinerary/[ref]/portal, /approve) stay uncrawlable.
const ITINERARY_PRIVATE_SUBPATHS = ['/itinerary/*/portal', '/itinerary/*/approve']
const SOCIAL_PREVIEW_DISALLOW = [...BLOCKED.filter(p => p !== '/itinerary/'), ...ITINERARY_PRIVATE_SUBPATHS]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*',             allow: '/', disallow: BLOCKED },
      // AI crawlers — explicitly allow so Walz appears in ChatGPT/Perplexity/Claude answers
      { userAgent: 'GPTBot',        allow: '/', disallow: BLOCKED },
      { userAgent: 'Claude-Web',    allow: '/', disallow: BLOCKED },
      { userAgent: 'anthropic-ai',  allow: '/', disallow: BLOCKED },
      { userAgent: 'PerplexityBot', allow: '/', disallow: BLOCKED },
      ...SOCIAL_PREVIEW_BOTS.map(userAgent => ({
        userAgent, allow: SOCIAL_PREVIEW_ALLOW, disallow: SOCIAL_PREVIEW_DISALLOW,
      })),
    ],
    sitemap: 'https://www.walztravels.com/sitemap.xml',
  }
}
