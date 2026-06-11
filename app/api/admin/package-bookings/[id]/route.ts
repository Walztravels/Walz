import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id   = params.id
    const body = await request.json() as { status?: string; payment_status?: string }

    const { status, payment_status } = body

    if (!status && !payment_status) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    const updates: string[] = []
    const values: unknown[]  = []
    let idx = 1

    if (status)         { updates.push(`status = $${idx++}`);         values.push(status)         }
    if (payment_status) { updates.push(`payment_status = $${idx++}`); values.push(payment_status) }
    updates.push('updated_at = NOW()')
    values.push(id)

    await prisma.$executeRawUnsafe(
      `UPDATE package_bookings SET ${updates.join(', ')} WHERE id = $${idx}`,
      ...values
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/admin/package-bookings/[id]]', error)
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
  }
}
