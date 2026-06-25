import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { month, year } = await req.json()
  if (!month || !year) return NextResponse.json({ error: 'month and year required' }, { status: 400 })

  const payslips = await prisma.payslip.findMany({
    where: { month, year, status: 'PENDING' },
    select: { id: true },
  })

  const base = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const results: { id: string; ok: boolean; error?: string }[] = []

  for (const { id } of payslips) {
    try {
      const res = await fetch(`${base}/api/admin/payroll/send-paystub`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') ?? '' },
        body:    JSON.stringify({ payslipId: id }),
      })
      results.push({ id, ok: res.ok, ...(!res.ok ? { error: await res.text() } : {}) })
    } catch (e: any) {
      results.push({ id, ok: false, error: e.message })
    }
  }

  const sent   = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  return NextResponse.json({ sent, failed, results })
}
