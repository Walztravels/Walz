import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ── GET — browse library ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const destination  = searchParams.get('destination') ?? undefined
  const format       = searchParams.get('format') ?? undefined
  const campaignId   = searchParams.get('campaignId') ?? undefined

  const media = await prisma.orbitMedia.findMany({
    where: {
      ...(destination ? { destination: { equals: destination, mode: 'insensitive' as const } } : {}),
      ...(format      ? { format }      : {}),
      ...(campaignId  ? { campaignId }  : {}),
      status: { in: ['draft', 'approved'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({ media })
}

// ── POST — upload a real photo into the library ───────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured', notConfigured: true }, { status: 503 })
  }

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const file        = formData.get('file') as File | null
  const format      = formData.get('format') as string | null
  const destination = formData.get('destination') as string | null
  const campaignId  = formData.get('campaignId') as string | null
  const altText     = formData.get('altText') as string ?? ''

  if (!file || !format) {
    return NextResponse.json({ error: 'file and format are required' }, { status: 400 })
  }

  // Create a media record to get the ID for the storage path
  const placeholder = await prisma.orbitMedia.create({
    data: {
      source: 'uploaded',
      storagePath: '',
      format,
      destination: destination || null,
      campaignId: campaignId || null,
      altText,
      createdBy: session.email,
    },
  })

  try {
    const storagePath = `orbit/${placeholder.id}.jpg`
    const uploadUrl   = `${supabaseUrl}/storage/v1/object/orbit-media/${storagePath}`
    const buffer      = await file.arrayBuffer()

    const upRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': file.type || 'image/jpeg',
        'x-upsert': 'true',
      },
      body: buffer,
    })

    if (!upRes.ok) {
      const body = await upRes.text()
      throw new Error(`Supabase storage upload failed: ${upRes.status} ${body}`)
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/orbit-media/${storagePath}`
    const media = await prisma.orbitMedia.update({
      where: { id: placeholder.id },
      data: { storagePath, publicUrl },
    })

    return NextResponse.json({ media })
  } catch (err) {
    await prisma.orbitMedia.delete({ where: { id: placeholder.id } }).catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
