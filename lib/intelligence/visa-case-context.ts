import prisma from '@/lib/db'

/**
 * Shared Visa Case Intelligence Context (DI-1, conservative scope).
 *
 * One server-side read model for "the case the staff member is working on",
 * assembled ONLY from real database fields — no AI-derived values, no
 * duplication of VisaApplication into another table. Facets that the
 * schema cannot support yet (sponsor, business, structured finances)
 * are deliberately absent rather than invented.
 *
 * Downstream releases (evidence graph, cross-check engine) extend this;
 * DI-1 keeps it to: application, applicant, travel, employment,
 * accommodation, financial declarations, document checks.
 */

export interface VisaCaseContext {
  application: {
    id: string
    referenceNumber: string
    destinationIso2: string
    visaType: string
    status: string
    branch: string
    createdAt: Date
  }
  applicant: {
    firstName: string | null
    middleName: string | null
    lastName: string | null
    fullName: string
    dateOfBirth: Date | null
    nationality: string | null
    passportNumber: string | null
    passportExpiryDate: Date | null
    email: string | null
    phone: string | null
  }
  travel: {
    arrivalDate: Date | null
    returnDate: Date | null
    purposeOfVisit: string | null
    portOfEntry: string | null
  }
  employment: {
    employmentStatus: string | null
    employerName: string | null
    jobTitle: string | null
    employerAddress: string | null
  }
  accommodation: {
    accommodationName: string | null
    accommodationAddress: string | null
  }
  /** Declared by the applicant on the form — a claim, not verified evidence. */
  financialDeclarations: {
    monthlyIncome: string | null
  }
  documentChecks: Array<{
    id: string
    documentType: string
    fileName: string
    verdict: string
    authenticityScore: number
    checkedAt: Date
    checkedBy: string
  }>
}

/**
 * Load the case context for one visa application. Returns null when the
 * application does not exist. Every value comes straight from the DB.
 */
export async function getVisaCaseContext(applicationId: string): Promise<VisaCaseContext | null> {
  if (!applicationId) return null
  const app = await prisma.visaApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true, referenceNumber: true, destinationIso2: true, visaType: true,
      status: true, branch: true, createdAt: true,
      firstName: true, middleName: true, lastName: true, dateOfBirth: true,
      nationality: true, passportNumber: true, passportExpiryDate: true,
      email: true, phone: true,
      arrivalDate: true, returnDate: true, purposeOfVisit: true, portOfEntry: true,
      employmentStatus: true, employerName: true, jobTitle: true, employerAddress: true,
      accommodationName: true, accommodationAddress: true,
      monthlyIncome: true,
    },
  })
  if (!app) return null

  const documentChecks = await prisma.documentAuthenticityCheck.findMany({
    where:   { applicationId },
    orderBy: { checkedAt: 'desc' },
    take:    50,
    select:  {
      id: true, documentType: true, fileName: true, verdict: true,
      authenticityScore: true, checkedAt: true, checkedBy: true,
    },
  })

  return {
    application: {
      id: app.id, referenceNumber: app.referenceNumber,
      destinationIso2: app.destinationIso2, visaType: app.visaType,
      status: app.status, branch: app.branch, createdAt: app.createdAt,
    },
    applicant: {
      firstName: app.firstName, middleName: app.middleName, lastName: app.lastName,
      fullName: [app.firstName, app.middleName, app.lastName].filter(Boolean).join(' '),
      dateOfBirth: app.dateOfBirth, nationality: app.nationality,
      passportNumber: app.passportNumber, passportExpiryDate: app.passportExpiryDate,
      email: app.email, phone: app.phone,
    },
    travel: {
      arrivalDate: app.arrivalDate, returnDate: app.returnDate,
      purposeOfVisit: app.purposeOfVisit, portOfEntry: app.portOfEntry,
    },
    employment: {
      employmentStatus: app.employmentStatus, employerName: app.employerName,
      jobTitle: app.jobTitle, employerAddress: app.employerAddress,
    },
    accommodation: {
      accommodationName: app.accommodationName,
      accommodationAddress: app.accommodationAddress,
    },
    financialDeclarations: {
      monthlyIncome: app.monthlyIncome,
    },
    documentChecks,
  }
}
