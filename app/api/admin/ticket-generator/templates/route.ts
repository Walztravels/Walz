import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

interface TemplateRow {
  id: string; template_name: string; template_type: string
  template_html: string; is_active: boolean; is_default: boolean
  created_at: string; updated_at: string
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const rows = await prisma.$queryRawUnsafe<TemplateRow[]>(
      `SELECT * FROM ticket_templates ORDER BY template_type, created_at`
    )
    return NextResponse.json({ templates: rows })
  } catch {
    return NextResponse.json({ templates: [] })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, template_html, template_name, is_active } = await req.json().catch(() => ({})) as Record<string, unknown>
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE ticket_templates SET template_html=$1, template_name=$2, is_active=$3, updated_at=now() WHERE id=$4`,
      template_html ?? '', template_name ?? '', is_active ?? true, id
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
