import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import {
  buildPrompt,
  generateBackground,
  isReplicateConfigured,
  type FluxFormat,
} from '@/lib/orbit/replicate-adapter'
import { assertContentSafe } from '@/lib/orbit/content-filter'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const anthropic = new Anthropic()

// ── GET — campaign media + library matches + cap status ───────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const format = req.nextUrl.searchParams.get('format') ?? null

  // Media already attached to this campaign
  const media = await prisma.orbitMedia.findMany({
    where: { campaignId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  // Library matches: orbit images by destination+format, plus uploaded design assets from marketing library
  const orbitLibrary = format && campaign.destination
    ? await prisma.orbitMedia.findMany({
        where: {
          destination: { equals: campaign.destination, mode: 'insensitive' },
          format,
          campaignId: null,
          status: { in: ['draft', 'approved'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      })
    : []

  // Also surface recently uploaded design assets from the marketing media library.
  // These use the TAGS taxonomy (visa, flights, tours, destination, team, general, testimonial)
  // rather than destination/format matching — flag in _fromMarketing so ImagesSection
  // calls the from-marketing attach endpoint instead of the OrbitMedia attach endpoint.
  const marketingUploads = await prisma.marketingMedia.findMany({
    where: { uploadedBy: 'Design team' },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })

  const libraryMatches = [
    ...orbitLibrary,
    ...marketingUploads.map(m => ({
      id:           m.id,
      source:       'uploaded',
      publicUrl:    m.url,
      format:       format ?? '1080x1350',
      destination:  null,
      prompt:       null,
      altText:      m.altText ?? m.filename,
      costUsd:      '0',
      status:       'approved',
      createdAt:    m.createdAt,
      _fromMarketing: true,
    })),
  ]

  // Cap
  const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
  const cap = settings?.imageCapPerCampaign ?? 8
  const used = media.length

  // Per-campaign image cost
  const costAgg = await prisma.orbitMedia.aggregate({
    where: { campaignId: params.id },
    _sum: { costUsd: true },
  })
  const imageCostUsd = costAgg._sum.costUsd ?? 0

  return NextResponse.json({
    media,
    mediaOrder: (campaign.mediaOrder as string[]) ?? [],
    libraryMatches,
    cap,
    used,
    capReached: used >= cap,
    imageCostUsd,
    replicateConfigured: isReplicateConfigured(),
  })
}

// ── POST — generate a new image ───────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!isReplicateConfigured()) {
    return NextResponse.json({
      error: 'Replicate is not configured. Add REPLICATE_API_TOKEN and SUPABASE_SERVICE_ROLE_KEY.',
      notConfigured: true,
    }, { status: 503 })
  }

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    format: FluxFormat
    promptHint?: string
  }
  if (!body.format) return NextResponse.json({ error: 'format is required' }, { status: 400 })

  // ── Cap check ────────────────────────────────────────────────────────────────
  const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
  const cap = settings?.imageCapPerCampaign ?? 8
  const used = await prisma.orbitMedia.count({ where: { campaignId: params.id } })

  if (used >= cap) {
    return NextResponse.json({
      error: `Image cap of ${cap} reached for this campaign. Discard existing images to generate more.`,
      capReached: true,
      used,
      cap,
    }, { status: 429 })
  }

  // ── Build prompt (no-text suffix enforced here, not by caller) ───────────────
  const prompt = buildPrompt(
    campaign.destination,
    campaign.objective,
    body.promptHint ?? campaign.promotionDetails,
  )

  // ── Create placeholder record ─────────────────────────────────────────────────
  const placeholder = await prisma.orbitMedia.create({
    data: {
      source: 'generated',
      storagePath: '',  // filled after generation
      format: body.format,
      destination: campaign.destination || null,
      campaignType: campaign.objective || null,
      prompt,
      campaignId: params.id,
      createdBy: session.email,
    },
  })

  try {
    // ── Generate image ────────────────────────────────────────────────────────
    const result = await generateBackground(prompt, body.format, placeholder.id)

    // ── Alt text — one Claude call per generation ─────────────────────────────
    let altText = ''
    try {
      const dest = campaign.destination || 'travel destination'
      const altMsg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: `Write a concise, factual alt text (max 100 chars) for a travel background image of ${dest} ` +
            `used in a ${campaign.objective} campaign. No marketing language. Describe what a viewer would see.`,
        }],
      })
      const raw = altMsg.content[0].type === 'text' ? altMsg.content[0].text.trim() : ''
      // Apply content filter to alt text
      try { assertContentSafe(raw); altText = raw } catch { altText = `Travel scene of ${dest}` }
    } catch { altText = `Travel scene of ${campaign.destination || 'destination'}` }

    // ── Update record ─────────────────────────────────────────────────────────
    const media = await prisma.orbitMedia.update({
      where: { id: placeholder.id },
      data: {
        storagePath: result.storagePath,
        publicUrl: result.publicUrl,
        altText,
        costUsd: result.costUsd,
      },
    })

    return NextResponse.json({ media, prompt })

  } catch (err) {
    // Clean up placeholder on failure
    await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
