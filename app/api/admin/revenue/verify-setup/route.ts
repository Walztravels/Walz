import { NextResponse }   from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma              from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/admin/revenue/verify-setup
// Verifies that the Release 1 + 1.1 SQL migrations have been applied.
// Read-only: safe to call any time.
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const checks: { check: string; passed: boolean; detail?: string }[] = []

  // 1. CommercialEvent table exists
  try {
    const count = await prisma.commercialEvent.count()
    checks.push({ check: 'CommercialEvent table', passed: true, detail: `${count} events` })
  } catch (e) {
    checks.push({ check: 'CommercialEvent table', passed: false, detail: (e as Error).message })
  }

  // 2. CartSession table exists
  try {
    const count = await prisma.cartSession.count()
    checks.push({ check: 'CartSession table', passed: true, detail: `${count} sessions` })
  } catch (e) {
    checks.push({ check: 'CartSession table', passed: false, detail: (e as Error).message })
  }

  // 3. Booking.jadeAssisted column exists
  try {
    const b = await prisma.booking.findFirst({ select: { jadeAssisted: true } })
    checks.push({ check: 'Booking.jadeAssisted', passed: true, detail: b ? 'field readable' : 'table empty but field exists' })
  } catch (e) {
    checks.push({ check: 'Booking.jadeAssisted', passed: false, detail: (e as Error).message })
  }

  // 4. Booking.leadId column exists
  try {
    await prisma.booking.findFirst({ select: { leadId: true } })
    checks.push({ check: 'Booking.leadId', passed: true })
  } catch (e) {
    checks.push({ check: 'Booking.leadId', passed: false, detail: (e as Error).message })
  }

  // 5. Booking.quoteId column exists
  try {
    await prisma.booking.findFirst({ select: { quoteId: true } })
    checks.push({ check: 'Booking.quoteId', passed: true })
  } catch (e) {
    checks.push({ check: 'Booking.quoteId', passed: false, detail: (e as Error).message })
  }

  // 6. CommercialEvent.bookingId column (1.1 patch)
  try {
    await prisma.commercialEvent.findFirst({ select: { bookingId: true } })
    checks.push({ check: 'CommercialEvent.bookingId (1.1 patch)', passed: true })
  } catch (e) {
    checks.push({ check: 'CommercialEvent.bookingId (1.1 patch)', passed: false, detail: (e as Error).message })
  }

  // 7. Lead.jadeAssisted column (1.1 patch)
  try {
    await prisma.lead.findFirst({ select: { jadeAssisted: true } })
    checks.push({ check: 'Lead.jadeAssisted (1.1 patch)', passed: true })
  } catch (e) {
    checks.push({ check: 'Lead.jadeAssisted (1.1 patch)', passed: false, detail: (e as Error).message })
  }

  const allPassed   = checks.every(c => c.passed)
  const needRelease1 = checks.filter(c => !c.check.includes('1.1') && !c.passed).length > 0
  const need11Patch  = checks.filter(c =>  c.check.includes('1.1') && !c.passed).length > 0

  return NextResponse.json({
    allPassed,
    checks,
    pendingMigrations: [
      ...(needRelease1 ? ['supabase/migrations/release1_commercial.sql'] : []),
      ...(need11Patch  ? ['supabase/migrations/release1_1_patch.sql']    : []),
    ],
    message: allPassed
      ? 'All Release 1 + 1.1 migrations verified ✓'
      : 'Some migrations pending — run the listed SQL files in Supabase SQL Editor',
  })
}
