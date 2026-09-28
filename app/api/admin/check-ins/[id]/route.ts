// PATCH /api/admin/check-ins/[id] — apply | waive | dispute | resolve
//
// Check-In V2 financial-safety change: `waive` and `resolve(approved)` now
// require a `reason` and act on the CheckInDeduction ledger, NOT on the
// CheckInRecord's own status. The missed attendance record is NEVER
// deleted or rewritten to CHECKED_IN by a waiver — it stays MISSED forever
// (full audit trail); only the associated deduction's financial effect is
// switched off (status -> WAIVED). Restricted to super_admin only — this
// touches real payroll-affecting money, tighter than the previous
// super_admin|operations_manager allowlist used for the non-financial
// dispute workflow.
import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { resolveCountry, resolveDeductionAmount, effectivePayrollPeriod } from '@/lib/check-ins/policy'

type Params = { params: Promise<{ id: string }> }

const DISPUTE_ADMIN_ROLES = new Set(['super_admin', 'operations_manager']) // non-financial triage only

function isSuperAdmin(session: { role: string; staffRole?: string }): boolean {
  return session.role === 'super_admin' || session.staffRole === 'super_admin'
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json() as {
      action: 'apply' | 'waive' | 'dispute' | 'resolve'
      note?: string
      approved?: boolean
      reason?: string
    }

    const record = await prisma.checkInRecord.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ── apply: Super-Admin-only, explicit, one-off creation of the real
    //    deduction ledger row for a confirmed MISSED occurrence (e.g. one
    //    that predates the policy's effective date and the Super Admin has
    //    deliberately decided to apply anyway). Never guesses an amount —
    //    if the staff's country policy is unconfigured, this 400s.
    if (body.action === 'apply') {
      if (!isSuperAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (record.status !== 'MISSED') {
        return NextResponse.json({ error: 'Only a MISSED occurrence can have a deduction applied' }, { status: 400 })
      }
      const existingDeduction = await (prisma as any).checkInDeduction.findUnique({ where: { checkInRecordId: id } })
      if (existingDeduction) return NextResponse.json({ error: 'A deduction already exists for this occurrence' }, { status: 409 })

      const staff = await prisma.staff.findUnique({ where: { id: record.staffId }, select: { timezone: true } })
      const country = resolveCountry(staff?.timezone)
      const policyRow = await (prisma as any).checkInDeductionPolicy.findUnique({ where: { country } })
      const resolved = resolveDeductionAmount(policyRow)
      if (!resolved) {
        return NextResponse.json({ error: `No deduction amount is configured for ${country} — set it in Check-in Settings first` }, { status: 400 })
      }

      const deduction = await (prisma as any).checkInDeduction.create({
        data: {
          staffId: record.staffId, checkInRecordId: id,
          reason: 'MISSED_CHECK_IN', amount: resolved.amount, currency: resolved.currency,
          status: 'ACTIVE', effectivePayrollPeriod: effectivePayrollPeriod(record.windowStart),
          createdBy: session.staffId ?? 'super_admin',
        },
      })
      const updated = await prisma.checkInRecord.update({ where: { id }, data: { deductionAmt: resolved.amount, waived: false } })
      return NextResponse.json({ record: updated, deduction })
    }

    // ── waive: requires a reason. Waives the DEDUCTION only — the MISSED
    //    attendance record is preserved untouched for the audit trail.
    if (body.action === 'waive') {
      if (!isSuperAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const reason = (body.reason ?? '').trim()
      if (!reason) return NextResponse.json({ error: 'A reason for waiver is required' }, { status: 400 })

      const deduction = await (prisma as any).checkInDeduction.findUnique({ where: { checkInRecordId: id } })
      if (deduction) {
        await (prisma as any).checkInDeduction.update({
          where: { id: deduction.id },
          data:  { status: 'WAIVED', waivedAt: new Date(), waivedBy: session.staffId ?? null, waiverReason: reason },
        })
      }
      // Legacy display mirror only — status stays MISSED (never deleted/rewritten).
      const updated = await prisma.checkInRecord.update({
        where: { id },
        data: { waived: true, deductionAmt: 0, waivedById: session.staffId, waivedAt: new Date() },
      })
      return NextResponse.json({ record: updated })
    }

    if (body.action === 'dispute') {
      if (record.staffId !== session.staffId && !DISPUTE_ADMIN_ROLES.has(session.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const updated = await prisma.checkInRecord.update({
        where: { id },
        data: { dispute: body.note ?? '', disputeStatus: 'pending' },
      })
      return NextResponse.json({ record: updated })
    }

    if (body.action === 'resolve') {
      if (!isSuperAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const approved = body.approved ?? false
      if (approved) {
        const reason = (body.reason ?? '').trim() || 'Dispute approved'
        const deduction = await (prisma as any).checkInDeduction.findUnique({ where: { checkInRecordId: id } })
        if (deduction) {
          await (prisma as any).checkInDeduction.update({
            where: { id: deduction.id },
            data:  { status: 'WAIVED', waivedAt: new Date(), waivedBy: session.staffId ?? null, waiverReason: reason },
          })
        }
      }
      const updated = await prisma.checkInRecord.update({
        where: { id },
        data: {
          disputeStatus: approved ? 'approved' : 'rejected',
          ...(approved ? { waived: true, deductionAmt: 0, waivedById: session.staffId, waivedAt: new Date() } : {}),
        },
      })
      return NextResponse.json({ record: updated })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[check-in PATCH]', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
