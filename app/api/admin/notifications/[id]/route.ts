import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

export async function PATCH(req: Request, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Ensure the notification belongs to the requesting staff member
  const notif = await prisma.staffNotification.findUnique({ where: { id: params.id } })
  if (!notif || notif.staffId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.staffNotification.update({
    where: { id: params.id },
    data: {
      ...(body.read     !== undefined && { read:     body.read }),
      ...(body.archived !== undefined && { archived: body.archived }),
      ...(body.important !== undefined && { important: body.important }),
    },
  })

  return NextResponse.json({ notification: updated })
}
