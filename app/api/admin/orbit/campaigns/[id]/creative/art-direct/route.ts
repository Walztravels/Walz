/**
 * Orbit Creative Studio — Art Director API.
 *
 * POST /api/admin/orbit/campaigns/[id]/creative/art-direct
 *
 * Converts a short campaign description into a structured visual creative brief.
 * Powered by Claude Haiku via the Art Director module.
 *
 * CRITICAL INVARIANT:
 *   The Art Director NEVER generates commercial values.
 *   It returns ONLY visual creative direction (mood, subject, environment, lighting).
 *   Prices, routes, fees, legal terms, salaries are NEVER in the response.
 *
 * Response:
 *   templateKey       — recommended template
 *   visualMood        — mood descriptor
 *   subject           — what to photograph
 *   environment       — scene/location description
 *   lighting          — lighting direction
 *   composition       — composition technique
 *   decorativeElements — visual extras
 *   reasoning         — why this template/direction was chosen
 *
 * RBAC: super_admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { runArtDirector } from '@/lib/orbit/art-director'
import type { CampaignType } from '@/lib/orbit/templates/schema'

export const dynamic    = 'force-dynamic'
export const maxDuration = 30

const COMMERCIAL_BLOCKLIST = [
  /\bpric(e|ing|ed)\b/i,
  /\b(£|\$|€|₦|ngn|gbp|usd|eur)\b/i,
  /\bfee(s)?\b/i,
  /\bsalar(y|ies)\b/i,
  /\bpermit\s+(cost|fee|price)\b/i,
  /\bvisa\s+(cost|fee|price)\b/i,
  /\blegal\s+guarantee\b/i,
]

function containsCommercialValue(text: string): boolean {
  return COMMERCIAL_BLOCKLIST.some(r => r.test(text))
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session)                     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },   { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    campaignDescription?: string
    campaignType?:        CampaignType
    preferredTemplate?:   string
    brandPreset?:         string
  }

  const { campaignDescription, campaignType, preferredTemplate, brandPreset } = body

  if (!campaignDescription?.trim()) {
    return NextResponse.json({ error: 'campaignDescription is required' }, { status: 400 })
  }

  // Guard: refuse if description contains commercial values
  if (containsCommercialValue(campaignDescription)) {
    return NextResponse.json({
      error: 'Campaign description must not contain commercial values (prices, fees, salaries). Provide only the visual brief.',
    }, { status: 422 })
  }

  try {
    const result = await runArtDirector({
      campaignDescription,
      campaignType:      campaignType ?? 'general_promotion',
      preferredTemplate: preferredTemplate ?? undefined,
      brandPreset:       brandPreset ?? undefined,
    })

    // Safety check: ensure no commercial values slipped through Art Director response
    const briefStr = JSON.stringify(result.brief)
    if (containsCommercialValue(briefStr)) {
      console.warn('[ArtDirector] Commercial value detected in brief — stripping field', params.id)
      // Return a safe fallback rather than leaking
      return NextResponse.json({
        templateKey:       result.template.key,
        visualMood:        result.brief.visualMood,
        subject:           '',
        environment:       '',
        lighting:          result.brief.lighting,
        composition:       result.brief.composition,
        decorativeElements: [],
        reasoning:         'Art direction generated with visual focus. Please provide your own commercial details.',
      })
    }

    return NextResponse.json({
      templateKey:        result.brief.templateKey,
      visualMood:         result.brief.visualMood,
      subject:            result.brief.subject,
      environment:        result.brief.environment,
      lighting:           result.brief.lighting,
      composition:        result.brief.composition,
      decorativeElements: result.brief.decorativeElements,
      reasoning:          result.reasoning,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ArtDirector] Error for campaign ${params.id}:`, msg)
    return NextResponse.json({
      error: 'Art Director service unavailable. Please try again.',
    }, { status: 503 })
  }
}
