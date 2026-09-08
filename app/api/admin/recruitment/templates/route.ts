import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'
import { validateTemplateInput, TEMPLATE_VARS } from '@/lib/recruitment/templates'

export const dynamic = 'force-dynamic'

// GET — recruitment email templates (active and inactive, for management).
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const templates = await prisma.recruitmentEmailTemplate.findMany({ orderBy: { name: 'asc' } })
    return NextResponse.json({ templates, allowedVars: TEMPLATE_VARS })
  } catch (err) {
    console.error('[recruitment templates GET]', err)
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  }
}

// POST — create a template (management; placeholders validated).
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.settings.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const parsed = validateTemplateInput(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const key = `custom_${Date.now().toString(36)}`
    const template = await prisma.recruitmentEmailTemplate.create({
      data: { key, ...parsed.value, updatedBy: session.email } as never,
    })
    await recruitmentAudit(session, 'Template Created', `${template.id}: ${parsed.value.name}`)
    return NextResponse.json({ template })
  } catch (err) {
    console.error('[recruitment templates POST]', err)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}
