import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

interface TicketRow {
  id: string; ticket_reference: string; client_name: string | null
  client_email: string | null; ticket_type: string; ticket_data: unknown
  pdf_url: string | null; sent_at: string | null; created_at: string
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ tickets: [] })

  try {
    const tickets = await prisma.$queryRawUnsafe<TicketRow[]>(`
      SELECT id, ticket_reference, client_name, client_email, ticket_type,
             ticket_data, pdf_url, sent_at::text, created_at::text
      FROM generated_tickets
      WHERE client_email = $1 AND sent_to_client = true
      ORDER BY created_at DESC
    `, session.user.email)
    return NextResponse.json({ tickets })
  } catch {
    return NextResponse.json({ tickets: [] })
  }
}
