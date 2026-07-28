export const maxDuration = 60
export const dynamic    = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { prisma }                    from '@/lib/db'
import { getNGNBankCode, getGHSNetwork, getFLWKey } from '@/lib/flutterwave-banks'

const FLW_BASE = () => process.env.FLW_PROXY_URL ?? 'https://api.flutterwave.com'

function flwHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    Authorization:  `Bearer ${getFLWKey()}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  }
  if (process.env.FLW_PROXY_SECRET) h['X-Walz-Proxy-Secret'] = process.env.FLW_PROXY_SECRET
  return h
}

interface StaffWithPayslip {
  id: string; name: string; email: string; currency: string
  baseSalary: number; payDay: number; bankName: string | null; accountNumber: string | null
  payslips: { netPay: number; grossPay: number; allowance: number; otherDeduction: number }[]
}

type TransferOutcome =
  | { outcome: 'PAID';   transferId: string }
  | { outcome: 'QUEUED'; transferId: string }
  | { outcome: 'FAILED'; error: string }

async function sendTransfer(
  staff: StaffWithPayslip,
  netPay: number,
  reference: string,
): Promise<TransferOutcome> {
  const currency = staff.currency || 'NGN'

  const payload: Record<string, any> = {
    account_number:   staff.accountNumber,
    amount:           netPay,
    narration:        `Walz Travels Salary ${new Date().toLocaleString('en-GB', { month: 'short', year: 'numeric' })}`,
    currency,
    reference,
    callback_url:     `${process.env.NEXTAUTH_URL}/api/flutterwave/webhook`,
    beneficiary_name: staff.name,
  }

  if (currency === 'NGN') {
    const bankCode = getNGNBankCode(staff.bankName || '')
    if (!bankCode) return { outcome: 'FAILED', error: `Bank "${staff.bankName}" not recognised — add code manually` }
    payload.account_bank = bankCode
  } else if (currency === 'GHS') {
    const { code } = getGHSNetwork(staff.bankName || '')
    if (!code) return { outcome: 'FAILED', error: `Ghana bank/network "${staff.bankName}" not recognised — update staff bank name` }
    payload.account_bank = code
  } else if (currency === 'KES') {
    payload.type = 'mpesa'
  } else if (currency === 'GBP') {
    payload.account_bank = (staff as any).sortCode || ''
  }

  try {
    console.log('[transfer] Sending:', { name: staff.name, amount: netPay, currency, bank: staff.bankName, reference, proxy: FLW_BASE() })

    const res  = await fetch(`${FLW_BASE()}/v3/transfers`, {
      method:  'POST',
      headers: flwHeaders(),
      body:    JSON.stringify(payload),
    })
    const data = await res.json()
    const txStatus = data.data?.status
    console.log('[transfer] FLW response:', { status: data.status, message: data.message, txStatus, id: data.data?.id })

    // Fully settled synchronously (rare but possible)
    if (data.status === 'success' && txStatus === 'SUCCESSFUL') {
      return { outcome: 'PAID', transferId: String(data.data.id) }
    }

    // Accepted into FLW queue — money NOT moved yet, awaits bank processing
    if (data.status === 'success' && (txStatus === 'NEW' || txStatus === 'PENDING')) {
      return { outcome: 'QUEUED', transferId: String(data.data.id) }
    }

    return { outcome: 'FAILED', error: data.message || data.data?.complete_message || 'Transfer failed' }
  } catch (err: any) {
    return { outcome: 'FAILED', error: err.message }
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

    // ── Phase 4: Proxy health pre-flight ─────────────────────────────────────
    if (!dryRun && process.env.FLW_PROXY_URL) {
      const health = await fetch(`${process.env.FLW_PROXY_URL}/healthz`, {
        signal: AbortSignal.timeout(5000),
      }).catch(() => null)

      if (!health?.ok) {
        return NextResponse.json(
          { error: 'Payment proxy unreachable — payroll aborted. Run transfers manually from the Flutterwave dashboard if urgent.' },
          { status: 503 },
        )
      }
    }

    const staffList: StaffWithPayslip[] = await prisma.staffMember.findMany({
      where:    { isActive: true, ...(staffIds?.length ? { id: { in: staffIds } } : {}) },
      orderBy:  { name: 'asc' },
      include:  {
        payslips: {
          where:  { month: payMonth, year: payYear },
          take:   1,
          select: { netPay: true, grossPay: true, allowance: true, otherDeduction: true },
        },
      },
    }) as unknown as StaffWithPayslip[]

    if (!staffList.length) return NextResponse.json({ error: 'No active payroll staff found' }, { status: 404 })

    const staffWithPay = staffList.map(s => {
      const slip     = s.payslips[0]
      const netPay   = slip ? slip.netPay   : s.baseSalary
      const grossPay = slip ? slip.grossPay : s.baseSalary
      return { ...s, netPay, grossPay }
    })

    // ── Phase 4: Balance pre-flight ───────────────────────────────────────────
    if (!dryRun) {
      try {
        const totalsNeeded: Record<string, number> = {}
        for (const s of staffWithPay) totalsNeeded[s.currency || 'NGN'] = (totalsNeeded[s.currency || 'NGN'] || 0) + s.netPay

        const balRes  = await fetch(`${FLW_BASE()}/v3/balances`, { headers: flwHeaders(), signal: AbortSignal.timeout(8000) })
        const balData = await balRes.json()
        const balMap: Record<string, number> = {}
        for (const b of (balData.data || [])) balMap[b.currency] = b.available_balance

        const shortfalls = Object.entries(totalsNeeded)
          .filter(([cur, need]) => (balMap[cur] ?? 0) < need)
          .map(([cur, need]) => `${cur}: need ${need.toLocaleString()}, have ${(balMap[cur] ?? 0).toLocaleString()}`)

        if (shortfalls.length) {
          return NextResponse.json({ error: `Insufficient FLW balance — ${shortfalls.join(' | ')}` }, { status: 422 })
        }
      } catch {
        // Balance check failed — proceed anyway; FLW will reject individual transfers if short
        console.warn('[transfer] Balance pre-flight check failed — proceeding')
      }
    }

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
      // Skip if already queued or paid via Flutterwave this month
      const existing = await prisma.payslip.findFirst({
        where: {
          staffMemberId: staff.id, month: payMonth, year: payYear,
          paidVia: 'flutterwave', status: { in: ['PAID', 'QUEUED'] },
        },
      })
      if (existing) {
        results.push({ name: staff.name, status: 'ALREADY_PAID', message: `Already ${existing.status.toLowerCase()} via Flutterwave this month` })
        continue
      }

      const reference = `WALZ-${payYear}-${String(payMonth).padStart(2, '0')}-${staff.id.slice(0, 8).toUpperCase()}`
      const transfer  = await sendTransfer(staff, staff.netPay, reference)

      const base = { grossPay: staff.grossPay, netPay: staff.netPay, currency: staff.currency, transferReference: reference, paidVia: 'flutterwave' }

      const updateData =
        transfer.outcome === 'PAID'
          ? { ...base, status: 'PAID',    transferId: transfer.transferId, transferStatus: 'SUCCESSFUL', transferInitiatedAt: new Date(), paidAt: new Date() }
          : transfer.outcome === 'QUEUED'
          ? { ...base, status: 'QUEUED',  transferId: transfer.transferId, transferStatus: 'PROCESSING',  transferInitiatedAt: new Date() }
          : { grossPay: staff.grossPay, netPay: staff.netPay, currency: staff.currency,
              status: 'PENDING', transferStatus: 'FAILED', transferReference: reference, transferError: (transfer as any).error }

      await prisma.payslip.upsert({
        where:  { staffMemberId_month_year: { staffMemberId: staff.id, month: payMonth, year: payYear } },
        update: updateData,
        create: { staffMemberId: staff.id, month: payMonth, year: payYear, baseSalary: staff.baseSalary, ...updateData },
      })

      results.push({
        name:       staff.name,
        amount:     staff.netPay,
        currency:   staff.currency,
        status:     transfer.outcome === 'PAID' ? 'SUCCESS' : transfer.outcome === 'QUEUED' ? 'QUEUED' : 'FAILED',
        transferId: transfer.outcome !== 'FAILED' ? transfer.transferId : undefined,
        reference,
        error:      transfer.outcome === 'FAILED' ? (transfer as any).error : undefined,
        message:    transfer.outcome === 'QUEUED' ? 'Transfer accepted — will complete within minutes' : undefined,
      })
    }

    const summary = {
      total:       staffWithPay.length,
      successful:  results.filter(r => r.status === 'SUCCESS').length,
      queued:      results.filter(r => r.status === 'QUEUED').length,
      failed:      results.filter(r => r.status === 'FAILED').length,
      alreadyPaid: results.filter(r => r.status === 'ALREADY_PAID').length,
    }
    console.log('[transfer] Summary:', summary)

    return NextResponse.json({ success: true, summary, results, month: payMonth, year: payYear })
  } catch (err: any) {
    console.error('[payroll/transfer] ERROR:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
