import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateVisaRef } from '@/lib/visa-config'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

interface Applicant {
  firstName:      string
  lastName:       string
  passportNumber?: string
  email?:         string
  phone?:         string
}

// POST /api/admin/visa-applications/manual-entry
// Staff-only: create one or more VisaApplication records for applications
// already processed on an external portal. Does not send a form link or
// require a client account. Each applicant gets their own WALZ ref;
// the shared external reference is stored as embassyReference.
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    embassyReference?: string
    destinationIso2?:  string
    visaType?:         string
    status?:           string
    applicants?:       Applicant[]
  }

  const { embassyReference, destinationIso2, visaType, status, applicants } = body

  if (!destinationIso2) {
    return NextResponse.json({ error: 'destinationIso2 is required' }, { status: 400 })
  }
  if (!applicants?.length) {
    return NextResponse.json({ error: 'At least one applicant is required' }, { status: 400 })
  }
  for (const [i, a] of applicants.entries()) {
    if (!a.firstName?.trim() || !a.lastName?.trim()) {
      return NextResponse.json({ error: `Applicant ${i + 1}: firstName and lastName are required` }, { status: 400 })
    }
  }

  // Task 4 — collision check.
  // WALZ- refs can never collide with external refs (different format), but check
  // if this embassy reference is already attached to an existing record so staff
  // see a clear warning rather than silent duplication.
  if (embassyReference?.trim()) {
    const clash = await prisma.visaApplication.findFirst({
      where: { embassyReference: embassyReference.trim() },
      select: { id: true, referenceNumber: true },
    })
    if (clash) {
      return NextResponse.json({
        error: `Embassy reference "${embassyReference.trim()}" is already on record ${clash.referenceNumber}. Use a different reference or open that record.`,
      }, { status: 409 })
    }
  }

  const initialStatus  = status ?? 'received'
  const dest           = destinationIso2.toUpperCase()
  const embRef         = embassyReference?.trim() || null

  // Shared family-group ID when there are multiple applicants
  const familyGroupId  = applicants.length > 1
    ? `MAN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    : null

  const created = []

  for (const [i, applicant] of applicants.entries()) {
    // Unique WALZ ref per applicant (same retry loop as the online flow)
    let referenceNumber = generateVisaRef()
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await prisma.visaApplication.findUnique({ where: { referenceNumber } })
      if (!existing) break
      referenceNumber = generateVisaRef()
    }

    const app = await prisma.visaApplication.create({
      data: {
        referenceNumber,
        destinationIso2: dest,
        visaType:        visaType ?? 'tourist',
        firstName:       applicant.firstName.trim(),
        lastName:        applicant.lastName.trim(),
        passportNumber:  applicant.passportNumber?.trim() || null,
        email:           applicant.email?.trim()    || null,
        phone:           applicant.phone?.trim()    || null,
        embassyReference: embRef,
        status:          initialStatus,
        isDraft:         false,
        initiatedBy:     'admin',
        source:          'manual_entry',
        familyGroupId,
        relationship:    familyGroupId ? (i === 0 ? 'lead' : 'member') : null,
        serviceFeePaid:  true, // externally processed — payment already handled
      },
      select: {
        id: true, referenceNumber: true, firstName: true, lastName: true,
        email: true, status: true, destinationIso2: true, embassyReference: true,
      },
    })

    created.push(app)
  }

  return NextResponse.json({ applications: created }, { status: 201 })
}
