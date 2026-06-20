import { MetadataRoute } from 'next'

const BLOCKED = ['/admin/', '/portal/', '/api/', '/_next/', '/auth/']

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
