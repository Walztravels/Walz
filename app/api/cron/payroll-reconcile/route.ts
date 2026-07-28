export const maxDuration = 30
export const dynamic    = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getResend }                  from '@/lib/resend'
import { prisma }                     from '@/lib/db'

const FLW_BASE = () => process.env.FLW_PROXY_URL ?? 'https://api.flutterwave.com'

function flwHeaders(): Record<string, string> {
  const key = process.env.FLW_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY || ''
  const h: Record<string, string> = { Authorization: `Bearer ${key}` }
  if (process.env.FLW_PROXY_SECRET) h['X-Walz-Proxy-Secret'] = process.env.FLW_PROXY_SECRET
  return h
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const queued = await prisma.payslip.findMany({
    where: { status: 'QUEUED', transferId: { not: null } },
    include: { staffMember: { select: { name: true, email: true } } },
  })

  if (!queued.length) {
    return NextResponse.json({ message: 'No queued transfers to reconcile', checked: 0 })
  }

  const results: { id: string; name: string; outcome: string }[] = []

  for (const slip of queued) {
    try {
      const res  = await fetch(`${FLW_BASE()}/v3/transfers/${slip.transferId}`, { headers: flwHeaders() })
      const data = await res.json()
      const txStatus = data.data?.status

      if (txStatus === 'SUCCESSFUL') {
        await prisma.payslip.update({
          where: { id: slip.id },
          data:  { status: 'PAID', transferStatus: 'SUCCESSFUL', paidAt: new Date() },
        })
        results.push({ id: slip.id, name: slip.staffMember.name, outcome: 'PAID' })

      } else if (txStatus === 'FAILED') {
        const reason = data.data?.complete_message || 'Transfer failed'
        await prisma.payslip.update({
          where: { id: slip.id },
          data:  { status: 'PENDING', transferStatus: 'FAILED', transferError: reason },
        })
        results.push({ id: slip.id, name: slip.staffMember.name, outcome: 'FAILED' })

        await getResend().emails.send({
          from:    'Walz Travels Payroll <payroll@walztravels.com>',
          to:      'contact@walztravels.com',
          subject: `⚠️ Payroll Transfer Failed — ${slip.staffMember.name}`,
          html:    `<p><strong>${slip.staffMember.name}</strong>'s transfer failed.</p>
                    <p>Transfer ID: ${slip.transferId}</p>
                    <p>Reason: ${reason}</p>
                    <p>Amount: ${slip.currency} ${slip.netPay?.toLocaleString()}</p>
                    <p>Please retry or pay manually from the Flutterwave dashboard.</p>`,
        })

      } else if (slip.transferInitiatedAt && slip.transferInitiatedAt < twoHoursAgo) {
        // Still queued after 2 hours — alert ops but don't change status
        results.push({ id: slip.id, name: slip.staffMember.name, outcome: 'STALE' })

        await getResend().emails.send({
          from:    'Walz Travels Payroll <payroll@walztravels.com>',
          to:      'contact@walztravels.com',
          subject: `⚠️ Payroll Transfer Stale (2h+) — ${slip.staffMember.name}`,
          html:    `<p><strong>${slip.staffMember.name}</strong>'s transfer has been queued for over 2 hours.</p>
                    <p>Transfer ID: ${slip.transferId}</p>
                    <p>FLW status: ${txStatus}</p>
                    <p>Amount: ${slip.currency} ${slip.netPay?.toLocaleString()}</p>
                    <p>Check the Flutterwave dashboard and resolve manually if needed.</p>`,
        }).catch(() => {})

      } else {
        results.push({ id: slip.id, name: slip.staffMember.name, outcome: 'STILL_QUEUED' })
      }
    } catch (err: any) {
      console.error('[reconcile] Error checking transfer', slip.transferId, err.message)
      results.push({ id: slip.id, name: slip.staffMember.name, outcome: 'ERROR' })
    }
  }

  console.log('[reconcile] Done:', results)
  return NextResponse.json({ checked: queued.length, results })
}
