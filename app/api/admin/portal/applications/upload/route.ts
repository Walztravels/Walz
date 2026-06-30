import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'


export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    const appId    = formData.get('applicationId') as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const ext      = file.name.split('.').pop() ?? 'bin'
    const path     = `visa-docs/${appId ?? 'misc'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const buffer   = Buffer.from(await file.arrayBuffer())

    const { error } = await getSupabaseAdmin().storage
      .from('walz-documents')
      .upload(path, buffer, { contentType: file.type, upsert: true })

    if (error) throw error

    const { data: { publicUrl } } = getSupabaseAdmin().storage
      .from('walz-documents')
      .getPublicUrl(path)

    return NextResponse.json({ url: publicUrl, name: file.name })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload failed'
    console.error('[upload]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
