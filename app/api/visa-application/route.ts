import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateVisaRef } from '@/lib/visa-config'

// GET /api/visa-application — list the logged-in user's visa applications
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Query by userId (linked applications) OR by email (applications submitted
  // before the portal account was created / before admin linked them)
  const applications = await prisma.visaApplication.findMany({
    where: {
      OR: [
        { userId: session.user.id },
        ...(session.user.email
          ? [{ email: { equals: session.user.email, mode: 'insensitive' as const } }]
          : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, referenceNumber: true, destinationIso2: true, visaType: true,
      firstName: true, lastName: true, status: true, isDraft: true,
      serviceFeePaid: true, createdAt: true, updatedAt: true,
    },
  })

  return NextResponse.json({ applications })
}

// POST /api/visa-application — create a new draft application
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { destinationIso2, visaType } = body

  if (!destinationIso2) return NextResponse.json({ error: 'destinationIso2 required' }, { status: 400 })

  // Generate unique reference
  let referenceNumber = generateVisaRef()
  let attempts = 0
  while (attempts < 5) {
    const existing = await prisma.visaApplication.findUnique({ where: { referenceNumber } })
    if (!existing) break
    referenceNumber = generateVisaRef()
    attempts++
  }

  // Pre-fill from passport vault
  const vault = await prisma.passportVault.findUnique({
    where: { userId: session.user.id },
  })

  const application = await prisma.visaApplication.create({
    data: {
      referenceNumber,
      userId: session.user.id,
      destinationIso2: destinationIso2.toUpperCase(),
      visaType: visaType ?? 'tourist',
      status: 'draft',
      isDraft: true,
      // Pre-fill from vault
      firstName:       vault?.givenNames?.split(' ')[0] ?? null,
      middleName:      vault?.givenNames?.split(' ').slice(1).join(' ') || null,
      lastName:        vault?.surname ?? null,
      dateOfBirth:     vault?.dateOfBirth ?? null,
      sex:             vault?.sex ?? null,
      placeOfBirth:    vault?.placeOfBirth ?? null,
      nationality:     vault?.nationality ?? null,
      passportNumber:  vault?.passportNumber ?? null,
      passportType:    vault?.passportType ?? null,
      passportIssueDate: vault?.issueDate ?? null,
      passportExpiryDate: vault?.expiryDate ?? null,
      issuingAuthority: vault?.issuingAuthority ?? null,
      phone:           vault?.phone ?? null,
      email:           session.user.email ?? null,
      homeAddress:     vault?.homeAddress ?? null,
      city:            vault?.city ?? null,
      stateRegion:     vault?.stateRegion ?? null,
      country:         vault?.country ?? null,
      postalCode:      vault?.postalCode ?? null,
      employmentStatus: vault?.employmentStatus ?? null,
      employerName:    vault?.employerName ?? null,
      jobTitle:        vault?.jobTitle ?? null,
      monthlyIncome:   vault?.incomeRange ?? null,
    },
  })

  return NextResponse.json({ application }, { status: 201 })
}
