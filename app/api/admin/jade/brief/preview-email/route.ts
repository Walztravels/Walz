import { getAdminSession }                from '@/lib/admin-auth'
import prisma                             from '@/lib/db'
import { renderBriefHtml, type BriefEmailOpts } from '@/lib/jade/brief-email'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXTAUTH_URL || 'https://walztravels.com'

export async function GET(req: Request) {
  const session = await getAdminSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!['super_admin', 'admin'].includes(session.role)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const briefDate = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  const brief = await prisma.jadeDailyBrief.findUnique({ where: { briefDate } })
  if (!brief) {
    return new Response(`No brief found for ${briefDate}. Run the generation cron first.`, {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const emailOpts: BriefEmailOpts = {
    staffName:         session.name,
    briefDate,
    motivation:        brief.motivation,
    motivationThought: brief.motivationThought,
    contentJson:       brief.contentJson as BriefEmailOpts['contentJson'],
    baseUrl:           BASE_URL,
  }

  return new Response(renderBriefHtml(emailOpts), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
