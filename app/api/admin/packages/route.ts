import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const packages = await prisma.tourListing.findMany({
    where: { type: 'package' },
    orderBy: { order: 'asc' },
  })
  return NextResponse.json(packages)
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body?.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const slug =
    (body.slug as string) ||
    (body.name as string).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const pkg = await prisma.tourListing.create({
    data: {
      name:        String(body.name),
      slug,
      description: String(body.description ?? ''),
      highlights:  String(body.highlights ?? '[]'),
      price:       Number(body.price ?? 0),
      currency:    String(body.currency ?? 'GBP'),
      duration:    String(body.duration ?? ''),
      location:    String(body.location ?? ''),
      imageUrl:    body.imageUrl ? String(body.imageUrl) : null,
      photos:      Array.isArray(body.photos) ? (body.photos as string[]) : [],
      active:      body.active !== undefined ? Boolean(body.active) : true,
      order:       Number(body.order ?? 0),
      type:        'package',
    },
  })

  revalidatePath('/packages')
  revalidatePath(`/packages/${pkg.slug}`)
  revalidatePath('/')
  return NextResponse.json(pkg, { status: 201 })
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })
  const id = body.id as string | undefined
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const pkg = await prisma.tourListing.update({
    where: { id },
    data: {
      ...(body.name        !== undefined && { name:        String(body.name) }),
      ...(body.slug        !== undefined && { slug:        String(body.slug) }),
      ...(body.description !== undefined && { description: String(body.description) }),
      ...(body.highlights  !== undefined && { highlights:  String(body.highlights) }),
      ...(body.price       !== undefined && { price:       Number(body.price) }),
      ...(body.currency    !== undefined && { currency:    String(body.currency) }),
      ...(body.duration    !== undefined && { duration:    String(body.duration) }),
      ...(body.location    !== undefined && { location:    String(body.location) }),
      ...(body.imageUrl    !== undefined && { imageUrl:    body.imageUrl ? String(body.imageUrl) : null }),
      ...(body.photos      !== undefined && { photos:      Array.isArray(body.photos) ? (body.photos as string[]) : [] }),
      ...(body.active      !== undefined && { active:      Boolean(body.active) }),
      ...(body.order       !== undefined && { order:       Number(body.order) }),
    },
  })

  revalidatePath('/packages')
  revalidatePath(`/packages/${pkg.slug}`)
  revalidatePath('/')
  return NextResponse.json(pkg)
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await req.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.tourListing.delete({ where: { id } })
  revalidatePath('/packages')
  revalidatePath('/')
  return NextResponse.json({ success: true })
}
