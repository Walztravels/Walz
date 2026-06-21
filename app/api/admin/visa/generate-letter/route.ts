import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdminSession } from '@/lib/admin-auth'

export const runtime     = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI service not configured — add ANTHROPIC_API_KEY to Vercel env vars' },
      { status: 503 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const {
    letterType,
    clientName,
    visaType      = 'UK Visitor',
    passport      = 'Nigerian',
    analysis,
    customContext = '',
    travelDate   = '',
    returnDate   = '',
    tripPurpose  = '',
  } = body as Record<string, unknown>

  if (!letterType || !clientName) {
    return NextResponse.json({ error: 'letterType and clientName are required' }, { status: 400 })
  }

  const prompt = buildLetterPrompt({
    letterType:    letterType   as string,
    clientName:    clientName   as string,
    visaType:      visaType     as string,
    passport:      passport     as string,
    analysis,
    customContext: customContext as string,
    travelDate:   travelDate    as string,
    returnDate:   returnDate     as string,
    tripPurpose:  tripPurpose   as string,
  })

  let response: Anthropic.Message
  try {
    response = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Letter generation failed: ${msg}` }, { status: 502 })
  }

  const letter = response.content[0].type === 'text' ? response.content[0].text : ''

  return NextResponse.json({
    success:     true,
    letter,
    letterType,
    generatedAt: new Date().toISOString(),
  })
}

// ─── Letter prompt builder ────────────────────────────────────────────────────

interface LetterParams {
  letterType:    string
  clientName:    string
  visaType:      string
  passport:      string
  analysis:      unknown
  customContext: string
  travelDate:    string
  returnDate:    string
  tripPurpose:   string
}

function buildLetterPrompt(p: LetterParams): string {
  const ctx = p.analysis ? JSON.stringify(p.analysis, null, 2) : 'No analysis data provided'

  const shared = `Client: ${p.clientName}
Passport: ${p.passport}
Visa type: ${p.visaType}
${p.customContext ? `Additional context: ${p.customContext}\n` : ''}
Financial analysis summary:
${ctx}`

  switch (p.letterType) {
    case 'bank_explanation':
      return `Write a formal bank statement explanation letter in British English for a visa applicant.
Signed by the applicant. Addresses any unusual financial activity shown in their statement professionally.
Formal tone, 300-500 words. Start with "Dear Visa Officer," — do not include addresses or dates.
Focus on: explaining legitimate income sources, accounting for any large credits/debits, demonstrating financial stability.
Address HIGH and MEDIUM red flags specifically if present. Do not admit to anything suspicious — frame everything legitimately.

${shared}`

    case 'financial_narrative':
      return `Write a 300-word third-person financial narrative document for a visa applicant.
This is a positive-framing document that profiles their financial health for the embassy.
Professional, factual, no red flags mentioned. Reference specific figures from the analysis.
Highlight: income stability, savings discipline, responsible financial management, ability to fund travel.

${shared}`

    case 'cover_letter':
      return `Write a complete visa cover letter in formal British English.
Travel dates: ${p.travelDate || 'TBD'} — ${p.returnDate || 'TBD'}
Purpose: ${p.tripPurpose || 'Tourism'}
400-500 words. Start with "Dear Visa Officer,"
Include: purpose of visit, travel and return dates, accommodation arrangements, financial means (cite specific balance figures), ties to home country, why they will return.

${shared}`

    case 'funds_declaration':
      return `Write a formal Declaration of Funds document in British English, statutory declaration style.
200-300 words. State: funds available, their legitimate source, and that all information is true.
End with a signature block the applicant signs. Use formal declaratory language.

${shared}`

    case 'employment_letter':
      return `Write a formal employment/self-employment support letter for a visa application.
300-400 words. British English. Confirms: employment status, salary/income, approval to take the travel dates, that the applicant will return to their position.
Reference the financial evidence shown in the bank statement.
If self-employed, write as a business owner's declaration.
${p.customContext ? `Employment details: ${p.customContext}` : ''}

${shared}`

    default:
      return `Write a professional support letter in formal British English for a visa applicant.
300-400 words. Formal tone, addresses the embassy directly. Supports the visa application with financial evidence.

${shared}`
  }
}
