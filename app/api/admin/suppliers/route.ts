import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const suppliers = await prisma.supplier.findMany({ orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ suppliers })
  } catch (err) {
    console.error('[suppliers GET]', err)
    return NextResponse.json({ error: 'Failed to load suppliers' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    seed?: Array<{ name: string; type: string; contact?: string; status?: string; notes?: string }>
    name?: string; type?: string; contact?: string; phone?: string
    website?: string; status?: string; notes?: string
  }

  try {
    // Bulk seed
    if (body.seed) {
      await prisma.supplier.createMany({
        data: body.seed.map(s => ({
          name:    s.name,
          type:    s.type,
          contact: s.contact ?? null,
          status:  s.status ?? 'active',
          notes:   s.notes ?? null,
        })),
        skipDuplicates: true,
      })
      const suppliers = await prisma.supplier.findMany({ orderBy: { createdAt: 'asc' } })
      return NextResponse.json({ suppliers })
    }

    if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const supplier = await prisma.supplier.create({
      data: {
        name:    body.name,
        type:    body.type ?? '',
        contact: body.contact ?? null,
        phone:   body.phone   ?? null,
        website: body.website ?? null,
        status:  body.status  ?? 'active',
        notes:   body.notes   ?? null,
      },
    })
    return NextResponse.json({ supplier }, { status: 201 })
  } catch (err) {
    console.error('[suppliers POST]', err)
    return NextResponse.json({ error: 'Failed to save supplier' }, { status: 500 })
  }
}
