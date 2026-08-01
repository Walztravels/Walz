import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendVisaStatusUpdate, sendApplicationFormLink } from '@/lib/email-visa'
import { getAdminSession } from '@/lib/admin-auth'

type Params = { params: Promise<{ id: string }> }

// Explicit select covering all VisaApplication scalar fields that exist in the DB.
// Avoids columns added to schema.prisma but not yet migrated (timeline, decisionNotes,
// govtFeeInstructions, pdfUrl, openedAt, startedAt, viewCount, appointment*, lastEmailSentAt).
// After running the full SQL migration these can go back to a bare include.
const APP_SELECT = {
  id:              true,
  referenceNumber: true,
  userId:          true,
  destinationIso2: true,
  visaType:        true,
  firstName:       true,
  middleName:      true,
  lastName:        true,
  dateOfBirth:     true,
  sex:             true,
  placeOfBirth:    true,
  nationality:     true,
  maritalStatus:   true,
  passportNumber:      true,
  passportType:        true,
  passportIssueDate:   true,
  passportExpiryDate:  true,
  issuingAuthority:    true,
  issuingCountry:      true,
  phone:        true,
  email:        true,
  homeAddress:  true,
  homeAddress2: true,
  city:         true,
  stateRegion:  true,
  country:      true,
  postalCode:   true,
  employmentStatus: true,
  employerName:     true,
  jobTitle:         true,
  employerAddress:  true,
  monthlyIncome:    true,
  arrivalDate:          true,
  returnDate:           true,
  purposeOfVisit:       true,
  accommodationName:    true,
  accommodationAddress: true,
  portOfEntry:          true,
  previousRefusal:        true,
  previousRefusalDetails: true,
  previousVisits:         true,
  previousVisitDetails:   true,
  criminalRecord:       true,
  communicableDisease:  true,
  deportedBefore:       true,
  countrySpecific: true,
  declarationAccurate:  true,
  declarationAuthorise: true,
  declarationFeePolicy: true,
  status:       true,
  statusMessage: true,
  isDraft:      true,
  initiatedBy:  true,
  assignedTo:        true,
  assignedOfficerId: true,
  branch:            true,
  embassyReference:    true,
  appointmentDate:     true,
  appointmentLocation: true,
  appointmentNotes:    true,
  lastEmailSentAt:     true,
  submissionDate:      true,
  decisionDate:        true,
  serviceFeePaid:         true,
  serviceFeeAmount:       true,
  serviceFeeCurrency:     true,
  stripePaymentIntentId:  true,
  govtFeePaid:            true,
  govtFeeAmount:          true,
  createdAt: true,
  updatedAt: true,
  user:   { select: { name: true, email: true } },
  notes:  { orderBy: { createdAt: 'desc' } as const },
  tokens: { orderBy: { createdAt: 'desc' } as const },
} as const

// GET /api/admin/visa-applications/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const app = await prisma.visaApplication.findUnique({
    where:  { id },
    select: APP_SELECT,
  })
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch bank_statement_* columns — added via raw SQL, not in Prisma schema
  const { data: bankData } = await getSupabaseAdmin()
    .from('visa_applications')
    .select('bank_statement_url, bank_statement_admin_url, bank_statement_analysis, bank_statement_analyzed_at, bank_statement_uploaded_by')
    .eq('id', id)
    .single()

  // Fetch all documents uploaded via Request Documents flow for this visa application
  const docRequests = await prisma.documentRequest.findMany({
    where: { visaAppId: id },
    select: {
      id: true,
      clientName: true,
      uploads: {
        select: {
          id: true,
          docName: true,
          category: true,
          fileUrl: true,
          fileName: true,
          mimeType: true,
          uploadedAt: true,
          status: true,
        },
      },
    },
  })

  const requestDocuments = docRequests.flatMap(req =>
    req.uploads.map(u => ({
      id:          u.id,
      source:      'request_documents' as const,
      docName:     u.docName,
      category:    u.category,
      fileUrl:     u.fileUrl,
      fileName:    u.fileName,
      mimeType:    u.mimeType,
      uploadedAt:  u.uploadedAt,
      status:      u.status,
    }))
  )

  return NextResponse.json({
    application: {
      ...app,
      bank_statement_url:         bankData?.bank_statement_url         ?? null,
      bank_statement_admin_url:   bankData?.bank_statement_admin_url   ?? null,
      bank_statement_analysis:    bankData?.bank_statement_analysis    ?? null,
      bank_statement_analyzed_at: bankData?.bank_statement_analyzed_at ?? null,
      bank_statement_uploaded_by: bankData?.bank_statement_uploaded_by ?? null,
      uploaded_documents:         requestDocuments,
    },
  })
}

// PATCH /api/admin/visa-applications/[id] — update any field including status
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { _addNote, _sendFormLink, ...fields } = body

  // Handle "send form link to client" action
  if (_sendFormLink) {
    const { clientEmail, clientName, personalMessage } = _sendFormLink
    const app = await prisma.visaApplication.findUnique({
      where:  { id },
      select: { id: true, email: true, referenceNumber: true, destinationIso2: true, visaType: true, firstName: true, lastName: true },
    })
    if (app && clientEmail) {
      try { await sendApplicationFormLink(app as any, clientEmail, clientName, personalMessage) } catch (e) { console.error(e) }
    }
    return NextResponse.json({ ok: true })
  }

  // Explicit whitelist — only known Prisma scalar columns reach the DB.
  // Anything not listed here (relations, bank_statement_*, duplicatedFrom, etc.) is silently dropped.
  const SCALAR_FIELDS = new Set([
    'destinationIso2', 'visaType',
    'firstName', 'middleName', 'lastName', 'dateOfBirth', 'sex', 'placeOfBirth', 'nationality', 'maritalStatus',
    'passportNumber', 'passportType', 'passportIssueDate', 'passportExpiryDate', 'issuingAuthority', 'issuingCountry',
    'phone', 'email', 'homeAddress', 'homeAddress2', 'city', 'stateRegion', 'country', 'postalCode',
    'employmentStatus', 'employerName', 'jobTitle', 'employerAddress', 'monthlyIncome',
    'arrivalDate', 'returnDate', 'purposeOfVisit', 'accommodationName', 'accommodationAddress', 'portOfEntry',
    'previousRefusal', 'previousRefusalDetails', 'previousVisits', 'previousVisitDetails',
    'criminalRecord', 'communicableDisease', 'deportedBefore',
    'countrySpecific',
    'declarationAccurate', 'declarationAuthorise', 'declarationFeePolicy',
    'status', 'statusMessage', 'isDraft', 'initiatedBy',
    'assignedTo', 'assignedOfficerId', 'branch', 'embassyReference',
    'appointmentDate', 'appointmentLocation', 'appointmentNotes', 'lastEmailSentAt',
    'submissionDate', 'decisionDate', 'decisionNotes', 'govtFeeInstructions',
    'serviceFeePaid', 'serviceFeeAmount', 'serviceFeeCurrency', 'stripePaymentIntentId',
    'govtFeePaid', 'govtFeeAmount',
    'pdfUrl', 'familyGroupId', 'relationship', 'isMinor', 'guardianId',
    'openedAt', 'startedAt', 'viewCount', 'birthdayEmailSentAt', 'marketingOptOut',
    'duplicatedFromId',
  ])
  const DATE_FIELDS = new Set([
    'dateOfBirth', 'passportIssueDate', 'passportExpiryDate',
    'arrivalDate', 'returnDate', 'submissionDate', 'decisionDate',
    'appointmentDate', 'lastEmailSentAt', 'birthdayEmailSentAt', 'openedAt', 'startedAt',
  ])
  const data: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    if (!SCALAR_FIELDS.has(key)) continue
    if (DATE_FIELDS.has(key)) {
      data[key] = value ? new Date(value as string) : null
    } else {
      data[key] = value
    }
  }

  // When status changes away from draft, mark isDraft=false
  if (data.status && data.status !== 'draft') data.isDraft = false

  let updated
  try {
    updated = await prisma.visaApplication.update({
      where:  { id },
      data:   { ...data, updatedAt: new Date() },
      select: APP_SELECT,
    })
  } catch (e) {
    console.error('[VisaApp PATCH] Prisma error:', e)
    return NextResponse.json({ error: 'Failed to save — please try again or contact support' }, { status: 500 })
  }

  // If status changed, send email notification to client
  if (fields.status && fields.status !== 'draft') {
    const emailTo = updated.email ?? updated.user?.email
    if (emailTo) {
      try {
        await sendVisaStatusUpdate({ ...updated, email: emailTo } as any)
      } catch (e) {
        console.error('[VisaStatus] Email failed:', e)
      }
    }
  }

  return NextResponse.json({ application: updated })
}
