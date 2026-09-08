import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { retrySave } from '@/lib/orbit/media-library'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST — retry saving an already-generated output into owned storage.
// Never regenerates and never re-charges: it re-ingests the recorded
// provider output URL only.
export async function POST(_req: NextRequest, { params }: { params: { mediaId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const result = await retrySave(params.mediaId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, recoverable: result.recoverable }, { status: result.recoverable ? 502 : 410 })
  }
  return NextResponse.json({ ok: true, publicUrl: result.publicUrl })
}
