import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

type RouteContext = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const pkg = await prisma.tourListing.findUnique({ where: { id: params.id } })
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(pkg)
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const pkg = await prisma.tourListing.update({
    where: { id: params.id },
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

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const pkg = await prisma.tourListing.findUnique({ where: { id: params.id }, select: { slug: true } })
  await prisma.tourListing.delete({ where: { id: params.id } })
  revalidatePath('/packages')
  if (pkg?.slug) revalidatePath(`/packages/${pkg.slug}`)
  revalidatePath('/')
  return NextResponse.json({ success: true })
}
