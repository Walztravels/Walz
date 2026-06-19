import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const templates = await prisma.$queryRawUnsafe<
      Array<{ id: string; template_name: string; template_type: string; is_active: boolean; created_at: string }>
    >(`SELECT id, template_name, template_type, is_active, created_at FROM ticket_templates WHERE is_active = true ORDER BY created_at DESC`)
    return NextResponse.json({ templates })
  } catch {
    return NextResponse.json({ templates: [] })
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type, name, html } = await req.json()

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO ticket_templates (template_name, template_type, template_html, is_active, is_default)
       VALUES ($1, $2, $3, true, false)`,
      name || `${type} Ticket`,
      type || 'FLIGHT',
      html || '',
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
