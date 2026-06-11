import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

interface TicketRow {
  id: string; ticket_reference: string; client_name: string | null
  client_email: string | null; ticket_type: string; pdf_url: string | null
  sent_to_client: boolean; sent_at: string | null
  created_by: string | null; created_at: string
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
  const params: unknown[]      = []
  let   idx = 1

  if (type !== 'all') { whereClauses.push(`ticket_type = $${idx++}`); params.push(type) }
  if (search) {
    whereClauses.push(`(client_email ILIKE $${idx} OR client_name ILIKE $${idx} OR ticket_reference ILIKE $${idx})`)
    params.push(`%${search}%`); idx++
  }
  const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

  try {
    const rows = await prisma.$queryRawUnsafe<TicketRow[]>(`
      SELECT id, ticket_reference, client_name, client_email, ticket_type,
             pdf_url, sent_to_client, sent_at::text, created_by, created_at::text
      FROM generated_tickets ${where}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, ...params)

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: string }>>(`
      SELECT COUNT(*)::text AS total FROM generated_tickets ${where}
    `, ...params)
    const total = parseInt(countRows[0]?.total ?? '0', 10)

    return NextResponse.json({ tickets: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
  } catch {
    return NextResponse.json({ tickets: [], pagination: { page: 1, limit, total: 0, pages: 0 } })
  }
}
