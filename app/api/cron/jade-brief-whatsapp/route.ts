import { NextResponse }                    from 'next/server'
import prisma                             from '@/lib/db'
import { sendWhatsAppBody, normalisePhone } from '@/lib/twilio-whatsapp'
import { renderBriefWhatsApp, type BriefEmailOpts } from '@/lib/jade/brief-email'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

// WhatsApp delivery runs every 30 min and sends at 08:00 local for each staff member.
// Uses free-form messages (no template) — only works if staff have an active 24-hour
// Twilio session (i.e. they messaged the Walz WhatsApp number within the last 24 hours).
// Staff who have never messaged will receive a Twilio 63016/63038 error (logged, not fatal).

const DELIVERY_HOUR = 8

type LocalInfo = { hour: number; date: string; isWeekday: boolean }

function getLocalInfo(tz: string): LocalInfo {
  const now   = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
    weekday: 'short',
  }).formatToParts(now)

  const get  = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const hour = parseInt(get('hour'), 10)
  const date = `${get('year')}-${get('month')}-${get('day')}`
  return { hour, date, isWeekday: !['Sat', 'Sun'].includes(get('weekday')) }
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allStaff = await prisma.staff.findMany({
    where: { isActive: true },
    select: { id: true, name: true, whatsapp: true, timezone: true },
  })

  let sent = 0, skipped = 0, failed = 0
  const errors: string[] = []

  for (const staff of allStaff) {
    if (!staff.whatsapp) { skipped++; continue }

    const tz = staff.timezone || 'Africa/Lagos'
    const { hour, date, isWeekday } = getLocalInfo(tz)

    if (!isWeekday || hour !== DELIVERY_HOUR) { skipped++; continue }

    const existing = await prisma.briefDeliveryLog.findUnique({
      where: { briefDate_staffId_channel: { briefDate: date, staffId: staff.id, channel: 'whatsapp' } },
    })
    if (existing?.status === 'SENT') { skipped++; continue }

    const brief = await prisma.jadeDailyBrief.findUnique({ where: { briefDate: date } })
    if (!brief) { skipped++; continue }

    try {
      const waOpts: BriefEmailOpts = {
        staffName:         staff.name,
        briefDate:         date,
        motivation:        brief.motivation,
        motivationThought: brief.motivationThought,
        contentJson:       brief.contentJson as BriefEmailOpts['contentJson'],
        baseUrl:           process.env.NEXTAUTH_URL || 'https://walztravels.com',
      }
      const body = renderBriefWhatsApp(waOpts)

      const result = await sendWhatsAppBody(normalisePhone(staff.whatsapp), body)

      if (!result.ok) throw new Error(result.error ?? 'Twilio error')

      await prisma.briefDeliveryLog.upsert({
        where:  { briefDate_staffId_channel: { briefDate: date, staffId: staff.id, channel: 'whatsapp' } },
        create: { briefDate: date, staffId: staff.id, channel: 'whatsapp', status: 'SENT', providerMessageId: result.sid, sentAt: new Date() },
        update: { status: 'SENT', providerMessageId: result.sid, sentAt: new Date(), failureReason: null },
      })
      sent++
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      errors.push(`${staff.whatsapp}: ${reason}`)
      console.error('[jade-brief-whatsapp] Failed for', staff.whatsapp, reason)

      await prisma.briefDeliveryLog.upsert({
        where:  { briefDate_staffId_channel: { briefDate: date, staffId: staff.id, channel: 'whatsapp' } },
        create: { briefDate: date, staffId: staff.id, channel: 'whatsapp', status: 'FAILED', failureReason: reason },
        update: { status: 'FAILED', failureReason: reason },
      }).catch(() => null)
      failed++
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, failed, errors: errors.length ? errors : undefined })
}
