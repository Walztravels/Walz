import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { getSupabaseAdmin } from '@/lib/supabase'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const BUCKET = 'proposal-assets'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

// POST /api/admin/quote-media/upload
// Body: multipart/form-data with fields: file, quoteId, flightOptionId?, hotelOptionId?,
//       caption?, altText?, sortOrder?, isHero?, clientVisible?, mediaType?
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const quoteId = formData.get('quoteId') as string | null

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (!quoteId) return NextResponse.json({ error: 'quoteId is required' }, { status: 400 })

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 })
  }

  // Verify the quote exists and staff can access it
  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { id: true } })
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const storagePath = `quotes/${quoteId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const supabase = getSupabaseAdmin()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

  const media = await prisma.quoteMedia.create({
    data: {
      quoteId,
      flightOptionId:  (formData.get('flightOptionId') as string | null) ?? null,
      hotelOptionId:   (formData.get('hotelOptionId') as string | null) ?? null,
      url:             publicUrl,
      storagePath,
      filename:        file.name,
      mimeType:        file.type,
      sizeBytes:       file.size,
      caption:         (formData.get('caption') as string | null) ?? null,
      altText:         (formData.get('altText') as string | null) ?? null,
      sortOrder:       parseInt((formData.get('sortOrder') as string | null) ?? '0', 10),
      isHero:          formData.get('isHero') === 'true',
      clientVisible:   formData.get('clientVisible') !== 'false',
      mediaType:       (formData.get('mediaType') as string | null) ?? 'image',
    },
  })

  return NextResponse.json({ media: { id: media.id, url: media.url, storagePath, sizeBytes: media.sizeBytes } })
}
