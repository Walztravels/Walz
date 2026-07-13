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

  if (session.role !== 'super_admin' && session.staffRole !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin access required to edit visa prices' }, { status: 403 })
  }

  const data   = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = {}

  if (data.country         !== undefined) update.country        = data.country
  if (data.flag            !== undefined) update.flag           = data.flag
  if (data.visaType        !== undefined) update.visaType       = data.visaType
  if (data.walzFee         !== undefined) update.fee            = parseFloat(data.walzFee)
  if (data.fee             !== undefined) update.fee            = parseFloat(data.fee)
  if (data.walzFeeCurrency !== undefined) update.currency       = data.walzFeeCurrency
  if (data.currency        !== undefined) update.currency       = data.currency
  if (data.processingTime  !== undefined) update.processingTime = data.processingTime
  if (data.active          !== undefined) update.active         = data.active

  // Express fee — allow explicit null to clear it
  if ('expressFeeUsd' in data) {
    const v = data.expressFeeUsd
    update.expressFeeUsd = (v === null || v === '') ? null : parseFloat(v)
  }

  const service = await prisma.visaService.update({
    where: { id: params.id },
    data:  update,
  })
  return NextResponse.json({ service })
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.role !== 'super_admin' && session.staffRole !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin access required to delete visa services' }, { status: 403 })
  }

  await prisma.visaService.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
