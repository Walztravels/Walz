import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const maxDuration = 30

const BUCKET = 'visa-documents'

export async function POST(req: NextRequest) {
  const adminSession = await getAdminSession()
  if (!adminSession) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file)                          return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'PDF files only' },  { status: 400 })
  if (file.size > 50 * 1024 * 1024)  return NextResponse.json({ error: 'File exceeds 50MB' }, { status: 413 })

  // service role client — bypasses RLS entirely
  const supabase    = getSupabaseAdmin()
  const refId       = `standalone-${Date.now()}`
  const storagePath = `standalone/${refId}/bank-statement.pdf`
  const buffer      = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    console.error('[Bank Analyser Upload]', uploadError.message)
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // Signed URL valid 2 hours — enough for analysis + Claude processing
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 2)

  if (signError || !signed?.signedUrl) {
    console.error('[Bank Analyser Upload] Signed URL creation failed:', signError?.message)
    return NextResponse.json({ error: 'File uploaded but could not create download URL. Please try again.' }, { status: 500 })
  }

  const fileUrl = signed.signedUrl

  // Seed initial row so analyze route can upsert cleanly
  await supabase
    .from('bank_statement_analyses')
    .upsert(
      { application_id: refId, admin_file_url: fileUrl, uploaded_by: 'admin' },
      { onConflict: 'application_id' }
    )

  return NextResponse.json({ refId, fileUrl })
}
