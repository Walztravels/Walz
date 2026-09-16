import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getVisaCaseContext } from '@/lib/intelligence/visa-case-context'

export const dynamic = 'force-dynamic'

/**
 * Shared Visa Case context for the Document Intelligence Centre.
 * GET ?applicationId=… → { context } assembled from real DB fields only.
 * Nothing sensitive is ever logged here.
 */
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const applicationId = new URL(req.url).searchParams.get('applicationId') ?? ''
  if (!applicationId) {
    return NextResponse.json({ error: 'applicationId is required' }, { status: 400 })
  }
  try {
    const context = await getVisaCaseContext(applicationId)
    if (!context) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    return NextResponse.json({ context })
  } catch (e) {
    console.error('[case-context] load failed:', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'Failed to load case context' }, { status: 500 })
  }
}
