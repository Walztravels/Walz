import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

const ALLOWED_BUCKETS = ['visa-documents', 'bank-statements']

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const bucket = (formData.get('bucket') as string | null) ?? 'visa-documents'
  const path = formData.get('path') as string | null

  if (!file) {
    return NextResponse.json({ error: 'Missing file field' }, { status: 400 })
  }
  if (!path) {
    return NextResponse.json({ error: 'Missing path field' }, { status: 400 })
  }
  if (!ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: `Bucket not allowed. Must be one of: ${ALLOWED_BUCKETS.join(', ')}` }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path)

  return NextResponse.json({ url: publicUrl })
}
