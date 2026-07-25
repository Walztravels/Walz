import { NextRequest, NextResponse } from 'next/server'
import { dispatchDueAlerts } from '@/lib/jade/intelligence'
import { sendReply } from '@/lib/jade/chatwoot-client'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const dispatched = await dispatchDueAlerts(async (conversationId, message) => {
      await sendReply(Number(conversationId), message)
    })
    return NextResponse.json({ ok: true, dispatched })
  } catch (e: any) {
    console.error('[journey-companion cron]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
