import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { cabin: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cabin = params.cabin.toUpperCase()
  if (!['ECONOMY', 'BUSINESS', 'FIRST'].includes(cabin)) {
    return NextResponse.json({ error: 'Invalid cabin class' }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const ext    = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path   = `cabin-profiles/${cabin.toLowerCase()}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const supabase = getSupabaseAdmin()
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    console.error('[cabin-photo] upload error:', uploadError.message)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path)

  await prisma.cabinProfile.upsert({
    where:  { cabinClass: cabin },
    update: { imageUrl: publicUrl },
    create: { cabinClass: cabin, imageUrl: publicUrl },
  })

  return NextResponse.json({ imageUrl: publicUrl })
}
