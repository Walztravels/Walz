import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized', staff: [] }, { status: 401 })

    const staff = await prisma.staffMember.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        payslips: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          take: 1,
        },
      },
    })

    return NextResponse.json({ staff })
  } catch (err: any) {
    console.error('[payroll/staff GET]', err.message, err.stack)
    return NextResponse.json({ error: err.message ?? 'Internal server error', staff: [] }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, email, role, location, department, currency, baseSalary, payDay, bankName, accountNumber } = body

    if (!name?.trim() || !baseSalary) {
      return NextResponse.json({ error: 'Name and base salary are required' }, { status: 400 })
    }

    // Email is optional — generate a unique internal placeholder when omitted
    const memberEmail = email?.trim()
      || `payroll_${name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}@internal.walztravels.com`

    const member = await prisma.staffMember.upsert({
      where:  { email: memberEmail },
      update: {
        name:          name.trim(),
        role:          role || 'Staff',
        location:      location || '',
        department:    department || 'Operations',
        currency:      currency || 'NGN',
        baseSalary:    Number(baseSalary),
        payDay:        Number(payDay ?? 28),
        bankName:      bankName || null,
        accountNumber: accountNumber || null,
      },
      create: {
        name:          name.trim(),
        email:         memberEmail,
        role:          role || 'Staff',
        location:      location || '',
        department:    department ?? 'Operations',
        currency:      currency ?? 'NGN',
        baseSalary:    Number(baseSalary),
        payDay:        Number(payDay ?? 28),
        bankName:      bankName || null,
        accountNumber: accountNumber || null,
      },
    })

    return NextResponse.json({ member })
  } catch (err: any) {
    console.error('[payroll/staff POST]', err.message, err.stack)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
