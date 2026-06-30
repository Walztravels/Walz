export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getResend } from '@/lib/resend'
import { prisma }                    from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Guard 1 — check if auto-run is enabled
  const settings = await prisma.payrollSettings.findUnique({ where: { id: 'singleton' } })
  if (!settings?.autoRunEnabled) {
    console.log('[auto-run] Auto-run is disabled — skipping')
    return NextResponse.json({ message: 'Auto-run is disabled', skipped: true }, { status: 200 })
  }

  // Guard 2 — prevent double-run: check if any payslip was successfully transferred this month
  const now = new Date()
  const alreadyRan = await prisma.payslip.findFirst({
    where: { month: now.getMonth() + 1, year: now.getFullYear(), transferStatus: 'SUCCESS' },
  })
  if (alreadyRan) {
    console.log('[auto-run] Payroll already ran this month — skipping')
    return NextResponse.json({
      message: 'Payroll already completed this month',
      lastRun: alreadyRan.transferCompletedAt,
      skipped: true,
    }, { status: 200 })
  }

  console.log('[auto-run] Starting monthly payroll transfer...')

  try {
    const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://walztravels.com'
    const res  = await fetch(`${appUrl}/api/admin/payroll/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'x-internal-secret': process.env.CRON_SECRET || '',
      },
      body: JSON.stringify({ dryRun: false }),
    })
    const data = await res.json()

    const now   = new Date()
    const month = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })

        await getResend().emails.send({
      from:    'Walz Travels Payroll <payroll@walztravels.com>',
      to:      'contact@walztravels.com',
      subject: `Payroll Auto-Run — ${month}`,
      html: `<h2>Monthly Payroll Complete — ${month}</h2>
<p>✓ Successful: <strong>${data.summary?.successful ?? 0}</strong></p>
<p>✗ Failed: <strong>${data.summary?.failed ?? 0}</strong></p>
<p>Already paid: <strong>${data.summary?.alreadyPaid ?? 0}</strong></p>
<h3>Details</h3>
${(data.results || []).map((r: any) => `
<p>${r.status === 'SUCCESS' ? '✓' : '✗'} <strong>${r.name}</strong> — ${r.currency} ${r.amount?.toLocaleString() ?? '—'}
${r.transferId ? ` (ID: ${r.transferId})` : ''}
${r.error ? `<br><em style="color:#DC2626">Error: ${r.error}</em>` : ''}
</p>`).join('')}`,
    })

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[auto-run] ERROR:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
