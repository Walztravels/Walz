import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

interface InsuranceOrderRow {
  id:                  string
  client_id:           string | null
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
  stripe_payment_id:   string | null
  created_at:          string
  updated_at:          string
  client_email:        string | null
  client_name:         string | null
}

/**
 * GET /api/admin/insurance
 * Admin only. Returns all insurance orders with client info.
 * Query params:
 *   status — filter by status (pending|approved|cancelled|all)
 *   search — search by client email or policy reference
 *   page   — pagination (default 1)
 *   limit  — records per page (default 50)
 */
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status')  ?? 'all'
  const search  = searchParams.get('search')  ?? ''
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit   = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
  const offset  = (page - 1) * limit

  try {
    // Build WHERE clauses
    const whereClauses: string[] = []
    const params: unknown[]      = []
    let   pIdx = 1

    if (status !== 'all') {
      whereClauses.push(`io.status = $${pIdx++}`)
      params.push(status)
    }
    if (search) {
      whereClauses.push(`(u.email ILIKE $${pIdx} OR io.order_reference ILIKE $${pIdx} OR io.policy_number ILIKE $${pIdx} OR io.battleface_order_id ILIKE $${pIdx})`)
      params.push(`%${search}%`)
      pIdx++
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const rows = await prisma.$queryRawUnsafe<InsuranceOrderRow[]>(`
      SELECT
        io.id, io.client_id, io.battleface_order_id, io.order_reference,
        io.plan_name, io.status, io.premium, io.currency,
        io.destination_country, io.trip_start_date::text, io.trip_end_date::text,
        io.policy_number, io.policy_document_url, io.stripe_payment_id,
        io.created_at::text, io.updated_at::text,
        u.email AS client_email,
        u.name  AS client_name
      FROM insurance_orders io
      LEFT JOIN users u ON u.id = io.client_id
      ${whereSQL}
      ORDER BY io.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, ...params)

    // Total count for pagination
    const countRows = await prisma.$queryRawUnsafe<Array<{ total: string }>>(`
      SELECT COUNT(*)::text AS total
      FROM insurance_orders io
      LEFT JOIN users u ON u.id = io.client_id
      ${whereSQL}
    `, ...params)
    const total = parseInt(countRows[0]?.total ?? '0', 10)

    return NextResponse.json({
      orders: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('[GET /api/admin/insurance]', err)
    return NextResponse.json({ orders: [], pagination: { page: 1, limit, total: 0, pages: 0 } })
  }
}
