import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'
import OpenAI                        from 'openai'
import { getAdminSession }           from '@/lib/admin-auth'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 300

// ─── JSON enforcement ─────────────────────────────────────────────────────────

const JSON_ONLY = `

CRITICAL: You must respond with ONLY a valid JSON object.
- No explanation text before or after the JSON.
- No markdown code blocks. No backticks. No triple backticks.
- Do NOT write "Here is the analysis" or any prose.
- Start your response with { and end with }. Nothing else.
- If the document is unreadable return exactly: {"error":"cannot read document","analysable":false}`

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON<T = unknown>(text: string): T {
  // T1: strip ALL markdown code fences then try direct parse
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim()
  try { return JSON.parse(cleaned) as T } catch {}

  // T2: find outermost { ... } by first { and last }
  const start = cleaned.indexOf('{')
  const end   = cleaned.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    const jsonStr = cleaned.substring(start, end + 1)
    try { return JSON.parse(jsonStr) as T } catch (parseErr) {
      // T3: repair common Claude quirks — trailing commas
      const repaired = jsonStr.replace(/,(\s*[}\]])/g, '$1')
      try { return JSON.parse(repaired) as T } catch {}
      // T4: bracket-count walk to find a balanced sub-object
      let depth = 0; let inStr = false; let esc = false
      for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i]
        if (esc)                  { esc = false; continue }
        if (ch === '\\' && inStr) { esc = true;  continue }
        if (ch === '"')           { inStr = !inStr; continue }
        if (inStr)                continue
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) {
            try { return JSON.parse(cleaned.slice(start, i + 1)) as T } catch {}
            break
          }
        }
      }
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
      throw new Error(`JSON parse failed: ${msg} | Raw (first 300): ${text.substring(0, 300)}`)
    }
  }
  throw new Error(`No JSON object found in AI response. Raw (first 300): ${text.substring(0, 300)}`)
}

// ─── PDF text extraction ─────────────────────────────────────────────────────
// Use pdf-parse via the lib path — bypasses the Vercel test-file crash that
// kills the standard `require('pdf-parse')` import on serverless.

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfLib = require('pdf-parse/lib/pdf-parse.js')
    const data   = await pdfLib(buffer, { max: 0 }) // max: 0 = parse all pages
    const text   = (data.text as string | undefined)?.trim() ?? ''
    console.log(`[VF] pdf-parse extracted ${text.length} chars (${data.numpages ?? '?'} pages)`)
    return text
  } catch (e) {
    console.error('[VF] pdf-parse failed:', e instanceof Error ? e.message : e)
    return ''
  }
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

    const aiModel   = ((form.get('aiModel') as string | null) ?? 'claude') as 'claude' | 'openai'
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

    let analysis: unknown | null = null
    let aiUsed   = ''

    // ── Claude path ────────────────────────────────────────────────────────────

    if (aiModel !== 'openai') {
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({
          success: false,
          error:   'ANTHROPIC_API_KEY is not configured. Select GPT-4o or contact your administrator.',
        }, { status: 503 })
      }
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
        console.log('[VF] Raw Claude response (first 500 chars):', aText.substring(0, 500))
        analysis    = extractJSON<unknown>(aText)
        aiUsed      = 'Claude Sonnet 4.6'
        console.log('[VF] Claude succeeded')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn('[VF] Claude failed:', msg.slice(0, 200))
        return NextResponse.json({
          success: false,
          error:   `Claude analysis failed: ${msg.slice(0, 300)}`,
        }, { status: 502 })
      }
    }

    // ── OpenAI GPT-4o path ─────────────────────────────────────────────────────

    if (aiModel === 'openai') {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({
          success: false,
          error:   'OPENAI_API_KEY is not configured.',
        }, { status: 503 })
      }
      console.log('[VF] Using OpenAI GPT-4o')
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      try {
        if (isImage) {
          const oRes = await openai.chat.completions.create({
            model: 'gpt-4o', max_tokens: 6000, temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt.replace(JSON_ONLY, '') + '\n\nReturn only valid JSON.' },
              { role: 'user', content: [
                { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
                { type: 'text', text: userPrompt('Read directly from the image.') },
              ]},
            ],
          })
          const iText = oRes.choices[0]?.message?.content ?? '{}'
          console.log('[VF] Raw GPT-4o response (first 500 chars):', iText.substring(0, 500))
          analysis = extractJSON<unknown>(iText)
        } else {
          const pdfText = await extractPdfText(buffer)
          if (!pdfText || pdfText.replace(/\s/g, '').length < 100) {
            return NextResponse.json({
              success: false,
              error:   'Could not extract text from this PDF. This usually means it is a scanned or image-based PDF. Ask the client to download a fresh digital statement directly from their online banking app or website (not a scan or photo).',
            }, { status: 422 })
          }
          const oRes = await openai.chat.completions.create({
            model: 'gpt-4o', max_tokens: 6000, temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt.replace(JSON_ONLY, '') + '\n\nReturn only valid JSON.' },
              { role: 'user', content: userPrompt(`Bank statement text:\n${pdfText.slice(0, 14000)}`) },
            ],
          })
          const pText = oRes.choices[0]?.message?.content ?? '{}'
          console.log('[VF] Raw GPT-4o response (first 500 chars):', pText.substring(0, 500))
          analysis = extractJSON<unknown>(pText)
        }
        aiUsed = 'GPT-4o'
        console.log('[VF] OpenAI succeeded')
      } catch (oErr) {
        const oMsg = oErr instanceof Error ? oErr.message : String(oErr)
        console.error('[VF] OpenAI failed:', oMsg.slice(0, 200))
        return NextResponse.json({
          success: false,
          error:   `GPT-4o analysis failed: ${oMsg.slice(0, 300)}`,
        }, { status: 502 })
      }
    }

    return NextResponse.json({
      success: true, analysis, applicantName, visaType, passport,
      applicationId: appId ?? null,
      analysedAt:    new Date().toISOString(),
      aiUsed,
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
