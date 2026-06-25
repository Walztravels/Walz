export const maxDuration = 60
export const dynamic    = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { prisma }                    from '@/lib/db'
import { getNGNBankCode, getGHSNetwork, getFLWKey } from '@/lib/flutterwave-banks'

interface StaffWithPayslip {
  id: string; name: string; email: string; currency: string
  baseSalary: number; payDay: number; bankName: string | null; accountNumber: string | null
  payslips: { netPay: number; grossPay: number; allowance: number; otherDeduction: number }[]
}

async function sendTransfer(
  staff: StaffWithPayslip,
  netPay: number,
  reference: string,
): Promise<{ success: boolean; transferId?: string; error?: string }> {
  const FLW_KEY  = getFLWKey()
  const currency = staff.currency || 'NGN'

  const payload: Record<string, any> = {
    account_number: staff.accountNumber,
    amount:         netPay,
    narration:      `Walz Travels Salary ${new Date().toLocaleString('en-GB', { month: 'short', year: 'numeric' })}`,
    currency,
    reference,
    callback_url:   `${process.env.NEXTAUTH_URL}/api/flutterwave/webhook`,
    beneficiary_name: staff.name,
  }

  if (currency === 'NGN') {
    const bankCode = getNGNBankCode(staff.bankName || '')
    if (!bankCode) return { success: false, error: `Bank "${staff.bankName}" not recognised — add code manually` }
    payload.bank_code = bankCode
  } else if (currency === 'GHS') {
    const { isMobile, code } = getGHSNetwork(staff.bankName || '')
    if (isMobile) { payload.type = 'mobile_money_ghana'; payload.network = code }
    else { payload.bank_code = code }
  } else if (currency === 'KES') {
    payload.type = 'mpesa'
  } else if (currency === 'GBP') {
    payload.bank_code = (staff as any).sortCode || ''
  }

  try {
    try {
      const ipCheck = await fetch('https://api.ipify.org?format=json')
      const { ip }  = await ipCheck.json()
      console.log('[transfer] Outbound IP:', ip)
    } catch {}

    console.log('[transfer] Sending:', { name: staff.name, amount: netPay, currency, bank: staff.bankName, reference })

    const res  = await fetch('https://api.flutterwave.com/v3/transfers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${FLW_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()

    console.log('[transfer] FLW response:', { status: data.status, message: data.message, id: data.data?.id })

    if (data.status === 'success' || data.data?.status === 'NEW' || data.data?.status === 'PENDING') {
      return { success: true, transferId: String(data.data?.id || '') }
    }
    return { success: false, error: data.message || data.data?.complete_message || 'Transfer failed' }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function POST(req: NextRequest) {
  try {
    // Accept admin session OR internal cron secret
    const session        = await getAdminSession()
    const internalSecret = req.headers.get('x-internal-secret')
    const isInternalCron = !!process.env.CRON_SECRET && internalSecret === process.env.CRON_SECRET
    if (!session && !isInternalCron) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const { staffIds, month, year, dryRun = false } = body

    const now      = new Date()
    const payMonth = Number(month) || (now.getMonth() + 1)
    const payYear  = Number(year)  || now.getFullYear()

    const staffList: StaffWithPayslip[] = await prisma.staffMember.findMany({
      where:    { isActive: true, ...(staffIds?.length ? { id: { in: staffIds } } : {}) },
      orderBy:  { name: 'asc' },
      include:  {
        payslips: {
          where: { month: payMonth, year: payYear },
          take:  1,
          select: { netPay: true, grossPay: true, allowance: true, otherDeduction: true },
        },
      },
    }) as unknown as StaffWithPayslip[]

    if (!staffList.length) return NextResponse.json({ error: 'No active payroll staff found' }, { status: 404 })

    const staffWithPay = staffList.map(s => {
      const slip    = s.payslips[0]
      const netPay  = slip ? slip.netPay  : s.baseSalary
      const grossPay = slip ? slip.grossPay : s.baseSalary
      return { ...s, netPay, grossPay }
    })

    // ── DRY RUN ──────────────────────────────────────────────────────────────
    if (dryRun) {
      const totals: Record<string, number> = {}
      for (const s of staffWithPay) {
        const c = s.currency || 'NGN'
        totals[c] = (totals[c] || 0) + s.netPay
      }
      return NextResponse.json({
        dryRun:    true,
        month:     payMonth,
        year:      payYear,
        transfers: staffWithPay.map(s => ({
          id:            s.id,
          name:          s.name,
          amount:        s.netPay,
          currency:      s.currency,
          bank:          s.bankName,
          account:       `****${(s.accountNumber || '').slice(-4)}`,
          bankCode:      s.currency === 'NGN' ? getNGNBankCode(s.bankName || '') : '—',
          bankCodeFound: s.currency === 'NGN' ? !!getNGNBankCode(s.bankName || '') : true,
        })),
        totals,
      })
    }

    // ── LIVE TRANSFERS ────────────────────────────────────────────────────────
    const results = []
    for (const staff of staffWithPay) {
      // Skip if already paid this month via Flutterwave
      const existing = await prisma.payslip.findFirst({
        where: { staffMemberId: staff.id, month: payMonth, year: payYear, paidVia: 'flutterwave' },
      })
      if (existing) {
        results.push({ name: staff.name, status: 'ALREADY_PAID', message: 'Already paid via Flutterwave this month' })
        continue
      }

      const reference = `WALZ-${payYear}-${String(payMonth).padStart(2, '0')}-${staff.id.slice(0, 8).toUpperCase()}`
      const transfer  = await sendTransfer(staff, staff.netPay, reference)

      const updateData = transfer.success
        ? { status: 'PAID',    grossPay: staff.grossPay, netPay: staff.netPay, currency: staff.currency,
            transferId: transfer.transferId, transferStatus: 'PROCESSING',
            transferReference: reference, paidVia: 'flutterwave', transferInitiatedAt: new Date() }
        : { status: 'PENDING', grossPay: staff.grossPay, netPay: staff.netPay, currency: staff.currency,
            transferStatus: 'FAILED', transferReference: reference, transferError: transfer.error }

      await prisma.payslip.upsert({
        where:  { staffMemberId_month_year: { staffMemberId: staff.id, month: payMonth, year: payYear } },
        update: updateData,
        create: { staffMemberId: staff.id, month: payMonth, year: payYear, baseSalary: staff.baseSalary, ...updateData },
      })

      results.push({
        name:       staff.name,
        amount:     staff.netPay,
        currency:   staff.currency,
        status:     transfer.success ? 'SUCCESS' : 'FAILED',
        transferId: transfer.transferId,
        reference,
        error:      transfer.error,
      })
    }

    const summary = {
      total:      staffWithPay.length,
      successful: results.filter(r => r.status === 'SUCCESS').length,
      failed:     results.filter(r => r.status === 'FAILED').length,
      alreadyPaid: results.filter(r => r.status === 'ALREADY_PAID').length,
    }
    console.log('[transfer] Summary:', summary)

    return NextResponse.json({ success: true, summary, results, month: payMonth, year: payYear })
  } catch (err: any) {
    console.error('[payroll/transfer] ERROR:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
