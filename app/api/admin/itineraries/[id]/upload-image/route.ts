import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { prisma } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

const BUCKET = 'itinerary-images'
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const itinerary = await prisma.itinerary.findUnique({ where: { id }, select: { id: true } })
  if (!itinerary) return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP and AVIF images are allowed' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 8 MB limit' }, { status: 400 })
  }

  const ext    = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path   = `${id}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const supabase = getSupabaseAdmin()

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (error) {
    // If the bucket doesn't exist yet, report a clear message
    if (error.message?.includes('Bucket not found') || error.message?.includes('bucket')) {
      return NextResponse.json({
        error: `Storage bucket "${BUCKET}" does not exist. Create it in the Supabase dashboard (Storage → New bucket → "${BUCKET}", public).`,
      }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)

  await prisma.itinerary.update({
    where: { id },
    data:  { coverImage: publicUrl, updatedAt: new Date() },
  })

  return NextResponse.json({ url: publicUrl })
}
