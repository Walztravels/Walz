import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendVisaAdminNotification, sendVisaApplicationConfirmation } from '@/lib/email-visa'
import { ensureClientAccount } from '@/lib/create-client-account'
import { ensurePortalAccount } from '@/lib/portal-account'

// POST /api/visa-application/[id]/client-submit
// Client-initiated manual submission (no payment required — e.g. unsupported destination)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const existing = await prisma.visaApplication.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const source: string = body.source ?? 'manual'

  const countrySpecific = (typeof existing.countrySpecific === 'object' && existing.countrySpecific !== null
    ? existing.countrySpecific
    : {}) as Record<string, unknown>

  // ── Server-side required-field validation ────────────────────────────────────
  const str = (v: unknown) => (v != null ? String(v).trim() : '')
  const missingCore: string[] = []
  if (!str(existing.firstName))       missingCore.push('First name')
  if (!str(existing.lastName))        missingCore.push('Last name')
  if (!str(existing.dateOfBirth))     missingCore.push('Date of birth')
  if (!str(existing.sex))             missingCore.push('Sex')
  if (!str(existing.nationality))     missingCore.push('Nationality')
  if (!str(existing.passportNumber))  missingCore.push('Passport number')
  if (!str(existing.passportExpiryDate)) missingCore.push('Passport expiry date')
  if (!str(existing.phone))           missingCore.push('Phone number')
  if (!str(existing.email))           missingCore.push('Email address')
  if (!str(existing.homeAddress))     missingCore.push('Home address')
  if (!str(existing.country))         missingCore.push('Country of residence')
  if (!str(existing.purposeOfVisit))  missingCore.push('Purpose of visit')

  // Canada-specific required fields
  if (existing.destinationIso2 === 'CA') {
    const ca: string[] = []
    if (!str(countrySpecific.serviceLanguage))         ca.push('Preferred service language')
    if (!str(countrySpecific.countryOfBirth))          ca.push('Country of birth')
    if (!str(countrySpecific.currentResidenceStatus))  ca.push('Status in current country of residence')
    if (!str(countrySpecific.currentResidenceFrom))    ca.push('Date established current residence')
    if (!str(countrySpecific.nativeLanguage))          ca.push('Native language / mother tongue')
    if (!str(countrySpecific.languagesSpoken))         ca.push('Official language ability')
    if (!str(countrySpecific.languageMostAtEase))      ca.push('Language most at ease in')
    if (!str(countrySpecific.educationLevel))          ca.push('Highest level of education')
    if (!str(countrySpecific.tripPayor))               ca.push('Who is paying for your trip')
    if (!str(countrySpecific.fundsAvailableCAD))       ca.push('Funds available for stay (CAD)')
    if (!str(countrySpecific.signatureName))           ca.push('Declaration signature (typed name)')
    if (!str(countrySpecific.signatureDate))           ca.push('Signature date')
    // Conditional: if livedElsewherePast5Yrs, need details
    if (countrySpecific.livedElsewherePast5Yrs && !str(countrySpecific.previousResidencesDetails))
      ca.push('Previous countries of residence details')
    // Conditional: if any criminal record, need details
    if (existing.criminalRecord && !str(countrySpecific.criminalOffenceDetails))
      ca.push('Criminal offence details (Q3b)')
    missingCore.push(...ca)
  }

  if (missingCore.length > 0) {
    return NextResponse.json(
      { error: `Please complete all required fields before submitting: ${missingCore.join(', ')}` },
      { status: 422 },
    )
  }
  // ────────────────────────────────────────────────────────────────────────────

  const application = await prisma.visaApplication.update({
    where: { id: params.id },
    data: {
      status: 'received',
      isDraft: false,
      initiatedBy: 'client',
      countrySpecific: { ...countrySpecific, source },
      updatedAt: new Date(),
    },
  })

  try { await sendVisaAdminNotification(application, 'client') } catch { /* non-fatal */ }
  try { await sendVisaApplicationConfirmation(application) } catch { /* non-fatal */ }

  // Auto-create client portal account (never breaks submission if it fails)
  const email = application.email ?? session.user.email
  if (email) {
    const fullName = [application.firstName, application.lastName].filter(Boolean).join(' ') || session.user.name || 'Client'
    await ensureClientAccount({ email, name: fullName, phone: application.phone ?? null, applicationId: application.id })
    await ensurePortalAccount(
      email,
      fullName,
      application.referenceNumber,
      `${application.visaType} Visa Application`,
    ).catch(() => {})
  }

  return NextResponse.json({ referenceNumber: application.referenceNumber })
}
