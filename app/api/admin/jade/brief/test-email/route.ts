import { NextResponse }                    from 'next/server'
import { getAdminSession }                from '@/lib/admin-auth'
import prisma                             from '@/lib/db'
import { getResend }                      from '@/lib/resend'
import { renderBriefHtml, renderBriefText, type BriefEmailOpts } from '@/lib/jade/brief-email'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXTAUTH_URL || 'https://walztravels.com'

export async function POST(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['super_admin', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Optional: allow passing a specific briefDate via body; otherwise use today
  let briefDate: string
  try {
    const body = await req.json().catch(() => ({}))
    briefDate = typeof body?.briefDate === 'string' ? body.briefDate : new Date().toISOString().split('T')[0]
  } catch {
    briefDate = new Date().toISOString().split('T')[0]
  }

  const brief = await prisma.jadeDailyBrief.findUnique({ where: { briefDate } })
  if (!brief) {
    return NextResponse.json(
      { error: `No brief generated for ${briefDate}. Run the generation cron first.` },
      { status: 404 },
    )
  }

  if (!session.email) {
    return NextResponse.json({ error: 'No email address on your staff profile.' }, { status: 400 })
  }

  const formattedDateStr = new Date(briefDate + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const emailOpts: BriefEmailOpts = {
    staffName:         session.name,
    briefDate,
    motivation:        brief.motivation,
    motivationThought: brief.motivationThought,
    contentJson:       brief.contentJson as BriefEmailOpts['contentJson'],
    baseUrl:           BASE_URL,
  }

  const result = await getResend().emails.send({
    from:    'Jade at Walz Travels <contact@walztravels.com>',
    to:      session.email,
    subject: `[TEST] Jade Daily Brief — ${formattedDateStr}`,
    html:    renderBriefHtml(emailOpts),
    text:    renderBriefText(emailOpts),
  })

  return NextResponse.json({ sent: true, to: session.email, messageId: result.data?.id })
}
