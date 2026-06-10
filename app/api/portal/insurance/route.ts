import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

interface InsuranceOrderRow {
  id:                  string
  battleface_order_id: string
  order_reference:     string | null
  plan_name:           string | null
  status:              string
  premium:             number
  currency:            string
  destination_country: string
  trip_start_date:     string
  trip_end_date:       string
  policy_number:       string | null
  policy_document_url: string | null
  created_at:          string
}

/**
 * GET /api/portal/insurance
 * Returns the current user's insurance policies.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where:  { email: session.user.email },
    select: { id: true },
  })
  if (!user) return NextResponse.json({ policies: [] })

  try {
    const policies = await prisma.$queryRawUnsafe<InsuranceOrderRow[]>(`
      SELECT id, battleface_order_id, order_reference, plan_name,
             status, premium, currency,
             destination_country, trip_start_date, trip_end_date,
             policy_number, policy_document_url, created_at
      FROM insurance_orders
      WHERE client_id = $1
      ORDER BY created_at DESC
    `, user.id)

    return NextResponse.json({ policies })
  } catch {
    // Table may not exist yet — return empty gracefully
    return NextResponse.json({ policies: [] })
  }
}
