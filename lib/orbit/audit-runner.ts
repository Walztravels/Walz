/**
 * Orbit audit runner.
 * Fetches walztravels.com pages, parses HTML, runs SEO checks, writes results to DB.
 * Designed to complete within Vercel's 60s function limit via parallelised fetching.
 */

import { prisma } from '@/lib/db'

// ── HTML parsing helpers ──────────────────────────────────────────────────────

interface ParsedPage {
  title: string | null
  metaDescription: string | null
  canonical: string | null
  robotsMeta: string | null
  viewport: string | null
  h1s: string[]
  ogTitle: string | null
  ogDescription: string | null
  ogImage: string | null
  ogUrl: string | null
  twitterCard: string | null
  structuredData: string[]     // raw JSON-LD blocks
  imagesMissingAlt: number
  internalLinks: string[]
  externalLinks: string[]
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}=["']([^"']*?)["']`, 'i'))
  return m ? m[1] : null
}

function parseHtml(html: string, pageUrl: string): ParsedPage {
  const base = new URL(pageUrl)

  // title
  const titleM = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleM ? titleM[1].trim() : null

  // meta tags — collect name/property → content
  const metas: Record<string, string> = {}
  let m: RegExpExecArray | null
  const metaRe = /<meta\s+([^>]+?)(?:\s*\/)?>/gi
  while ((m = metaRe.exec(html)) !== null) {
    const full = m[1]
    const key = (attr(full, 'name') ?? attr(full, 'property') ?? '').toLowerCase()
    const val = attr(full, 'content')
    if (key && val !== null) metas[key] = val
  }

  // canonical
  const canonRe = /<link\s[^>]*rel=["']canonical["'][^>]*>/gi
  let canonical: string | null = null
  while ((m = canonRe.exec(html)) !== null) {
    canonical = attr(m[0], 'href')
    break
  }
  // also try reversed attr order
  if (!canonical) {
    const canonRe2 = /<link\s[^>]*href=["'][^"']+["'][^>]*rel=["']canonical["'][^>]*>/gi
    while ((m = canonRe2.exec(html)) !== null) {
      canonical = attr(m[0], 'href')
      break
    }
  }

  // H1s
  const h1s: string[] = []
  const h1Re = /<h1[^>]*>([\s\S]*?)<\/h1>/gi
  while ((m = h1Re.exec(html)) !== null) {
    h1s.push(m[1].replace(/<[^>]+>/g, '').trim())
  }

  // JSON-LD
  const structuredData: string[] = []
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  while ((m = ldRe.exec(html)) !== null) {
    structuredData.push(m[1].trim())
  }

  // images missing alt
  let imagesMissingAlt = 0
  const imgRe = /<img\s([^>]+?)(?:\s*\/)?>/gi
  while ((m = imgRe.exec(html)) !== null) {
    const altVal = attr(m[1], 'alt')
    if (altVal === null || altVal === '') imagesMissingAlt++
  }

  // internal + external links
  const internalLinks: string[] = []
  const externalLinks: string[] = []
  const aRe = /<a\s[^>]*href=["']([^"'#?][^"']*)["'][^>]*>/gi
  while ((m = aRe.exec(html)) !== null) {
    const href = m[1].trim()
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue
    try {
      const resolved = new URL(href, base)
      if (resolved.hostname === base.hostname) {
        const path = resolved.pathname
        if (!internalLinks.includes(path)) internalLinks.push(path)
      } else {
        if (!externalLinks.includes(resolved.href)) externalLinks.push(resolved.href)
      }
    } catch { /* invalid URL */ }
  }

  return {
    title,
    metaDescription: metas['description'] ?? null,
    canonical,
    robotsMeta: metas['robots'] ?? null,
    viewport: metas['viewport'] ?? null,
    h1s,
    ogTitle: metas['og:title'] ?? null,
    ogDescription: metas['og:description'] ?? null,
    ogImage: metas['og:image'] ?? null,
    ogUrl: metas['og:url'] ?? null,
    twitterCard: metas['twitter:card'] ?? null,
    structuredData,
    imagesMissingAlt,
    internalLinks,
    externalLinks,
  }
}

// ── Robots.txt parser ─────────────────────────────────────────────────────────

interface RobotsBlock { agent: string; disallows: string[] }

function parseRobots(text: string): RobotsBlock[] {
  const blocks: RobotsBlock[] = []
  let current: RobotsBlock | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('#') || !line) {
      if (line === '' && current) { blocks.push(current); current = null }
      continue
    }
    const [key, ...vals] = line.split(':')
    const val = vals.join(':').trim()
    if (key.toLowerCase() === 'user-agent') {
      if (current) blocks.push(current)
      current = { agent: val, disallows: [] }
    } else if (key.toLowerCase() === 'disallow' && current) {
      current.disallows.push(val)
    }
  }
  if (current) blocks.push(current)
  return blocks
}

// ── Sitemap parser ────────────────────────────────────────────────────────────

function parseSitemapXml(xml: string): string[] {
  const urls: string[] = []
  const locRe = /<loc>([^<]+)<\/loc>/g
  let m: RegExpExecArray | null
  while ((m = locRe.exec(xml)) !== null) {
    urls.push(m[1].trim())
  }
  return urls
}

// ── Issue helpers ─────────────────────────────────────────────────────────────

type Severity = 'critical' | 'high' | 'medium' | 'low'

interface Issue {
  checkName: string
  severity: Severity
  title: string
  description: string
  evidence?: string
  fixPreview?: string
}

// ── Score calculation ─────────────────────────────────────────────────────────

function calcScore(critical: number, high: number, medium: number, low: number): number {
  const deduction =
    Math.min(critical * 15, 45) +
    Math.min(high * 8, 32) +
    Math.min(medium * 3, 15) +
    Math.min(low * 1, 8)
  return Math.max(0, 100 - deduction)
}

// ── Fetch with timeout ────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000,
): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

// ── Per-page check runner ─────────────────────────────────────────────────────

function runPageChecks(
  parsed: ParsedPage,
  url: string,
  inSitemap: boolean,
  brandSuffix: string,
  allTitles: Map<string, string>,   // title → first-seen URL
): Issue[] {
  const issues: Issue[] = []
  const u = new URL(url)

  // 1. Canonical self-reference
  if (parsed.canonical) {
    try {
      const canonUrl = new URL(parsed.canonical)
      if (canonUrl.href !== u.href && canonUrl.pathname !== u.pathname) {
        const isSiteRoot = canonUrl.pathname === '/'
        issues.push({
          checkName: 'canonical_mismatch',
          severity: isSiteRoot ? 'critical' : 'high',
          title: 'Canonical points to wrong page',
          description: `The canonical tag on this page points to a different URL instead of itself.`,
          evidence: `canonical: ${parsed.canonical} — expected: ${url}`,
          fixPreview: `<link rel="canonical" href="${url}" />`,
        })
      }
    } catch { /* invalid canonical URL */ }
  } else {
    issues.push({
      checkName: 'canonical_missing',
      severity: 'medium',
      title: 'No canonical tag',
      description: 'Page is missing a self-referencing canonical tag.',
      fixPreview: `<link rel="canonical" href="${url}" />`,
    })
  }

  // 2. Title checks
  if (!parsed.title) {
    issues.push({
      checkName: 'title_missing',
      severity: 'high',
      title: 'Missing title tag',
      description: 'This page has no <title> element.',
    })
  } else {
    // Duplicated brand suffix (e.g. "| Walz Travels | Walz Travels")
    const suffixPattern = new RegExp(`(${escapeRe(brandSuffix)}){2,}`, 'i')
    if (suffixPattern.test(parsed.title)) {
      issues.push({
        checkName: 'title_double_brand_suffix',
        severity: 'high',
        title: 'Duplicated brand suffix in title',
        description: `The brand suffix appears more than once in the title tag.`,
        evidence: parsed.title,
        fixPreview: parsed.title.replace(suffixPattern, brandSuffix),
      })
    }
    // Duplicate title across site
    const existing = allTitles.get(parsed.title.toLowerCase())
    if (existing && existing !== url) {
      issues.push({
        checkName: 'title_duplicate',
        severity: 'medium',
        title: 'Duplicate title tag',
        description: `This page shares its title with another page (${existing}).`,
        evidence: parsed.title,
      })
    } else {
      allTitles.set(parsed.title.toLowerCase(), url)
    }
  }

  // 3. Meta description
  if (!parsed.metaDescription) {
    issues.push({
      checkName: 'meta_description_missing',
      severity: 'high',
      title: 'Missing meta description',
      description: 'No meta description found. Google uses this in search results.',
    })
  } else if (parsed.metaDescription.length > 160) {
    issues.push({
      checkName: 'meta_description_long',
      severity: 'low',
      title: 'Meta description too long',
      description: `Meta description is ${parsed.metaDescription.length} characters. Google truncates at ~160 chars.`,
      evidence: parsed.metaDescription,
    })
  } else if (parsed.metaDescription.length < 50) {
    issues.push({
      checkName: 'meta_description_short',
      severity: 'low',
      title: 'Meta description too short',
      description: `Meta description is only ${parsed.metaDescription.length} characters. Aim for 50-160.`,
    })
  }

  // 4. H1
  if (parsed.h1s.length === 0) {
    issues.push({
      checkName: 'h1_missing',
      severity: 'high',
      title: 'No H1 heading',
      description: 'Page has no <h1> element. Each page should have exactly one.',
    })
  } else if (parsed.h1s.length > 1) {
    issues.push({
      checkName: 'h1_multiple',
      severity: 'medium',
      title: `${parsed.h1s.length} H1 headings`,
      description: 'Multiple H1 elements found. Only one per page is recommended.',
      evidence: parsed.h1s.join(' · '),
    })
  }

  // 5. Open Graph
  if (!parsed.ogTitle || !parsed.ogDescription || !parsed.ogImage) {
    const missing = [
      !parsed.ogTitle && 'og:title',
      !parsed.ogDescription && 'og:description',
      !parsed.ogImage && 'og:image',
    ].filter(Boolean).join(', ')
    issues.push({
      checkName: 'og_incomplete',
      severity: 'medium',
      title: 'Incomplete Open Graph tags',
      description: `Missing: ${missing}. Required for rich social previews.`,
    })
  }

  // 6. Twitter card
  if (!parsed.twitterCard) {
    issues.push({
      checkName: 'twitter_card_missing',
      severity: 'low',
      title: 'No Twitter Card meta tags',
      description: 'twitter:card tag missing. Add at minimum twitter:card and twitter:title.',
    })
  }

  // 7. Structured data
  if (parsed.structuredData.length === 0) {
    issues.push({
      checkName: 'structured_data_missing',
      severity: 'low',
      title: 'No structured data (JSON-LD)',
      description: 'No application/ld+json found. Structured data helps search engines understand page content.',
    })
  } else {
    // Try parsing each block
    for (const block of parsed.structuredData) {
      try {
        JSON.parse(block)
      } catch {
        issues.push({
          checkName: 'structured_data_invalid',
          severity: 'high',
          title: 'Structured data JSON is invalid',
          description: 'A JSON-LD block on this page contains invalid JSON.',
          evidence: block.slice(0, 200) + (block.length > 200 ? '…' : ''),
        })
      }
    }
  }

  // 8. Indexability
  if (parsed.robotsMeta && /noindex/i.test(parsed.robotsMeta)) {
    issues.push({
      checkName: 'noindex',
      severity: 'critical',
      title: 'Page is set to noindex',
      description: `robots meta content="${parsed.robotsMeta}" prevents indexing.`,
      evidence: `<meta name="robots" content="${parsed.robotsMeta}">`,
    })
  }

  // 9. Mobile readiness
  if (!parsed.viewport) {
    issues.push({
      checkName: 'no_viewport',
      severity: 'high',
      title: 'No viewport meta tag',
      description: 'Missing <meta name="viewport"> — page may not render correctly on mobile.',
      fixPreview: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    })
  }

  // 10. Image alt text
  if (parsed.imagesMissingAlt > 0) {
    issues.push({
      checkName: 'images_missing_alt',
      severity: parsed.imagesMissingAlt >= 5 ? 'medium' : 'low',
      title: `${parsed.imagesMissingAlt} image${parsed.imagesMissingAlt > 1 ? 's' : ''} missing alt text`,
      description: 'Alt text is required for accessibility and is used by Google Images.',
    })
  }

  // 11. Sitemap presence
  if (!inSitemap) {
    issues.push({
      checkName: 'not_in_sitemap',
      severity: 'medium',
      title: 'Page not found in sitemap',
      description: 'This page was discovered but is not listed in sitemap.xml. Search engines may not crawl it.',
    })
  }

  return issues
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Main audit runner (called from the process API route) ─────────────────────

export async function runAudit(auditId: string): Promise<void> {
  const startedAt = new Date()

  // Mark as running
  await prisma.orbitAudit.update({
    where: { id: auditId },
    data: { status: 'running', startedAt },
  })

  try {
    const audit = await prisma.orbitAudit.findUniqueOrThrow({ where: { id: auditId } })
    const siteUrl = audit.siteUrl.replace(/\/$/, '')
    const baseHostname = new URL(siteUrl).hostname

    // ── Fetch robots.txt ────────────────────────────────────────────────────
    let robotsBlocks: RobotsBlock[] = []
    try {
      const robotsRes = await fetchWithTimeout(`${siteUrl}/robots.txt`, {}, 8000)
      if (robotsRes.ok) robotsBlocks = parseRobots(await robotsRes.text())
    } catch { /* robots.txt unavailable */ }

    // ── Fetch sitemap.xml ────────────────────────────────────────────────────
    let sitemapUrls: string[] = []
    try {
      const sitemapRes = await fetchWithTimeout(`${siteUrl}/sitemap.xml`, {}, 8000)
      if (sitemapRes.ok) sitemapUrls = parseSitemapXml(await sitemapRes.text())
    } catch { /* sitemap unavailable */ }

    const sitemapSet = new Set(sitemapUrls.map(u => {
      try { return new URL(u).pathname } catch { return u }
    }))

    // Limit to max 60 pages for 60s function budget
    const urlsToAudit = sitemapUrls.slice(0, 60)
    await prisma.orbitAudit.update({ where: { id: auditId }, data: { pagesTotal: urlsToAudit.length } })

    // ── Parallel site fetch in batches of 10 ────────────────────────────────
    const allPageResults: Array<{
      url: string
      statusCode: number
      responseTimeMs: number
      parsed: ParsedPage | null
    }> = []

    for (let i = 0; i < urlsToAudit.length; i += 10) {
      const batch = urlsToAudit.slice(i, i + 10)
      const results = await Promise.allSettled(
        batch.map(async (url) => {
          const t0 = Date.now()
          try {
            const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'OrbitBot/1.0 (+https://walztravels.com)' } }, 10000)
            const responseTimeMs = Date.now() - t0
            const ct = res.headers.get('content-type') ?? ''
            const isHtml = ct.includes('text/html')
            const html = isHtml ? await res.text() : ''
            return {
              url,
              statusCode: res.status,
              responseTimeMs,
              parsed: isHtml && html ? parseHtml(html, url) : null,
            }
          } catch (err) {
            return {
              url,
              statusCode: 0,
              responseTimeMs: Date.now() - t0,
              parsed: null,
            }
          }
        })
      )
      for (const r of results) {
        if (r.status === 'fulfilled') allPageResults.push(r.value)
      }
      // Update progress
      await prisma.orbitAudit.update({
        where: { id: auditId },
        data: { pagesDone: Math.min(i + 10, urlsToAudit.length) },
      })
    }

    // ── Settings for checks ──────────────────────────────────────────────────
    const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
    const brandSuffix = settings?.brandSuffix ?? '| Walz Travels'

    // ── Cross-page title map (for duplicate detection) ───────────────────────
    const allTitles = new Map<string, string>() // title → first URL

    // ── Write pages and issues to DB ─────────────────────────────────────────
    let totalCritical = 0, totalHigh = 0, totalMedium = 0, totalLow = 0

    for (const { url, statusCode, responseTimeMs, parsed } of allPageResults) {
      const pathName = (() => { try { return new URL(url).pathname } catch { return url } })()
      const inSitemap = sitemapSet.has(pathName)

      // Create page record
      const page = await prisma.orbitAuditPage.create({
        data: {
          auditId,
          url,
          statusCode,
          responseTimeMs,
          title: parsed?.title ?? null,
          metaDescription: parsed?.metaDescription ?? null,
          canonical: parsed?.canonical ?? null,
          robotsMeta: parsed?.robotsMeta ?? null,
          h1Count: parsed?.h1s.length ?? 0,
          hasOg: !!(parsed?.ogTitle && parsed?.ogDescription && parsed?.ogImage),
          hasTwitterCard: !!parsed?.twitterCard,
          hasStructuredData: (parsed?.structuredData.length ?? 0) > 0,
          isIndexed: parsed?.robotsMeta ? !/noindex/i.test(parsed.robotsMeta) : true,
          inSitemap,
          imageMissingAlt: parsed?.imagesMissingAlt ?? 0,
          internalLinks: parsed?.internalLinks ?? [],
        },
      })

      // 404 check
      const pageIssues: Issue[] = []
      if (statusCode === 404) {
        pageIssues.push({
          checkName: 'sitemap_url_404',
          severity: 'critical',
          title: 'Sitemap URL returns 404',
          description: 'This URL appears in sitemap.xml but returns a 404. Search engines will flag this.',
          evidence: `HTTP ${statusCode} for ${url}`,
        })
      } else if (statusCode === 0) {
        pageIssues.push({
          checkName: 'page_unreachable',
          severity: 'high',
          title: 'Page could not be reached',
          description: 'Request timed out or connection failed.',
        })
      } else if (statusCode >= 300 && statusCode < 400) {
        pageIssues.push({
          checkName: 'redirect_in_sitemap',
          severity: 'medium',
          title: `Sitemap URL returns ${statusCode} redirect`,
          description: 'Sitemap should list the final destination URL, not a redirect.',
        })
      }

      if (parsed && statusCode === 200) {
        pageIssues.push(...runPageChecks(parsed, url, inSitemap, brandSuffix, allTitles))
      }

      // Slow response
      if (responseTimeMs > 3000 && statusCode === 200) {
        pageIssues.push({
          checkName: 'slow_response',
          severity: 'low',
          title: `Slow response time (${(responseTimeMs / 1000).toFixed(1)}s)`,
          description: 'Page took over 3 seconds to respond. Core Web Vitals may be affected.',
        })
      }

      // Write issues
      if (pageIssues.length > 0) {
        await prisma.orbitAuditIssue.createMany({
          data: pageIssues.map(issue => ({
            auditId,
            pageId: page.id,
            url,
            ...issue,
          })),
        })
        for (const iss of pageIssues) {
          if (iss.severity === 'critical') totalCritical++
          else if (iss.severity === 'high') totalHigh++
          else if (iss.severity === 'medium') totalMedium++
          else totalLow++
        }
      }
    }

    // ── Robots.txt cross-agent check ─────────────────────────────────────────
    const REQUIRED_DISALLOW = '/flights/search'
    const agentsWithoutDisallow = robotsBlocks.filter(
      b => !b.disallows.some(d => d === REQUIRED_DISALLOW || REQUIRED_DISALLOW.startsWith(d))
    )
    if (agentsWithoutDisallow.length > 0) {
      const agents = agentsWithoutDisallow.map(b => b.agent).join(', ')
      await prisma.orbitAuditIssue.create({
        data: {
          auditId,
          url: `${siteUrl}/robots.txt`,
          checkName: 'robots_missing_disallow',
          severity: 'high',
          title: `robots.txt missing Disallow: ${REQUIRED_DISALLOW} for some agents`,
          description: `${REQUIRED_DISALLOW} generates unbounded crawlable URLs with rolling dates. All user-agent blocks must disallow it.`,
          evidence: `Agents without Disallow: ${REQUIRED_DISALLOW} — ${agents}`,
          fixPreview: `Add "Disallow: ${REQUIRED_DISALLOW}" under User-agent: * (and all named bots)`,
        },
      })
      totalHigh++
    }

    // ── Sitemap coverage: are all crawled pages in the sitemap? ──────────────
    // (already handled per-page via not_in_sitemap check above)

    // ── Finalise ─────────────────────────────────────────────────────────────
    const score = calcScore(totalCritical, totalHigh, totalMedium, totalLow)
    await prisma.orbitAudit.update({
      where: { id: auditId },
      data: {
        status: 'complete',
        pagesDone: urlsToAudit.length,
        issuesCritical: totalCritical,
        issuesHigh: totalHigh,
        issuesMedium: totalMedium,
        issuesLow: totalLow,
        score,
        completedAt: new Date(),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.orbitAudit.update({
      where: { id: auditId },
      data: { status: 'failed', error: msg, completedAt: new Date() },
    })
  }
}
