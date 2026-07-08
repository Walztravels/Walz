import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET = 'portal-documents'
const SIGNED_TTL = 60 * 60 * 24 // 24-hour signed URL

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const applicationId = searchParams.get('applicationId')
  const userId        = searchParams.get('userId')

  const documents = await prisma.portalDocument.findMany({
    where: applicationId ? { applicationId }
         : userId        ? { userId }
         : undefined,
    orderBy: { uploadedAt: 'desc' },
    take:    200,
    include: {
      user:        { select: { name: true, email: true } },
      application: { select: { refNumber: true, title: true } },
    },
  })

  // Refresh signed URLs from fileKey so they're never expired when admin views them
  const supabase = getSupabaseAdmin()
  const withFreshUrls = await Promise.all(
    documents.map(async doc => {
      if (!doc.fileKey) return doc
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(doc.fileKey, SIGNED_TTL)
      return { ...doc, fileUrl: data?.signedUrl ?? doc.fileUrl }
    })
  )

  return NextResponse.json({ documents: withFreshUrls })
}
