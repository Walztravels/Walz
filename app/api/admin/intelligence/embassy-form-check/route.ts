import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FORM_TYPES = [
  'VAF1A (UK Standard Visitor)',
  'VAF2 (UK Family Visitor)',
  'DS-160 (USA Non-Immigrant)',
  'IMM5257 (Canada Visitor)',
  'Schengen Visa Application',
  'UAE Tourist Visa Form',
  'Australia Tourist Visa (600)',
  'Ireland Short Stay C',
  'Other Embassy Form',
]

function buildCrossCheckPrompt(formType: string, application: Record<string, unknown>): string {
  return `You are a senior visa compliance officer at an immigration consultancy. You are cross-referencing a completed embassy application form against the client's verified database record.

FORM TYPE: ${formType}

CLIENT DATABASE RECORD:
${JSON.stringify(application, null, 2)}

You have been given a completed ${formType} form image/document. Analyse EVERY field on the form and cross-reference against the client's database record above.

Return a JSON object with this exact structure:
{
  "overallRisk": "<low|medium|high|critical>",
  "summaryStatement": "<2-3 sentence overall assessment>",
  "criticalErrors": [
    {
      "field": "<form field name>",
      "formValue": "<what the form says>",
      "expectedValue": "<what it should say from DB>",
      "embassyImpact": "<how this could affect the visa decision>",
      "correction": "<exact corrected text>"
    }
  ],
  "warnings": [
    {
      "field": "<form field name>",
      "issue": "<description of concern>",
      "suggestion": "<recommended fix>"
    }
  ],
  "fieldVerifications": [
    {
      "field": "<field name>",
      "status": "<correct|incorrect|warning|not_checked>",
      "formValue": "<value on form>",
      "dbValue": "<value from database>"
    }
  ],
  "missingFields": ["<list of required fields that are blank>"],
  "recommendedNextSteps": ["<ordered list of actions before submitting>"],
  "embassyReadiness": "<not_ready|needs_corrections|almost_ready|ready_to_submit>"
}

Be exhaustive. Embassy officers reject applications for minor inconsistencies. Return ONLY the JSON object.`
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData      = await req.formData()
    const file          = formData.get('file')          as File | null
    const formType      = formData.get('formType')      as string ?? 'Schengen Visa Application'
    const applicationId = formData.get('applicationId') as string ?? ''

    if (!applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 })

    const application = await prisma.visaApplication.findUnique({ where: { id: applicationId } })
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

    const appData: Record<string, unknown> = {
      referenceNumber:     application.referenceNumber,
      firstName:           application.firstName,
      middleName:          application.middleName,
      lastName:            application.lastName,
      dateOfBirth:         application.dateOfBirth,
      sex:                 application.sex,
      nationality:         application.nationality,
      passportNumber:      application.passportNumber,
      passportType:        application.passportType,
      passportExpiryDate:  application.passportExpiryDate,
      passportIssueDate:   application.passportIssueDate,
      issuingCountry:      application.issuingCountry,
      placeOfBirth:        application.placeOfBirth,
      maritalStatus:       application.maritalStatus,
      phone:               application.phone,
      email:               application.email,
      homeAddress:         application.homeAddress,
      city:                application.city,
      country:             application.country,
      postalCode:          application.postalCode,
      employmentStatus:    application.employmentStatus,
      employerName:        application.employerName,
      jobTitle:            application.jobTitle,
      employerAddress:     application.employerAddress,
      monthlyIncome:       application.monthlyIncome,
      destinationCountry:  application.destinationIso2,
      visaType:            application.visaType,
      arrivalDate:         application.arrivalDate,
      returnDate:          application.returnDate,
      purposeOfVisit:      application.purposeOfVisit,
      accommodationName:   application.accommodationName,
      previousRefusal:     application.previousRefusal,
      previousVisits:      application.previousVisits,
    }

    let result: Record<string, unknown> = {}

    if (file && file.size > 0) {
      const buffer    = await file.arrayBuffer()
      const base64    = Buffer.from(buffer).toString('base64')
      const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      const isPdf     = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

      if (!isPdf) {
        const res = await anthropic.messages.create({
          model:      'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: buildCrossCheckPrompt(formType, appData) },
            ],
          }],
        })
        const text = res.content[0].type === 'text' ? res.content[0].text.trim() : '{}'
        try {
          const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
          result = JSON.parse(cleaned)
        } catch {
          result = { overallRisk: 'medium', summaryStatement: text.slice(0, 400), criticalErrors: [], warnings: [] }
        }
      } else {
        // PDF cross-check without vision
        const res = await anthropic.messages.create({
          model:      'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `A completed ${formType} PDF form was uploaded. I cannot read PDFs directly yet. Based on the client's database record below, identify all fields that commonly cause issues on ${formType} forms and what to verify:\n\n${JSON.stringify(appData, null, 2)}\n\n${buildCrossCheckPrompt(formType, appData)}`,
          }],
        })
        const text = res.content[0].type === 'text' ? res.content[0].text.trim() : '{}'
        try {
          const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
          result = JSON.parse(cleaned)
        } catch {
          result = { overallRisk: 'medium', summaryStatement: 'PDF analysis — key fields identified for manual review.', criticalErrors: [], warnings: [] }
        }
      }
    } else {
      // No file — do a pre-check based on DB data alone
      const res = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `No form image was uploaded. Based solely on the client's database record below, identify what information is missing or potentially problematic before completing a ${formType} form.\n\n${JSON.stringify(appData, null, 2)}\n\n${buildCrossCheckPrompt(formType, appData)}`,
        }],
      })
      const text = res.content[0].type === 'text' ? res.content[0].text.trim() : '{}'
      try {
        const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
        result = JSON.parse(cleaned)
      } catch {
        result = { overallRisk: 'medium', summaryStatement: text.slice(0, 400), criticalErrors: [], warnings: [] }
      }
    }

    return NextResponse.json({
      result,
      application: appData,
      formType,
      formTypes: FORM_TYPES,
    })
  } catch (e) {
    console.error('[embassy-form-check]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ formTypes: FORM_TYPES })
}
