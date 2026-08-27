import { NextResponse }                    from 'next/server'
import prisma                             from '@/lib/db'
import { getResend }                      from '@/lib/resend'
import { renderBriefHtml, renderBriefText, type BriefEmailOpts } from '@/lib/jade/brief-email'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const DELIVERY_HOUR = 8 // 08:00 local time
const BASE_URL = process.env.NEXTAUTH_URL || 'https://walztravels.com'

type LocalInfo = { hour: number; date: string; isWeekday: boolean }

function getLocalInfo(tz: string): LocalInfo {
  const now  = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
    hour:     '2-digit',
    hour12:   false,
    weekday:  'short',
  }).formatToParts(now)

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''

  const hour      = parseInt(get('hour'), 10)      // 0-23
  const year      = get('year')
  const month     = get('month')
  const day       = get('day')
  const date      = `${year}-${month}-${day}`       // YYYY-MM-DD
  const weekday   = get('weekday')                  // "Mon", "Tue", … "Sat", "Sun"
  const isWeekday = !['Sat', 'Sun'].includes(weekday)

  return { hour, date, isWeekday }
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allStaff = await prisma.staff.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, timezone: true },
  })

  let sent = 0, skipped = 0, failed = 0
  const errors: string[] = []

  for (const staff of allStaff) {
    // Must have a valid email address
    if (!staff.email?.includes('@')) { skipped++; continue }

    const tz = staff.timezone || 'Africa/Lagos'
    const { hour, date, isWeekday } = getLocalInfo(tz)

    // Only deliver on weekdays within the 08:xx local window
    if (!isWeekday || hour !== DELIVERY_HOUR) { skipped++; continue }

    // Idempotency — skip if email already SENT today for this staff
    const existing = await prisma.briefDeliveryLog.findUnique({
      where: { briefDate_staffId_channel: { briefDate: date, staffId: staff.id, channel: 'email' } },
    })
    if (existing?.status === 'SENT') { skipped++; continue }

    // Get today's brief using the staff member's local date
    const brief = await prisma.jadeDailyBrief.findUnique({ where: { briefDate: date } })
    if (!brief) { skipped++; continue }

    const formattedDateStr = new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long',
    })

    try {
      const emailOpts: BriefEmailOpts = {
        staffName:         staff.name,
        briefDate:         date,
        motivation:        brief.motivation,
        motivationThought: brief.motivationThought,
        contentJson:       brief.contentJson as BriefEmailOpts['contentJson'],
        baseUrl:           BASE_URL,
      }

      const result = await getResend().emails.send({
        from:    'Jade at Walz Travels <contact@walztravels.com>',
        to:      staff.email,
        subject: `Jade Daily Brief — ${formattedDateStr}`,
        html:    renderBriefHtml(emailOpts),
        text:    renderBriefText(emailOpts),
      })

      // Record successful delivery — prevents future sends for this (date, staff, channel)
      await prisma.briefDeliveryLog.upsert({
        where:  { briefDate_staffId_channel: { briefDate: date, staffId: staff.id, channel: 'email' } },
        create: { briefDate: date, staffId: staff.id, channel: 'email', status: 'SENT', providerMessageId: result.data?.id ?? null, sentAt: new Date() },
        update: { status: 'SENT', providerMessageId: result.data?.id ?? null, sentAt: new Date(), failureReason: null },
      })
      sent++
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      errors.push(`${staff.email}: ${reason}`)
      console.error('[jade-brief-delivery] Failed for', staff.email, reason)

      // Record failure — leaves door open for retry on next cron run (status !== 'SENT')
      await prisma.briefDeliveryLog.upsert({
        where:  { briefDate_staffId_channel: { briefDate: date, staffId: staff.id, channel: 'email' } },
        create: { briefDate: date, staffId: staff.id, channel: 'email', status: 'FAILED', failureReason: reason },
        update: { status: 'FAILED', failureReason: reason },
      }).catch(() => null)
      failed++
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, failed, errors: errors.length ? errors : undefined })
}
