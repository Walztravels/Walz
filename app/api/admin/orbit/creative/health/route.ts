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

export const dynamic   = 'force-dynamic'
export const maxDuration = 10

export async function GET(_req: NextRequest) {
  const session = await getAdminSession()
  if (!session)                       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const report = getProviderHealth()

  return NextResponse.json(report)
}
