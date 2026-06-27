import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

interface TicketRow {
  id: string
  ticket_reference: string
  client_name: string | null
  client_email: string | null
  ticket_type: string
  ticket_data: string | null
  pdf_url: string | null
  sent_to_client: boolean
  sent_at: string | null
  created_by: string | null
  generated_by_name: string | null
  status: string
  download_count: number
  created_at: string
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type   = searchParams.get('type')   ?? 'all'
  const search = searchParams.get('search') ?? ''
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit  = 50
  const offset = (page - 1) * limit

  const whereClauses: string[] = []
  const params: unknown[] = []
  let idx = 1

  if (type !== 'all') { whereClauses.push(`ticket_type = $${idx++}`); params.push(type) }
  if (search) {
    whereClauses.push(`(client_name ILIKE $${idx} OR client_email ILIKE $${idx} OR ticket_reference ILIKE $${idx})`)
    params.push(`%${search}%`)
    idx++
  }
  const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

  try {
    const rows = await prisma.$queryRawUnsafe<TicketRow[]>(`
      SELECT
        id, ticket_reference, client_name, client_email, ticket_type,
        ticket_data::text, pdf_url, sent_to_client, sent_at::text,
        created_by, created_at::text,
        CASE WHEN sent_to_client THEN 'sent' ELSE 'generated' END AS status,
        0 AS download_count,
        created_by AS generated_by_name
      FROM generated_tickets ${where}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, ...params)

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: string }>>(`
      SELECT COUNT(*)::text AS total FROM generated_tickets ${where}
    `, ...params)
    const total = parseInt(countRows[0]?.total ?? '0', 10)

    const statsRows = await prisma.$queryRawUnsafe<Array<{ ticket_type: string; cnt: string }>>(`
      SELECT ticket_type, COUNT(*)::text AS cnt FROM generated_tickets GROUP BY ticket_type
    `)
    const stats: Record<string, number> = {}
    statsRows.forEach(r => { stats[r.ticket_type] = parseInt(r.cnt, 10) })

    return NextResponse.json({ tickets: rows, total, page, pages: Math.ceil(total / limit), stats })
  } catch {
    return NextResponse.json({ tickets: [], total: 0, page: 1, pages: 0, stats: {} })
  }
}
