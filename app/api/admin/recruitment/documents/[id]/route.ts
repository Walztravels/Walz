import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'
import { RECRUITMENT_BUCKET } from '@/lib/recruitment/applications'

export const dynamic = 'force-dynamic'

// GET — authorized, audited, time-limited download of a private candidate
// document. Raw storage paths are never exposed; the signed URL lives 60s.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const doc = await prisma.candidateDocument.findUnique({
      where:  { id: params.id },
      select: { storagePath: true, filename: true, candidateId: true },
    })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.storage
      .from(RECRUITMENT_BUCKET)
      .createSignedUrl(doc.storagePath, 60)   // 60-second signed URL
    if (error || !data?.signedUrl) {
      console.error('[recruitment doc download] sign failed:', error?.message)
      return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 })
    }

    await recruitmentAudit(session, 'Document Downloaded', `doc ${params.id} (${doc.filename}) · candidate ${doc.candidateId}`)
    return NextResponse.redirect(data.signedUrl)
  } catch (err) {
    console.error('[recruitment doc download]', err)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
