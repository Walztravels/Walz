import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const supplier = await prisma.supplier.update({
    where: { id: params.id },
    data: {
      ...(body.name    !== undefined && { name:    String(body.name)    }),
      ...(body.type    !== undefined && { type:    String(body.type)    }),
      ...(body.contact !== undefined && { contact: body.contact ? String(body.contact) : null }),
      ...(body.phone   !== undefined && { phone:   body.phone   ? String(body.phone)   : null }),
      ...(body.website !== undefined && { website: body.website ? String(body.website) : null }),
      ...(body.status  !== undefined && { status:  String(body.status)  }),
      ...(body.notes   !== undefined && { notes:   body.notes   ? String(body.notes)   : null }),
    },
  })
  return NextResponse.json({ supplier })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.supplier.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
