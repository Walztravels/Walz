/**
 * Orbit Creative Studio — provider health diagnostic endpoint.
 *
 * GET /api/admin/orbit/creative/health
 *   Returns safe provider status for image and video generation.
 *   SUPER_ADMIN only.
 *
 * This endpoint NEVER returns:
 *   - OPENAI_API_KEY
 *   - FALAI_API_KEY
 *   - Authorization headers
 *   - Any raw provider secret
 *
 * It DOES NOT generate any media or consume generation credits.
 * It performs configuration introspection only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getProviderHealth } from '@/lib/orbit/provider-health'
import {
  isOpenAIImageEnabled,
  getOpenAIImageModel,
  testOpenAIConnectivity,
} from '@/lib/orbit/openai-image-adapter'

export const dynamic   = 'force-dynamic'
export const maxDuration = 15

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session)                       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const report = getProviderHealth()

  // Deep OpenAI connectivity check — only when explicitly requested (?live=true)
  // Standard health calls do NOT consume generation credits or make API requests.
  const live = req.nextUrl.searchParams.get('live') === 'true'

  const featureEnabled = process.env.ORBIT_AI_IMAGE_ENABLED === 'true'
  const apiKeyPresent  = !!process.env.OPENAI_API_KEY
  const model          = getOpenAIImageModel()

  let openaiHealth: {
    featureEnabled: boolean
    apiKeyPresent:  boolean
    model:          string
    sdkConfigured:  boolean
    live?: { reachable: boolean; accessible: boolean; errorCode?: string; errorType?: string }
  } = {
    featureEnabled,
    apiKeyPresent,
    model,
    sdkConfigured: isOpenAIImageEnabled(),
  }

  if (live && isOpenAIImageEnabled()) {
    const connectivity = await testOpenAIConnectivity()
    openaiHealth = { ...openaiHealth, live: connectivity }
  }

  return NextResponse.json({ ...report, openai: openaiHealth })
}
