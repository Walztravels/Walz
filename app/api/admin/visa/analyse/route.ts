import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'
import { getAdminSession }           from '@/lib/admin-auth'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

// ONLY POST — no GET export.
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI service not configured — add ANTHROPIC_API_KEY to Vercel env vars' },
      { status: 503 },
    )
  }

  const form          = await req.formData()
  const file          = (form.get('file') ?? form.get('statement')) as File | null
  const visaType      = (form.get('visaType')        as string) ?? 'UK Visitor'
  const passport      = (form.get('passportCountry') as string) ?? 'Nigerian'
  const applicantName = (form.get('applicantName')   as string) ?? 'Applicant'
  const appId         = form.get('applicationId')     as string | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided. Use field: file or statement' }, { status: 400 })
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 413 })
  }

  const buffer  = Buffer.from(await file.arrayBuffer())
  const base64  = buffer.toString('base64')
  const isImage = file.type.startsWith('image/')

  const mediaType = isImage
    ? (file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp')
    : 'application/pdf'

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role:    'user',
        content: [
          {
            type:   isImage ? 'image' : 'document',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          } as Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam,
          { type: 'text', text: buildPrompt(visaType, passport, applicantName) },
        ],
      }],
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Claude analysis failed: ${msg}` }, { status: 502 })
  }

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const clean    = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    const analysis = JSON.parse(clean)
    return NextResponse.json({
      success:       true,
      analysis,
      applicantName,
      visaType,
      passport,
      applicationId: appId ?? null,
      analysedAt:    new Date().toISOString(),
      tokensUsed:    { input: response.usage.input_tokens, output: response.usage.output_tokens },
    })
  } catch {
    return NextResponse.json({
      success:    false,
      rawText,
      error:      'AI returned non-JSON — raw text included',
      analysedAt: new Date().toISOString(),
    }, { status: 422 })
  }
}

function buildPrompt(visaType: string, passport: string, applicantName: string): string {
  return `You are VisaFortress AI analysing a bank statement for ${applicantName}, a ${passport} passport holder applying for a ${visaType} visa.
Think like both a visa officer AND a financial forensic analyst. Be thorough, critical, and accurate.
Return ONLY valid JSON (no markdown fences, no commentary outside the JSON):
{
  "summary": {
    "accountHolder": string|null,
    "bank": string|null,
    "currency": string,
    "period": string,
    "months": number,
    "openingBalance": number,
    "closingBalance": number,
    "averageBalance": number,
    "lowestBalance": number,
    "highestBalance": number,
    "totalCredits": number,
    "totalDebits": number,
    "transactionCount": number,
    "regularIncomeDetected": boolean,
    "averageMonthlySalary": number
  },
  "approvalScore": number (0-100),
  "scoreGrade": "A"|"B"|"C"|"D"|"F",
  "approvalLikelihood": "HIGH"|"MEDIUM"|"LOW"|"VERY_LOW",
  "embassyEye": {
    "visaType": string,
    "passport": string,
    "officerVerdict": string,
    "keyStrengths": string[],
    "keyWeaknesses": string[],
    "similarCasesApprovalRate": number
  },
  "redFlags": [
    {
      "id": string,
      "type": string,
      "title": string,
      "description": string,
      "severity": "HIGH"|"MEDIUM"|"LOW",
      "transaction": string|null,
      "embassyInterpretation": string
    }
  ],
  "positives": [{ "title": string, "description": string }],
  "cashFlowAnalysis": {
    "incomeConsistency": string,
    "spendingPattern": string,
    "savingsRate": number,
    "financialStability": string,
    "balanceTrend": string
  },
  "recommendation": string,
  "suggestedActions": [
    { "priority": "URGENT"|"HIGH"|"MEDIUM"|"LOW", "action": string, "reason": string }
  ],
  "documentsToAdd": string[],
  "transactions": [
    {
      "date": string,
      "description": string,
      "credit": number|null,
      "debit": number|null,
      "balance": number|null,
      "flagged": boolean,
      "flagReason": string|null
    }
  ]
}`
}
