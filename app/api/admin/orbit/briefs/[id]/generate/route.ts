import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import { filterContent } from '@/lib/orbit/content-filter'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const client = new Anthropic()

const CONTENT_TYPE_LABELS: Record<string, string> = {
  destination_guide: 'Destination Guide',
  itinerary:         'Itinerary',
  flight:            'Flight Content',
  hotel:             'Hotel Content',
  visa:              'Visa & Entry Guide',
  travel_tips:       'Travel Tips',
  comparison:        'Comparison Page',
  faq:               'FAQ Page',
  promotional:       'Promotional Landing Page',
  refresh:           'Content Refresh',
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const brief = await prisma.orbitContentBrief.findUnique({
    where: { id: params.id },
    include: { keyword: true },
  })
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
  const brandVoice  = settings?.brandVoice ?? ''
  const siteUrl     = settings?.siteUrl    ?? 'https://www.walztravels.com'
  const brandName   = settings?.brandName  ?? 'WalzTravels'

  const body = await req.json().catch(() => ({})) as { action?: string }
  const action = body.action ?? 'full_brief'

  if (action === 'draft') {
    return generateDraft(params.id, brief, session.email, brandVoice, siteUrl, brandName)
  }

  // Generate or update the brief fields (outline, FAQs, internal links, etc.)
  return generateBriefContent(params.id, brief, session.email, brandVoice)
}

async function generateBriefContent(
  briefId: string,
  brief: {
    primaryKeyword: string
    supportingKeywords: string[]
    contentType: string
    intent: string
    title: string
    suggestedUrl?: string | null
  },
  generatedBy: string,
  brandVoice: string,
) {
  const prompt = `You are an SEO content strategist for a UK-based travel agency (WalzTravels) specialising in flights, visa services, and group travel for the African and UK diaspora market.

Generate a complete content brief as JSON for the following article:

Primary keyword: "${brief.primaryKeyword}"
Supporting keywords: ${brief.supportingKeywords.join(', ') || 'none'}
Content type: ${CONTENT_TYPE_LABELS[brief.contentType] ?? brief.contentType}
Search intent: ${brief.intent}
Suggested title: "${brief.title}"
${brief.suggestedUrl ? `Suggested URL: ${brief.suggestedUrl}` : ''}
Brand voice: ${brandVoice || 'Professional, warm, trustworthy.'}

Return ONLY valid JSON (no markdown, no preamble) with this exact structure:
{
  "outline": [
    {"heading": "H2 heading text", "type": "h2", "notes": "what to cover in this section"},
    {"heading": "H3 heading text", "type": "h3", "notes": "specific points"}
  ],
  "faqs": [
    {"q": "question text", "a": "concise answer (2-3 sentences)"}
  ],
  "internalLinks": [
    {"text": "anchor text", "url": "/suggested/path", "reason": "why this internal link adds value"}
  ],
  "externalSources": [
    {"purpose": "what this source verifies", "verifyRequired": true, "notes": "source type e.g. official embassy website"}
  ],
  "structuredData": "Article with FAQ schema — describe what type to add and why",
  "metaDescription": "compelling meta description (150-160 chars, includes primary keyword)"
}

Rules:
- Outline: 5-8 H2 sections, each with 2-4 H3 subsections where appropriate
- FAQs: 4-6 questions that real searchers ask
- Internal links: 3-6 links to plausible pages on the WalzTravels site
- External sources: flag any claim about visa requirements, prices, travel times, or regulations as verifyRequired:true
- NEVER mention ATOL, IATA accreditation, or guarantee any visa outcome
- NEVER invent prices, statistics, or testimonials`

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''

  let parsed: Record<string, unknown>
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? text)
  } catch {
    return NextResponse.json({ error: 'AI returned invalid JSON', raw: text.slice(0, 500) }, { status: 502 })
  }

  // Content filter on meta description
  const metaDesc = (parsed.metaDescription as string) ?? ''
  const filterResult = filterContent(metaDesc)
  if (!filterResult.passed) {
    return NextResponse.json({ error: `Content filter blocked: ${filterResult.violations.map(v => v.rule).join(", ")}` }, { status: 422 })
  }

  const updated = await prisma.orbitContentBrief.update({
    where: { id: briefId },
    data: {
      outline:         (parsed.outline         ?? []) as object[],
      faqs:            (parsed.faqs            ?? []) as object[],
      internalLinks:   (parsed.internalLinks   ?? []) as object[],
      externalSources: (parsed.externalSources ?? []) as object[],
      structuredData:  (parsed.structuredData as string) ?? null,
      metaDescription: metaDesc || null,
      generatedBy,
    },
  })

  return NextResponse.json({ brief: updated, tokensUsed: msg.usage.output_tokens })
}

async function generateDraft(
  briefId: string,
  brief: {
    primaryKeyword: string
    supportingKeywords: string[]
    contentType: string
    title: string
    metaDescription?: string | null
    outline: unknown
    faqs: unknown
    internalLinks: unknown
  },
  createdBy: string,
  brandVoice: string,
  siteUrl: string,
  brandName: string,
) {
  const outline = JSON.stringify(brief.outline, null, 2)
  const links   = JSON.stringify(brief.internalLinks, null, 2)

  const prompt = `You are a travel content writer for ${brandName} (${siteUrl}), a UK-based travel agency specialising in flights, visa services, and group travel for the African diaspora market.

Write a full blog article following this brief:

Title: "${brief.title}"
Primary keyword: "${brief.primaryKeyword}"
Supporting keywords: ${brief.supportingKeywords.join(', ') || 'none'}
Content type: ${CONTENT_TYPE_LABELS[brief.contentType] ?? brief.contentType}
Brand voice: ${brandVoice || 'Professional, warm, trustworthy.'}

Outline to follow:
${outline}

Internal links to include naturally:
${links}

Output the article as JSON:
{
  "title": "final article title",
  "content": "full HTML article content (use proper h2/h3/p/ul/li tags)",
  "excerpt": "2-3 sentence summary for blog list page",
  "tags": ["tag1", "tag2"],
  "flaggedClaims": [
    {"text": "exact quoted text from article", "reason": "why this needs verification", "sourceDate": null}
  ]
}

Writing rules:
- Write 800-1200 words of genuine, useful content
- Include the primary keyword naturally in first 100 words, H1, and 2-3 more times
- Include supporting keywords naturally throughout
- Use proper HTML: <h2>, <h3>, <p>, <ul>/<li>, <strong> where appropriate
- Flag EVERY claim about visa requirements, prices, processing times, or travel regulations in flaggedClaims
- NEVER mention ATOL, IATA accreditation, financial protection guarantees, or specific visa approval rates
- NEVER invent prices, statistics, flight times, or real testimonials
- Always recommend the reader consult official sources for visa/immigration information`

  const msg = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 4000,
    messages:   [{ role: 'user', content: prompt }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''

  let parsed: { title: string; content: string; excerpt: string; tags: string[]; flaggedClaims: unknown[] }
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? text)
  } catch {
    return NextResponse.json({ error: 'AI returned invalid JSON', raw: text.slice(0, 500) }, { status: 502 })
  }

  // Content filter
  const filterResult = filterContent(parsed.content)
  if (!filterResult.passed) {
    return NextResponse.json({ error: `Content filter blocked: ${filterResult.violations.map(v => v.rule).join(", ")}` }, { status: 422 })
  }

  // Get next version number
  const existing = await prisma.orbitContentDraft.findMany({
    where: { briefId },
    orderBy: { version: 'desc' },
    take: 1,
  })
  const nextVersion = (existing[0]?.version ?? 0) + 1

  const draft = await prisma.orbitContentDraft.create({
    data: {
      briefId,
      version:        nextVersion,
      title:          parsed.title || brief.title,
      content:        parsed.content,
      excerpt:        parsed.excerpt || '',
      metaDescription: brief.metaDescription || '',
      focusKeyword:   brief.primaryKeyword,
      tags:           parsed.tags ?? [],
      flaggedClaims:  (parsed.flaggedClaims ?? []) as object[],
      status:         'draft',
      createdBy,
    },
  })

  // Update brief status to in_progress if still draft
  await prisma.orbitContentBrief.update({
    where: { id: briefId },
    data:  { status: 'in_progress' },
  })

  return NextResponse.json({ draft, tokensUsed: msg.usage.output_tokens })
}
