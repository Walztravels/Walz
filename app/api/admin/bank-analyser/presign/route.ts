import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

const BUCKET = 'visa-documents'

// Returns a signed upload URL so the browser can upload directly to Supabase
// Storage — the file never passes through Vercel, bypassing the 4.5MB payload limit.
export async function POST(req: NextRequest) {
  const adminSession = await getAdminSession()
  if (!adminSession) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const fileSize: number = body.fileSize ?? 0

  if (fileSize > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 413 })
  }

  const supabase    = getSupabaseAdmin()
  const refId       = `standalone-${Date.now()}`
  const storagePath = `standalone/${refId}/bank-statement.pdf`

  // Signed URL the browser will PUT the file to directly
  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)

  if (uploadErr || !uploadData?.signedUrl) {
    console.error('[Presign] createSignedUploadUrl failed:', uploadErr?.message)
    return NextResponse.json({ error: 'Could not create upload URL. Please try again.' }, { status: 500 })
  }

  // Pre-generate download URL (used by the analyze route after upload completes)
  const { data: dlData, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 2) // 2 hours

  if (dlErr || !dlData?.signedUrl) {
    console.error('[Presign] createSignedUrl failed:', dlErr?.message)
    return NextResponse.json({ error: 'Could not create download URL. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    refId,
    uploadUrl: uploadData.signedUrl,
    fileUrl:   dlData.signedUrl,
  })
}
