import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { prisma }                    from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    if (!session.permissions?.accounting_view && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Permission denied — accounting_view required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || 'month'
    const type   = searchParams.get('type')   || 'all'

    const now = new Date()
    let fromDate: Date | undefined
    if      (period === 'week')  fromDate = new Date(now.getTime() - 7 * 86_400_000)
    else if (period === 'month') fromDate = new Date(now.getFullYear(), now.getMonth(), 1)
    else if (period === 'year')  fromDate = new Date(now.getFullYear(), 0, 1)

    const dateFilter = fromDate ? { gte: fromDate } : undefined

    // Parallel fetch — inflows and outflows
    const [paymentLinks, visaFees, payslips] = await Promise.all([
      // Paid payment links (all providers)
      prisma.paymentLink.findMany({
        where: {
          status: 'paid',
          ...(dateFilter && { paidAt: dateFilter }),
        },
        orderBy: { paidAt: 'desc' },
      }),

      // Visa service fees collected
      prisma.visaApplication.findMany({
        where: {
          serviceFeePaid: true,
          ...(dateFilter && { updatedAt: dateFilter }),
        },
        select: {
          id:                 true,
          referenceNumber:    true,
          firstName:          true,
          lastName:           true,
          serviceFeeAmount:   true,
          serviceFeeCurrency: true,
          updatedAt:          true,
          visaType:           true,
          destinationIso2:    true,
        },
      }),

      // Paid payslips (outflows)
      prisma.payslip.findMany({
        where: {
          status: 'PAID',
          ...(dateFilter && { createdAt: dateFilter }),
        },
        include: { staffMember: { select: { name: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      }).catch(() => []),
    ])

    // ── Build unified ledger ───────────────────────────────────────────────────
    const transactions: Record<string, unknown>[] = []

    paymentLinks.forEach(link => {
      transactions.push({
        id:            link.id,
        date:          link.paidAt || link.createdAt,
        type:          'inflow',
        category:      'payment_link',
        description:   link.description || 'Payment Link',
        client:        link.clientName  || '—',
        clientEmail:   link.clientEmail,
        amount:        Number(link.amount ?? 0),
        currency:      link.currency || 'NGN',
        provider:      link.provider,
        reference:     link.txRef,
        status:        'completed',
        payerBank:     link.payerBank    ?? null,
        accountNumber: link.accountNumber ?? null,
      })
    })

    visaFees.forEach(app => {
      transactions.push({
        id:          app.id,
        date:        app.updatedAt,
        type:        'inflow',
        category:    'visa_fee',
        description: `${app.destinationIso2?.toUpperCase() ?? ''} ${app.visaType ?? 'Visa'} — Service Fee`,
        client:      `${app.firstName ?? ''} ${app.lastName ?? ''}`.trim() || '—',
        amount:      Number(app.serviceFeeAmount ?? 0),
        currency:    app.serviceFeeCurrency || 'GBP',
        reference:   app.referenceNumber,
        status:      'completed',
        provider:    'manual',
      })
    })

    payslips.forEach(slip => {
      transactions.push({
        id:          slip.id,
        date:        slip.createdAt,
        type:        'outflow',
        category:    'payroll',
        description: `Salary — ${slip.staffMember?.name ?? 'Staff'}`,
        client:      slip.staffMember?.name ?? '—',
        amount:      Number(slip.netPay ?? 0),
        currency:    slip.currency || 'NGN',
        reference:   slip.transferReference || slip.id,
        status:      slip.status,
        provider:    'flutterwave',
      })
    })

    // Sort all by date descending
    transactions.sort((a, b) =>
      new Date(b.date as string).getTime() - new Date(a.date as string).getTime()
    )

    const filtered = type === 'all' ? transactions : transactions.filter(t => t.type === type)

    // ── Summary per currency ───────────────────────────────────────────────────
    const allCurrencies = [...new Set(transactions.map(t => t.currency as string))]
    const summary: Record<string, { totalIn: number; totalOut: number; net: number; count: number }> = {}

    for (const cur of allCurrencies) {
      const forCur   = transactions.filter(t => t.currency === cur)
      const totalIn  = forCur.filter(t => t.type === 'inflow').reduce((s, t) => s + (t.amount as number), 0)
      const totalOut = forCur.filter(t => t.type === 'outflow').reduce((s, t) => s + (t.amount as number), 0)
      summary[cur]   = { totalIn, totalOut, net: totalIn - totalOut, count: forCur.length }
    }

    // Category breakdown (inflows only)
    const byCategory: Record<string, number> = {}
    transactions.filter(t => t.type === 'inflow').forEach(t => {
      const cat = t.category as string
      byCategory[cat] = (byCategory[cat] ?? 0) + (t.amount as number)
    })

    return NextResponse.json({
      transactions: filtered,
      summary,
      byCategory,
      period,
      totalCount: filtered.length,
    })
  } catch (err: any) {
    console.error('[accounting]', err.message)
    return NextResponse.json({ error: err.message, transactions: [], summary: {} }, { status: 500 })
  }
}
