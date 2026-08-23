/**
 * Orbit campaign generator.
 * One Claude API call per campaign — produces all ad/social/email variants in a single batch.
 * Token cap enforced before sending; cost recorded after response.
 */

import { getAnthropic } from '@/lib/anthropic'
import { filterContent } from '@/lib/orbit/content-filter'
import { prisma } from '@/lib/db'

// ── Pricing (Sonnet) ──────────────────────────────────────────────────────────
const PRICE_INPUT_PER_M  = 3.00   // USD per 1M input tokens
const PRICE_OUTPUT_PER_M = 15.00  // USD per 1M output tokens

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * PRICE_INPUT_PER_M +
         (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M
}

// ── Real price context pulled from DB ────────────────────────────────────────

interface PriceContext {
  visaServices: Array<{ country: string; visaType: string; fee: number; currency: string }>
  tours: Array<{ name: string; price: number; currency: string }>
  packages: Array<{ name: string; pricePerPerson: string; currency: string }>
}

async function loadPriceContext(destination: string): Promise<PriceContext> {
  const dest = destination.toLowerCase()

  const [visaServices, tours, packages] = await Promise.all([
    prisma.visaService.findMany({
      where: { active: true, country: { contains: dest, mode: 'insensitive' } },
      select: { country: true, visaType: true, fee: true, currency: true },
      take: 5,
    }),
    prisma.tour.findMany({
      where: { name: { contains: dest, mode: 'insensitive' } },
      select: { name: true, price: true },
      take: 5,
    }).then(rows => rows.map(r => ({ ...r, currency: 'GBP' }))),
    prisma.package.findMany({
      where: { destinationName: { contains: dest, mode: 'insensitive' } },
      select: { destinationName: true, startingPriceUsd: true },
      take: 5,
    }).then(rows => rows.map(r => ({ name: r.destinationName, pricePerPerson: r.startingPriceUsd?.toFixed(2) ?? '—', currency: 'USD' }))),
  ])

  return { visaServices, tours, packages }
}

function formatPriceContext(ctx: PriceContext): string {
  const lines: string[] = []
  if (ctx.visaServices.length) {
    lines.push('Visa services:')
    ctx.visaServices.forEach(v => lines.push(`  - ${v.country} ${v.visaType}: ${v.currency}${v.fee}`))
  }
  if (ctx.tours.length) {
    lines.push('Tours:')
    ctx.tours.forEach(t => lines.push(`  - ${t.name}: from £${t.price}`))
  }
  if (ctx.packages.length) {
    lines.push('Packages:')
    ctx.packages.forEach(p => lines.push(`  - ${p.name}: from £${p.pricePerPerson}pp`))
  }
  return lines.length ? lines.join('\n') : 'No specific pricing found in database for this destination.'
}

// ── UTM link builder ──────────────────────────────────────────────────────────

function buildUtmLinks(landingPage: string, objective: string, destination: string): Record<string, string> {
  const base = landingPage || 'https://www.walztravels.com'
  const campaign = encodeURIComponent(`${objective.slice(0, 20)}_${destination.slice(0, 15)}`.toLowerCase().replace(/\s+/g, '_'))
  const sources = { facebook: 'facebook', instagram: 'instagram', google: 'google', linkedin: 'linkedin', twitter: 'twitter', email: 'email' }
  return Object.fromEntries(
    Object.entries(sources).map(([key, source]) => [
      key,
      `${base}?utm_source=${source}&utm_medium=${key === 'google' ? 'cpc' : key === 'email' ? 'email' : 'social'}&utm_campaign=${campaign}`,
    ])
  )
}

// ── Generation prompt ─────────────────────────────────────────────────────────

function buildPrompt(params: CampaignParams, priceContext: string, brandVoice: string): string {
  return `You are WalzTravels' marketing copywriter. WalzTravels is a UK-based travel agency specialising in flights, visa services, group and church travel, tours, eSIM, and holiday packages.

BRAND VOICE: ${brandVoice || 'Professional, warm, trustworthy. Focused on value and expertise.'}

CAMPAIGN BRIEF:
- Objective: ${params.objective}
- Destination/Offer: ${params.destination}
- Target Audience: ${params.audience}
- Country (audience location): ${params.country}
- Platforms: ${params.platforms.join(', ')}
- Tone: ${params.tone}
- Promotion Details: ${params.promotionDetails}
- Call to Action: ${params.cta}
- Landing Page: ${params.landingPage}

REAL PRICES FROM DATABASE (use only these — never invent prices):
${priceContext}

Generate ALL of the following in one response. Return ONLY valid JSON matching this exact structure. No markdown, no preamble.

{
  "strategy": "2-3 sentence campaign strategy",
  "meta_ads": [
    { "headline": "max 40 chars", "body": "max 125 chars", "cta": "button text" },
    { "headline": "variant 2", "body": "variant 2 body", "cta": "button text" },
    { "headline": "variant 3", "body": "variant 3 body", "cta": "button text" }
  ],
  "instagram_captions": [
    "caption 1 with hashtags (max 2200 chars)",
    "caption 2 alternative angle"
  ],
  "google_ads": {
    "headlines": ["max 30 chars", "max 30 chars", "max 30 chars"],
    "descriptions": ["max 90 chars", "max 90 chars"]
  },
  "linkedin_post": "professional post text (max 700 chars)",
  "x_post": "tweet text max 250 chars including hashtags — MUST be under 250 chars, no exceptions",
  "tiktok_caption": "TikTok caption with a strong hook (max 2200 chars, trend-aware tone, include relevant hashtags)",
  "google_business_post": "Google Business post (max 1500 chars, informational, clear call to action, no hashtags)",
  "email": {
    "subject_lines": ["subject 1", "subject 2", "subject 3"],
    "body": "full email copy in plain text"
  },
  "video_script": "15-30 second short-form video script with scene directions",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"]
}

RULES:
- Never mention "ATOL protected", "IATA certified", "IATA accredited", or "financially protected"
- Never guarantee visa approval
- Never invent prices not listed above
- Never invent statistics, testimonials, or customer names
- All prices must use the currency provided in the database context`
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface CampaignParams {
  objective: string
  destination: string
  audience: string
  country: string
  platforms: string[]
  tone: string
  promotionDetails: string
  cta: string
  landingPage: string
}

export interface GenerationResult {
  content: Record<string, unknown>
  tokensUsed: number
  costUsd: number
  utmLinks: Record<string, string>
}

export async function generateCampaign(
  campaignId: string,
  params: CampaignParams,
  generatedBy: string,
  tokenCap: number,
  brandVoice: string,
): Promise<GenerationResult> {
  // Load real pricing context from DB
  const priceCtx = await loadPriceContext(params.destination)
  const priceContextStr = formatPriceContext(priceCtx)

  const prompt = buildPrompt(params, priceContextStr, brandVoice)

  // Rough token estimate: ~1 token per 4 chars
  const estimatedInputTokens = Math.ceil(prompt.length / 4)
  if (estimatedInputTokens > tokenCap * 2) {
    throw new Error(`Campaign brief is too large (estimated ${estimatedInputTokens} input tokens). Simplify the promotion details.`)
  }

  const anthropic = getAnthropic()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: tokenCap,
    messages: [{ role: 'user', content: prompt }],
  })

  const inputTokens  = response.usage.input_tokens
  const outputTokens = response.usage.output_tokens
  const totalTokens  = inputTokens + outputTokens

  if (response.stop_reason === 'max_tokens') {
    throw new Error(`Campaign generation hit the token cap (${tokenCap} output tokens). Increase the token cap in Settings or simplify the brief.`)
  }

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  // Parse JSON — strip any accidental markdown fences
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  let content: Record<string, unknown>
  try {
    content = JSON.parse(jsonStr)
  } catch {
    throw new Error('Claude returned invalid JSON. The response may have been truncated — try increasing the token cap.')
  }

  // Content filter — check strategy + all text fields
  const allText = JSON.stringify(content)
  const filterResult = filterContent(allText)
  if (!filterResult.passed) {
    const summary = filterResult.violations.map(v => `[${v.rule}] "${v.matched}"`).join(', ')
    throw new Error(`Content filter blocked generation: ${summary}`)
  }

  const utmLinks = buildUtmLinks(params.landingPage, params.objective, params.destination)
  content.utm_links = utmLinks

  const costUsd = estimateCost(inputTokens, outputTokens)

  // Persist result
  await prisma.orbitCampaign.update({
    where: { id: campaignId },
    data: {
      content: content as import('@prisma/client').Prisma.InputJsonValue,
      tokensUsed: totalTokens,
      costUsd: costUsd.toString(),
      generatedAt: new Date(),
      generatedBy,
      status: 'review',
    },
  })

  return { content, tokensUsed: totalTokens, costUsd, utmLinks }
}
