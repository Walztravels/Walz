import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const ext    = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path   = `extras/${id}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const supabase = getSupabaseAdmin()
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    console.error('[extras-photo] upload error:', uploadError.message)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path)

  await prisma.flightExtra.update({ where: { id }, data: { photoUrl: publicUrl } })

  return NextResponse.json({ photoUrl: publicUrl })
}
