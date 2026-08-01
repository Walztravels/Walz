import prisma from '@/lib/db'
import { generateVisaRef } from '@/lib/visa-config'

// Categories that are destination-specific and should NOT be carried over
const DESTINATION_SPECIFIC_CATEGORIES = [
  'Cover Letter',
  'Invitation Letter',
  'Hotel Booking',
  'Accommodation',
  'Flight Booking',
  'Travel Itinerary',
  'Visa Application Form',
]

export interface DuplicateOptions {
  sourceId: string
  destinationIso2: string
  visaType?: string
  initiatedBy: 'admin' | 'client'
  authorName: string
  userId?: string | null
}

export interface DuplicateResult {
  newApp: { id: string; referenceNumber: string; destinationIso2: string; visaType: string }
  requirementsDelta: { added: string[]; removed: string[]; newDestDocs: string[]; oldDestDocs: string[] }
  documentsCarried: number
}

export async function duplicateVisaApplication(opts: DuplicateOptions): Promise<DuplicateResult> {
  const { sourceId, destinationIso2, visaType, initiatedBy, authorName, userId } = opts

  // Load source application
  const source = await prisma.visaApplication.findUnique({
    where: { id: sourceId },
    include: {
      notes: false,
      tokens: false,
    },
  })
  if (!source) throw new Error('Source application not found')

  // Load requirements for both destinations to compute delta
  const [oldPortal, newPortal] = await Promise.all([
    prisma.countryPortal.findUnique({ where: { destinationIso2: source.destinationIso2 }, select: { requiredDocuments: true } }),
    prisma.countryPortal.findUnique({ where: { destinationIso2 }, select: { requiredDocuments: true } }),
  ])
  const oldDocs = oldPortal?.requiredDocuments ?? []
  const newDocs = newPortal?.requiredDocuments ?? []
  const added   = newDocs.filter(d => !oldDocs.includes(d))
  const removed = oldDocs.filter(d => !newDocs.includes(d))

  // Generate new reference
  let referenceNumber = generateVisaRef()
  // Ensure uniqueness (loop on collision, extremely rare)
  let exists = await prisma.visaApplication.findUnique({ where: { referenceNumber } })
  while (exists) {
    referenceNumber = generateVisaRef()
    exists = await prisma.visaApplication.findUnique({ where: { referenceNumber } })
  }

  // Create new application — person-level fields only; destination/record fields are reset
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newApp = await (prisma.visaApplication.create as any)({
    data: {
      referenceNumber,
      destinationIso2,
      visaType: visaType ?? 'tourist',
      initiatedBy,
      status: 'draft',
      isDraft: true,
      duplicatedFromId: sourceId,

      // Person-level fields (carried over)
      userId:      userId ?? source.userId,
      clientAccountId: source.clientAccountId,
      firstName:   source.firstName,
      middleName:  source.middleName,
      lastName:    source.lastName,
      dateOfBirth: source.dateOfBirth,
      sex:         source.sex,
      placeOfBirth: source.placeOfBirth,
      nationality: source.nationality,
      maritalStatus: source.maritalStatus,
      passportNumber: source.passportNumber,
      passportType:   source.passportType,
      passportIssueDate:  source.passportIssueDate,
      passportExpiryDate: source.passportExpiryDate,
      issuingAuthority: source.issuingAuthority,
      issuingCountry:   source.issuingCountry,
      phone:        source.phone,
      email:        source.email,
      homeAddress:  source.homeAddress,
      homeAddress2: source.homeAddress2,
      city:         source.city,
      stateRegion:  source.stateRegion,
      country:      source.country,
      postalCode:   source.postalCode,
      employmentStatus: source.employmentStatus,
      employerName:     source.employerName,
      jobTitle:         source.jobTitle,
      employerAddress:  source.employerAddress,
      monthlyIncome:    source.monthlyIncome,
      previousRefusal:        source.previousRefusal,
      previousRefusalDetails: source.previousRefusalDetails,
      previousVisits:         source.previousVisits,
      previousVisitDetails:   source.previousVisitDetails,
      criminalRecord:      source.criminalRecord,
      communicableDisease: source.communicableDisease,
      deportedBefore:      source.deportedBefore,

      // Destination-specific fields left at defaults (not copied):
      // arrivalDate, returnDate, purposeOfVisit, accommodationName, accommodationAddress,
      // portOfEntry, countrySpecific, declarationAccurate, declarationAuthorise,
      // declarationFeePolicy, embassyReference, submissionDate, decisionDate, etc.
    },
    select: { id: true, referenceNumber: true, destinationIso2: true, visaType: true },
  })

  // Add audit note
  await prisma.visaApplicationNote.create({
    data: {
      applicationId: newApp.id,
      authorName,
      content: `Application duplicated from ${source.referenceNumber} (${source.destinationIso2}) by ${authorName}. New destination: ${destinationIso2}.`,
    },
  })

  // Also note on the source application
  await prisma.visaApplicationNote.create({
    data: {
      applicationId: sourceId,
      authorName,
      content: `Application duplicated to new destination ${destinationIso2} — new ref: ${referenceNumber}. Initiated by ${authorName}.`,
    },
  })

  // Carry over DocumentUpload rows by reference (same fileUrl/fileKey), skip destination-specific categories
  const docRequests = await prisma.documentRequest.findMany({
    where: { visaAppId: sourceId },
    include: { uploads: true },
  })

  let documentsCarried = 0
  for (const req of docRequests) {
    const eligibleUploads = req.uploads.filter(
      u => !DESTINATION_SPECIFIC_CATEGORIES.some(
        cat => u.category.toLowerCase().includes(cat.toLowerCase())
          || u.docName.toLowerCase().includes(cat.toLowerCase())
      )
    )
    if (eligibleUploads.length === 0) continue

    const newReq = await prisma.documentRequest.create({
      data: {
        visaAppId:    newApp.id,
        clientEmail:  req.clientEmail,
        clientName:   req.clientName,
        requestedBy:  req.requestedBy,
        requestedDocs: req.requestedDocs as object,
        message:      req.message,
        expiresAt:    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        totalRequired: eligibleUploads.length,
      },
    })

    for (const upload of eligibleUploads) {
      await prisma.documentUpload.create({
        data: {
          requestId: newReq.id,
          docName:   upload.docName,
          category:  upload.category,
          fileUrl:   upload.fileUrl,
          fileKey:   upload.fileKey,
          fileName:  upload.fileName,
          fileSize:  upload.fileSize,
          mimeType:  upload.mimeType,
          status:    'pending', // reset — needs re-review for new destination
        },
      })
      documentsCarried++
    }
  }

  return {
    newApp,
    requirementsDelta: { added, removed, newDestDocs: newDocs, oldDestDocs: oldDocs },
    documentsCarried,
  }
}
