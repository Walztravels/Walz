import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'

const BUCKET = 'portal-documents'

export const dynamic = 'force-dynamic'

// GET /api/upload/[token]/presign?docName=X&fileName=Y&mimeType=Z
// Returns a Supabase presigned upload URL so the client can upload directly
// without the file passing through Vercel's 4.5 MB serverless limit.
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const request = await prisma.documentRequest.findUnique({
    where: { token: params.token },
  })

  if (!request) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  }
  if (new Date() > request.expiresAt) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  }

  const { searchParams } = new URL(req.url)
  const docName  = searchParams.get('docName')
  const fileName = searchParams.get('fileName')
  const mimeType = searchParams.get('mimeType') ?? 'application/octet-stream'

  if (!docName || !fileName) {
    return NextResponse.json({ error: 'docName and fileName required' }, { status: 400 })
  }

  const ext     = fileName.split('.').pop() ?? 'bin'
  const fileKey = `requests/${request.id}/${Date.now()}-${docName.replace(/\s+/g, '-')}.${ext}`

  const supabase = getSupabaseAdmin()

  // Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.find(b => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false })
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(fileKey)

  if (error || !data) {
    console.error('[presign] createSignedUploadUrl error:', error)
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token:     data.token,
    fileKey,
    mimeType,
  })
}
