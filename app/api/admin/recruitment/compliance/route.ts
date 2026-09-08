import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasRecruitmentPermission } from '@/lib/recruitment/core'
import { retentionReport, anonymizeCandidate } from '@/lib/recruitment/compliance'

export const dynamic = 'force-dynamic'

// GET — the retention report: candidates whose closed applications have
// passed the retention window. Report only; nothing is deleted here or
// on any schedule.
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.settings.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const report = await retentionReport()
    return NextResponse.json(report)
  } catch (err) {
    console.error('[recruitment compliance GET]', err)
    return NextResponse.json({ error: 'Failed to build retention report' }, { status: 500 })
  }
}

// POST — erase one candidate's personal data. Explicit, management-role
// human action, audited; refuses talent-pool members until removed there.
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.settings.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    if (body.action !== 'anonymize' || typeof body.candidateId !== 'string' || !body.candidateId) {
      return NextResponse.json({ error: 'action "anonymize" and candidateId are required' }, { status: 400 })
    }
    if (body.confirm !== 'ERASE') {
      return NextResponse.json({ error: 'Pass confirm: "ERASE" to acknowledge this is irreversible' }, { status: 400 })
    }
    const result = await anonymizeCandidate(session, body.candidateId)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true, erasedDocuments: result.erasedDocuments })
  } catch (err) {
    console.error('[recruitment compliance POST]', err)
    return NextResponse.json({ error: 'Erasure failed' }, { status: 500 })
  }
}
