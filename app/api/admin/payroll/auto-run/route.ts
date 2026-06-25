export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { Resend }                    from 'resend'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[auto-run] Starting monthly payroll transfer...')

  try {
    const res  = await fetch(`${process.env.NEXTAUTH_URL}/api/admin/payroll/transfer`, {
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

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
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
