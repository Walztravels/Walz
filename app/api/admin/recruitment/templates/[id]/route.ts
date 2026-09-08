import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'
import { validateTemplateInput } from '@/lib/recruitment/templates'

export const dynamic = 'force-dynamic'

// PATCH — edit a template (name/subject/body/isActive), placeholders validated.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.settings.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const existing = await prisma.recruitmentEmailTemplate.findUnique({
      where: { id: params.id }, select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const parsed = validateTemplateInput(body, true)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    if (Object.keys(parsed.value).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }
    const template = await prisma.recruitmentEmailTemplate.update({
      where: { id: params.id },
      data:  { ...parsed.value, updatedBy: session.email } as never,
    })
    await recruitmentAudit(session, 'Template Updated', `${params.id}: ${Object.keys(parsed.value).join(', ')}`)
    return NextResponse.json({ template })
  } catch (err) {
    console.error('[recruitment template PATCH]', err)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}
