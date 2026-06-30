import { NextRequest, NextResponse } from 'next/server'
import { getAnthropic } from '@/lib/anthropic'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60


const DOC_TYPES = [
  'passport', 'bank_statement', 'payslip', 'employment_letter',
  'utility_bill', 'invitation_letter', 'insurance', 'hotel_booking',
  'flight_itinerary', 'travel_history', 'tax_return', 'business_registration',
]

const ANALYSIS_PROMPT = `You are a senior document forensics expert specialising in immigration and visa document verification.

Analyse the provided document image and return a JSON object with this exact structure:
{
  "authenticityScore": <0-100 integer>,
  "verdict": "<authentic|suspicious|fraudulent>",
  "stampDetected": <true|false>,
  "signatureDetected": <true|false>,
  "holderName": "<extracted full name or null>",
  "documentNumber": "<extracted number or null>",
  "expiryDate": "<YYYY-MM-DD or null>",
  "issuingCountry": "<country name or null>",
  "embassyReadinessRating": "<excellent|good|fair|poor>",
  "flags": [<list of specific concern strings>],
  "officerNotes": "<2-3 sentences about what an immigration officer would notice>",
  "recommendedActions": [<list of actionable steps>],
  "qualityIssues": [<list of scan/image quality problems>],
  "consistencyChecks": {
    "fontConsistency": "<pass|fail|n/a>",
    "stampAuthenticity": "<pass|fail|n/a>",
    "photoIntegrity": "<pass|fail|n/a>",
    "dateSanity": "<pass|fail|n/a>",
    "numericalConsistency": "<pass|fail|n/a>"
  }
}

Rules:
- Score 80-100 = authentic, 50-79 = suspicious, 0-49 = fraudulent
- Be specific about any concerns — vague flags are useless
- If the image is too low quality to analyse, set score 0 and flag "insufficient_image_quality"
- Return ONLY the JSON object, no markdown, no explanation`

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file          = formData.get('file')          as File | null
    const documentType  = formData.get('documentType')  as string ?? 'passport'
    const applicationId = formData.get('applicationId') as string ?? ''
    const fileName      = file?.name ?? (formData.get('fileName') as string) ?? 'unknown'

    let analysisResult: Record<string, unknown> = {}

    if (file && file.size > 0) {
      const buffer      = await file.arrayBuffer()
      const base64Data  = Buffer.from(buffer).toString('base64')
      const mediaType   = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

      const isPdf = file.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

      if (!isPdf) {
        const res = await getAnthropic().messages.create({
          model:      'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
              { type: 'text', text: `Document type: ${documentType}\n\n${ANALYSIS_PROMPT}` },
            ],
          }],
        })
        const text = res.content[0].type === 'text' ? res.content[0].text.trim() : '{}'
        try {
          const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
          analysisResult = JSON.parse(cleaned)
        } catch {
          analysisResult = {
            authenticityScore: 50, verdict: 'suspicious',
            flags: ['parse_error'], officerNotes: text.slice(0, 300),
          }
        }
      } else {
        // PDF — text-based analysis prompt
        const res = await getAnthropic().messages.create({
          model:      'claude-sonnet-4-6',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `A PDF document named "${fileName}" of type "${documentType}" was uploaded for visa application ID "${applicationId}". Based on typical ${documentType.replace(/_/g,' ')} documents for immigration, provide a preliminary assessment. ${ANALYSIS_PROMPT}`,
          }],
        })
        const text = res.content[0].type === 'text' ? res.content[0].text.trim() : '{}'
        try {
          const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
          analysisResult = JSON.parse(cleaned)
        } catch {
          analysisResult = { authenticityScore: 60, verdict: 'suspicious', flags: ['pdf_limited_analysis'] }
        }
      }
    } else {
      // No file — fallback metadata-only check
      analysisResult = {
        authenticityScore: 0, verdict: 'suspicious',
        stampDetected: false, signatureDetected: false,
        flags: ['no_file_uploaded'],
        officerNotes: 'No file was provided for analysis.',
        recommendedActions: ['Upload the actual document file for AI analysis'],
      }
    }

    const score   = Number(analysisResult.authenticityScore ?? 50)
    const verdict = String(analysisResult.verdict ?? (score >= 80 ? 'authentic' : score >= 50 ? 'suspicious' : 'fraudulent'))

    const check = await prisma.documentAuthenticityCheck.create({
      data: {
        applicationId:    applicationId || 'manual',
        documentType,
        fileName,
        verdict,
        authenticityScore: score,
        stampDetected:     Boolean(analysisResult.stampDetected),
        signatureDetected: Boolean(analysisResult.signatureDetected),
        flags:             (analysisResult.flags as string[]) ?? [],
        evidence:          JSON.stringify({
          holderName:            analysisResult.holderName,
          documentNumber:        analysisResult.documentNumber,
          expiryDate:            analysisResult.expiryDate,
          issuingCountry:        analysisResult.issuingCountry,
          embassyReadinessRating: analysisResult.embassyReadinessRating,
          officerNotes:          analysisResult.officerNotes,
          recommendedActions:    analysisResult.recommendedActions,
          qualityIssues:         analysisResult.qualityIssues,
          consistencyChecks:     analysisResult.consistencyChecks,
        }),
        checkedBy: session.email ?? 'admin',
      },
    })

    return NextResponse.json({ check, analysis: analysisResult })
  } catch (e) {
    console.error('[visa-doc-upload]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const applicationId = searchParams.get('applicationId')
  const verdict       = searchParams.get('verdict')

  const where: Record<string, string> = {}
  if (applicationId) where.applicationId = applicationId
  if (verdict)       where.verdict       = verdict

  const checks = await prisma.documentAuthenticityCheck.findMany({
    where,
    orderBy: { checkedAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ checks, docTypes: DOC_TYPES })
}
