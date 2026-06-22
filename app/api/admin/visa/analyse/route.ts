import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'
import OpenAI                        from 'openai'
import { getAdminSession }           from '@/lib/admin-auth'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

// ─── JSON enforcement ─────────────────────────────────────────────────────────

const JSON_ONLY = `

CRITICAL: Respond with valid JSON only. No markdown fences, no prose, no explanation — just the JSON object. Start with { and end with }. If the document is unreadable return: {"error":"cannot read document","analysable":false}`

// ─── Retry on 529 overload ────────────────────────────────────────────────────

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  const delays = [1200, 2500, 5000]
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isOverloaded = (err as { status?: number })?.status === 529
      if (isOverloaded && attempt < maxRetries) {
        await new Promise<void>(r => setTimeout(r, delays[attempt] ?? 5000))
        continue
      }
      throw err
    }
  }
  throw new Error('Max retries exceeded')
}

// ─── Robust JSON extractor ────────────────────────────────────────────────────

function extractJSON<T>(text: string): T {
  // T1: direct parse
  try { return JSON.parse(text) as T } catch {}
  // T2: strip markdown fences
  const stripped = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(stripped) as T } catch {}
  // T3: extract first complete {...} block with bracket counting
  const start = text.indexOf('{')
  if (start !== -1) {
    let depth = 0; let inStr = false; let esc = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (esc)              { esc = false; continue }
      if (ch === '\\' && inStr) { esc = true; continue }
      if (ch === '"')           { inStr = !inStr; continue }
      if (inStr)                continue
      if (ch === '{')           depth++
      else if (ch === '}')      { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)) as T } catch {} ; break } }
    }
  }
  throw new Error('Could not extract valid JSON from AI response')
}

// ─── PDF text for OpenAI text-mode fallback ───────────────────────────────────

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('pdf-parse') as any
    const pp  = mod.default ?? mod
    return ((await pp(buffer)).text ?? '').trim()
  } catch { return '' }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form          = await req.formData()
    const file          = (form.get('file') ?? form.get('statement')) as File | null
    const visaType      = ((form.get('visaType')        as string) ?? 'UK Visitor').trim()
    const passport      = ((form.get('passportCountry') as string) ?? 'Nigerian').trim()
    const applicantName = ((form.get('applicantName')   as string) ?? 'Applicant').trim()
    const appId         = form.get('applicationId') as string | null

    if (!file)                       return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 50 MB' }, { status: 413 })

    const buffer    = Buffer.from(await file.arrayBuffer())
    const base64    = buffer.toString('base64')
    const isImage   = file.type.startsWith('image/')
    const mediaType = isImage
      ? (file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp')
      : 'application/pdf'

    const docBlock = {
      type:   isImage ? 'image' : 'document',
      source: { type: 'base64', media_type: mediaType, data: base64 },
    } as Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam

    const systemPrompt = `You are VisaFortress AI — a forensic financial analyst specialising in visa bank statement review for ${passport} applicants applying for a ${visaType} visa. You combine the knowledge of a senior UK visa caseworker, a certified forensic accountant, and an AML compliance officer.` + JSON_ONLY

    const userPrompt = buildUserPrompt(applicantName, passport, visaType)

    let analysis: unknown | null   = null
    let claudeError: string | null = null

    // ── Try Claude ─────────────────────────────────────────────────────────────

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

        // Pass 1: extract raw transaction data (non-fatal)
        let txnContext = 'Document passed directly to analysis.'
        try {
          const e1 = await callWithRetry(() => claude.messages.create({
            model: 'claude-sonnet-4-6', max_tokens: 3000, temperature: 0,
            system: 'You are a precise document data extractor. Return only valid JSON — no prose.' + JSON_ONLY,
            messages: [{ role: 'user', content: [docBlock, { type: 'text', text: EXTRACTION_PROMPT }] }],
          }))
          const eText = e1.content[0]?.type === 'text' ? e1.content[0].text : ''
          const eData = extractJSON<Record<string, unknown>>(eText)
          const txns  = Array.isArray(eData.transactions) ? eData.transactions.length : 0
          txnContext  = `Extracted ${txns} transactions. Currency: ${eData.currency ?? '?'}. Period: ${eData.statementPeriod ?? '?'}. Closing balance: ${eData.closingBalance ?? '?'}.`
        } catch { /* non-fatal */ }

        // Pass 2: full forensic analysis
        const a2 = await callWithRetry(() => claude.messages.create({
          model: 'claude-sonnet-4-6', max_tokens: 6000, temperature: 0,
          system: systemPrompt,
          messages: [{ role: 'user', content: [docBlock, { type: 'text', text: userPrompt(txnContext) }] }],
        }))
        const aText = a2.content[0]?.type === 'text' ? a2.content[0].text : ''
        analysis    = extractJSON<unknown>(aText)
        console.log('[VF] Claude succeeded')
      } catch (e) {
        claudeError = e instanceof Error ? e.message : String(e)
        console.warn('[VF] Claude failed:', claudeError.slice(0, 200))
      }
    } else {
      claudeError = 'ANTHROPIC_API_KEY not configured'
    }

    // ── OpenAI GPT-4o fallback ─────────────────────────────────────────────────

    if (!analysis) {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({
          success: false,
          error:   `Claude failed and no OpenAI fallback is configured. Claude error: ${claudeError}`,
        }, { status: 502 })
      }

      console.log('[VF] Falling back to OpenAI GPT-4o')
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

      try {
        if (isImage) {
          // GPT-4o vision — send image directly
          const oRes = await openai.chat.completions.create({
            model: 'gpt-4o', max_tokens: 6000, temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt.replace(JSON_ONLY, '') + '\n\nReturn only valid JSON.' },
              { role: 'user',   content: [
                { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
                { type: 'text', text: userPrompt('Read directly from the image.') },
              ]},
            ],
          })
          analysis = extractJSON<unknown>(oRes.choices[0]?.message?.content ?? '{}')
        } else {
          // PDF — extract text then send
          const pdfText = await extractPdfText(buffer)
          if (!pdfText || pdfText.length < 100) {
            return NextResponse.json({
              success: false,
              error:   'Claude is unavailable and text could not be extracted from this PDF. Please upload a digital (not scanned) bank statement.',
            }, { status: 422 })
          }
          const oRes = await openai.chat.completions.create({
            model: 'gpt-4o', max_tokens: 6000, temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt.replace(JSON_ONLY, '') + '\n\nReturn only valid JSON.' },
              { role: 'user',   content: userPrompt(`Bank statement text:\n${pdfText.slice(0, 14000)}`) },
            ],
          })
          analysis = extractJSON<unknown>(oRes.choices[0]?.message?.content ?? '{}')
        }
        console.log('[VF] OpenAI succeeded')
      } catch (oErr) {
        const oMsg = oErr instanceof Error ? oErr.message : String(oErr)
        console.error('[VF] OpenAI also failed:', oMsg.slice(0, 200))
        return NextResponse.json({
          success: false,
          error:   `Both AI providers failed. Claude: ${claudeError}. OpenAI: ${oMsg}`,
        }, { status: 502 })
      }
    }

    return NextResponse.json({
      success: true, analysis, applicantName, visaType, passport,
      applicationId: appId ?? null,
      analysedAt:    new Date().toISOString(),
    })
  } catch (fatal) {
    const msg = fatal instanceof Error ? fatal.message : String(fatal)
    console.error('[VF] Unhandled error:', msg)
    return NextResponse.json({ success: false, error: `Analysis failed: ${msg}` }, { status: 500 })
  }
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `Extract all data from this bank statement. Return JSON:
{
  "currency": "GBP",
  "bankName": "Example Bank",
  "accountHolder": "Jane Doe",
  "statementPeriod": "01 Jan 2024 - 31 Mar 2024",
  "openingBalance": 5000.00,
  "closingBalance": 4800.00,
  "totalCredits": 12000.00,
  "totalDebits": 11200.00,
  "transactionCount": 45,
  "transactions": [
    { "date": "01 Jan 2024", "description": "SALARY ACME LTD", "credit": 3000.00, "debit": null, "balance": 8000.00, "flagged": false }
  ]
}`

function buildUserPrompt(applicantName: string, passport: string, visaType: string) {
  return (txnContext: string) => `Applicant: ${applicantName} | Passport: ${passport} | Visa applied: ${visaType}
Context from extraction: ${txnContext}

Analyse this bank statement and return a JSON object with EXACTLY these fields (replace example values with real analysis):
{
  "summary": {
    "accountHolder": "Full Name",
    "bank": "Bank Name",
    "currency": "GBP",
    "period": "Jan 2024 - Mar 2024",
    "months": 3,
    "openingBalance": 5000.00,
    "closingBalance": 4800.00,
    "averageBalance": 6500.00,
    "lowestBalance": 1200.00,
    "highestBalance": 12000.00,
    "totalCredits": 15000.00,
    "totalDebits": 14200.00,
    "transactionCount": 45,
    "regularIncomeDetected": true,
    "averageMonthlySalary": 3000.00
  },
  "approvalScore": 72,
  "scoreGrade": "B",
  "approvalLikelihood": "MEDIUM",
  "embassyEye": {
    "visaType": "${visaType}",
    "passport": "${passport}",
    "officerVerdict": "Two-to-three sentence officer verdict here.",
    "keyStrengths": ["Regular salary credits", "Stable account history"],
    "keyWeaknesses": ["Low average balance relative to trip cost"],
    "similarCasesApprovalRate": 65
  },
  "redFlags": [
    { "id": "rf1", "type": "BALANCE_PARKING", "title": "Flag title", "description": "Detailed description", "severity": "HIGH", "transaction": "01 Jan 2024 CASH DEPOSIT 5000.00", "embassyInterpretation": "How an officer interprets this" }
  ],
  "positives": [
    { "title": "Regular Income", "description": "Consistent monthly salary credited" }
  ],
  "cashFlowAnalysis": {
    "incomeConsistency": "Regular monthly salary from ACME Ltd",
    "spendingPattern": "Consistent everyday spending with no unusual spikes",
    "savingsRate": 12,
    "financialStability": "Stable with moderate reserves",
    "balanceTrend": "STABLE"
  },
  "recommendation": "Single paragraph recommendation for the visa officer.",
  "suggestedActions": [
    { "priority": "HIGH", "action": "Provide 3 months payslips", "reason": "To corroborate salary credits" }
  ],
  "documentsToAdd": ["3 months payslips", "Employer reference letter"],
  "transactions": [
    { "date": "01 Jan 2024", "description": "SALARY ACME LTD", "credit": 3000.00, "debit": null, "balance": 8000.00, "flagged": false, "flagReason": null }
  ]
}

Rules:
- scoreGrade must be one of: A B C D F
- approvalLikelihood must be one of: HIGH MEDIUM LOW VERY_LOW
- severity in redFlags must be one of: HIGH MEDIUM LOW
- priority in suggestedActions must be one of: URGENT HIGH MEDIUM LOW
- balanceTrend must be one of: IMPROVING STABLE DECLINING`
}
