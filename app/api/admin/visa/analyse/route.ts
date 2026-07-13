import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'
import OpenAI                        from 'openai'
import { getAdminSession }           from '@/lib/admin-auth'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 300

// ─── Currency requirements per visa type ─────────────────────────────────────

interface VisaInfo {
  currency:    string
  symbol:      string
  requirement: string
}

const VISA_CURRENCY: Record<string, VisaInfo> = {
  'UK Visitor':          { currency: 'GBP', symbol: '£',   requirement: 'Minimum £2,000–£5,000 for a 2-week visit. Regular income preferred over £1,500/month.' },
  'UK Student':          { currency: 'GBP', symbol: '£',   requirement: 'Must show 28 consecutive days with £1,334/month for London or £1,023/month outside London.' },
  'UK Work':             { currency: 'GBP', symbol: '£',   requirement: 'Maintenance requirement of £1,270 held for 28 days.' },
  'UK Family':           { currency: 'GBP', symbol: '£',   requirement: 'Sponsor must earn minimum £29,000/year from April 2024.' },
  'Schengen Tourist':    { currency: 'EUR', symbol: '€',   requirement: 'Minimum €50–€100 per day of stay. Typically €3,000+ for a 2-week trip.' },
  'Schengen Business':   { currency: 'EUR', symbol: '€',   requirement: 'Evidence of business funding and return journey costs.' },
  'Canada Visitor':      { currency: 'CAD', symbol: 'CA$', requirement: 'Minimum CA$10,000 recommended for a 6-month visit.' },
  'Canada Student':      { currency: 'CAD', symbol: 'CA$', requirement: 'First year tuition + CA$10,000 living expenses.' },
  'USA B1/B2':           { currency: 'USD', symbol: '$',   requirement: 'Strong financial ties to home country. Sufficient funds for trip duration.' },
  'UAE Visit':           { currency: 'AED', symbol: 'AED', requirement: 'Minimum AED 3,000–5,000 for visit. Bank balance proof required.' },
  'Australia Tourist':   { currency: 'AUD', symbol: 'A$',  requirement: 'Minimum A$5,000 for 3-month stay recommended.' },
}

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
  if (!text?.trim()) throw new Error('Empty AI response')
  console.log('[VF] extractJSON input length:', text.length, '| first 200:', text.substring(0, 200))

  // T1: strip ALL markdown code fences then try direct parse
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim()
  try { return JSON.parse(cleaned) as T } catch {}

  const start = cleaned.indexOf('{')
  const end   = cleaned.lastIndexOf('}')

  if (start !== -1 && end !== -1 && end > start) {
    const jsonStr = cleaned.substring(start, end + 1)
    try { return JSON.parse(jsonStr) as T } catch (parseErr) {
      // T3: repair trailing commas
      const repaired = jsonStr.replace(/,(\s*[}\]])/g, '$1')
      try { return JSON.parse(repaired) as T } catch {}
      // T4: bracket-count walk to find correct closing brace
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

  // T5: Truncation recovery — opening brace exists but no closing brace
  if (start !== -1) {
    console.warn('[VF] extractJSON: truncated response — attempting recovery')
    let partial = cleaned.substring(start).replace(/,\s*$/, '').trim()
    let depth = 0; let inStr = false; let esc = false
    for (const ch of partial) {
      if (esc) { esc = false; continue }
      if (ch === '\\' && inStr) { esc = true; continue }
      if (ch === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (ch === '{' || ch === '[') depth++
      if (ch === '}' || ch === ']') depth--
    }
    for (let i = 0; i < Math.abs(depth); i++) partial += depth > 0 ? '}' : ']'
    partial = partial.replace(/,(\s*[}\]])/g, '$1')
    try {
      const result = JSON.parse(partial) as T
      console.log('[VF] extractJSON: truncation recovery succeeded')
      return result
    } catch {
      throw new Error(`JSON truncated at char ${cleaned.length} and recovery failed. Increase max_tokens.`)
    }
  }

  throw new Error(`No JSON object found in AI response. Raw (first 300): ${text.substring(0, 300)}`)
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form          = await req.formData()
    const rawFiles      = (form.getAll('file') as File[]).filter(f => f instanceof File && f.size > 0)
    const legacyFile    = form.get('statement') as File | null
    if (!rawFiles.length && legacyFile) rawFiles.push(legacyFile)

    const visaType      = ((form.get('visaType')        as string) ?? 'UK Visitor').trim()
    const passport      = ((form.get('passportCountry') as string) ?? 'Nigerian').trim()
    const applicantName = ((form.get('applicantName')   as string) ?? 'Applicant').trim()
    const appId         = form.get('applicationId') as string | null

    if (!rawFiles.length) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const aiModel = ((form.get('aiModel') as string | null) ?? 'claude') as 'claude' | 'openai'

    // Currency / requirements for this visa type
    const visaInfo: VisaInfo = VISA_CURRENCY[visaType] ?? {
      currency: 'GBP', symbol: '£', requirement: 'Sufficient funds for the intended visit.',
    }

    // ── Build Anthropic content blocks from each uploaded file ────────────────
    const primaryBlocks: Anthropic.ContentBlockParam[] = []
    let usingExtractedText = false

    for (const f of rawFiles.slice(0, 10)) {
      if (f.size > 50 * 1024 * 1024) continue
      const buf   = Buffer.from(await f.arrayBuffer())
      const b64   = buf.toString('base64')
      const isImg = f.type.startsWith('image/')

      if (isImg) {
        primaryBlocks.push({
          type:   'image',
          source: { type: 'base64', media_type: f.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: b64 },
        } as Anthropic.ImageBlockParam)
        continue
      }

      // PDF — try text extraction to stay within Claude's token limit
      let addedAsText = false
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse') as (b: Buffer, o?: unknown) => Promise<{ text: string }>
        const parsed   = await pdfParse(buf, { max: 0 })
        const rawText  = parsed.text?.trim() ?? ''
        if (rawText.replace(/\s/g, '').length > 200) {
          const MAX = 80_000
          const truncated = rawText.length > MAX
            ? rawText.slice(0, 55_000) + '\n\n[... middle section omitted — totals below ...]\n\n' + rawText.slice(-25_000)
            : rawText
          primaryBlocks.push({ type: 'text', text: `BANK STATEMENT TEXT (${f.name}):\n\n${truncated}` })
          usingExtractedText = true
          addedAsText = true
          console.log(`[VF] PDF text extracted (${f.name}): ${rawText.length} chars → sent ${truncated.length} chars`)
        } else {
          console.log('[VF] pdf-parse: no usable text — PDF appears image/scanned')
        }
      } catch (e) {
        console.warn('[VF] pdf-parse failed:', e instanceof Error ? e.message : String(e))
      }

      if (!addedAsText) {
        if (buf.length <= 1_000_000) {
          primaryBlocks.push({
            type:   'document',
            source: { type: 'base64', media_type: 'application/pdf', data: b64 },
          } as Anthropic.DocumentBlockParam)
        } else if (rawFiles.length === 1) {
          const sizeMB = (buf.length / 1024 / 1024).toFixed(1)
          return NextResponse.json({
            success: false,
            error: `This PDF (${sizeMB} MB) is too large to analyse directly — it appears to be a scanned or image-based statement with no extractable text. Please try one of these options:\n• Export a shorter date range (1–2 months) from your bank's app\n• Take screenshots of the key pages and upload as images\n• Switch to GPT-4o (which uses a text-extraction approach and handles most bank PDFs)`,
          }, { status: 422 })
        }
      }
    }

    if (primaryBlocks.length === 0) {
      return NextResponse.json({ success: false, error: 'No readable content found in the uploaded files.' }, { status: 422 })
    }

    const systemPrompt =
      `You are VisaFortress AI — a forensic financial analyst specialising in visa bank statement review ` +
      `for ${passport} applicants applying for a ${visaType} visa. ` +
      `You combine the knowledge of a senior UK visa caseworker, a certified forensic accountant, and an AML compliance officer.` +
      JSON_ONLY

    const userPrompt = buildUserPrompt(applicantName, passport, visaType, visaInfo)

    let analysis: unknown | null = null
    let aiUsed = ''

    // ── Claude path ────────────────────────────────────────────────────────────
    // Claude reads PDFs and images natively as base64 documents — no text extraction needed.

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
        let txnContext = usingExtractedText ? 'Text extracted from PDF — see statement text above.' : 'Document passed directly to analysis.'
        try {
          const e1 = await callWithRetry(() => claude.messages.create({
            model: 'claude-sonnet-4-6', max_tokens: 3000, temperature: 0,
            system: 'You are a precise document data extractor. Return only valid JSON — no prose.' + JSON_ONLY,
            messages: [{ role: 'user', content: [...primaryBlocks, { type: 'text', text: EXTRACTION_PROMPT }] }],
          }))
          const eText = e1.content[0]?.type === 'text' ? e1.content[0].text : ''
          const eData = extractJSON<Record<string, unknown>>(eText)
          const txns  = Array.isArray(eData.transactions) ? eData.transactions.length : 0
          txnContext  = `Extracted ${txns} transactions. Currency: ${eData.currency ?? '?'}. Period: ${eData.statementPeriod ?? '?'}. Closing balance: ${eData.closingBalance ?? '?'}.`
        } catch { /* non-fatal — proceed to main analysis */ }

        // Pass 2: full forensic analysis
        const a2 = await callWithRetry(() => claude.messages.create({
          model: 'claude-sonnet-4-6', max_tokens: 8000, temperature: 0,
          stop_sequences: ['\n\nHere', '\n\nNote', '\n\nPlease', '\n\nI hope', '\n\nThe above'],
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: [
              ...primaryBlocks,
              {
                type: 'text',
                text: `CRITICAL INSTRUCTION: Your ENTIRE response must be a single valid JSON object. Start with { and end with }. No text before or after. No markdown. No backticks. No explanation.\n\n${userPrompt(txnContext)}`,
              },
            ],
          }],
        }))
        const aText = a2.content[0]?.type === 'text' ? a2.content[0].text : ''
        console.log('[VF] Raw Claude response (first 500):', aText.substring(0, 500))
        analysis = extractJSON<unknown>(aText)
        aiUsed   = 'Claude Sonnet 4.6'
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
    // Images: send directly as vision. PDFs: convert pages to PNG images first.

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
        type ImgPart = { type: 'image_url'; image_url: { url: string; detail: 'high' } }
        type TxtPart = { type: 'text'; text: string }

        const allImages = rawFiles.every(f => f.type.startsWith('image/'))
        if (allImages) {
          // All images — send as vision (supports multiple pages)
          const imgParts: ImgPart[] = []
          for (const f of rawFiles.slice(0, 10)) {
            const buf = Buffer.from(await f.arrayBuffer())
            imgParts.push({ type: 'image_url', image_url: { url: `data:${f.type};base64,${buf.toString('base64')}`, detail: 'high' } })
          }
          const oRes = await openai.chat.completions.create({
            model: 'gpt-4o', max_tokens: 8000, temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt.replace(JSON_ONLY, '') + '\n\nReturn only valid JSON.' },
              { role: 'user', content: [
                ...imgParts,
                { type: 'text', text: userPrompt(`Read directly from the ${rawFiles.length > 1 ? rawFiles.length + ' images' : 'image'} above.`) } as TxtPart,
              ]},
            ],
          })
          const iText = oRes.choices[0]?.message?.content ?? '{}'
          console.log('[VF] Raw GPT-4o response (first 500):', iText.substring(0, 500))
          analysis = extractJSON<unknown>(iText)
        } else {
          // PDF input — use pre-extracted text from primaryBlocks processing above
          console.log('[VF] Using pre-extracted PDF text for GPT-4o…')
          const pdfFile = rawFiles.find(f => !f.type.startsWith('image/'))
          let statementText = ''
          if (pdfFile) {
            const pdfBuf = Buffer.from(await pdfFile.arrayBuffer())
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const pdfParse = require('pdf-parse') as (b: Buffer, o?: unknown) => Promise<{ text: string }>
              const parsed   = await pdfParse(pdfBuf, { max: 0 })
              statementText  = parsed.text?.trim() ?? ''
            } catch (e) {
              console.error('[VF GPT] pdf-parse error:', e instanceof Error ? e.message : String(e))
            }
          }

          if (!statementText || statementText.replace(/\s/g, '').length < 100) {
            return NextResponse.json({
              success:       false,
              suggestClaude: true,
              error: `GPT-4o cannot read this PDF — it appears to be scanned or image-based (no extractable text found). ` +
                     `Switch to Claude, which reads all PDF types natively including scanned documents.`,
            }, { status: 422 })
          }

          console.log(`[VF] PDF text length for GPT-4o: ${statementText.length} chars`)
          const oRes = await openai.chat.completions.create({
            model: 'gpt-4o', max_tokens: 8000, temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt.replace(JSON_ONLY, '') + '\n\nReturn only valid JSON.' },
              { role: 'user',   content:
                  userPrompt(`Extracted from PDF — ${statementText.length} characters of text.`) +
                  `\n\nBANK STATEMENT TEXT:\n${statementText.substring(0, 6000)}`,
              },
            ],
          })
          const pText = oRes.choices[0]?.message?.content ?? '{}'
          console.log('[VF] Raw GPT-4o response (first 500):', pText.substring(0, 500))
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
      currency:      visaInfo.currency,
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

function buildUserPrompt(applicantName: string, passport: string, visaType: string, visaInfo: VisaInfo) {
  return (txnContext: string) => `Applicant: ${applicantName} | Passport: ${passport} | Visa: ${visaType}
Context: ${txnContext}

CURRENCY DETECTION:
Read the statement and identify the currency from symbols and codes in headers, balances, and transactions.
Common: NGN (₦), GHS (GH₵), KES (KSh), ZAR (R), USD ($), GBP (£), EUR (€), AED (AED), CAD (CA$), AUD (A$)
Report all amounts in the ORIGINAL statement currency.

CONVERT TO ${visaInfo.currency} (${visaInfo.symbol}) — use these rates:
NGN÷2050 GHS×0.057 KES÷168 ZAR×0.043 USD×0.79 EUR×0.86 AED÷4.79 CAD×0.57 AUD×0.57
If statement is already ${visaInfo.currency}: set conversionRate to "Direct — no conversion needed"

VISA REQUIREMENT: ${visaInfo.requirement}
Set meetsVisaRequirement true if converted balance meets this, false if not.

Return ONLY this JSON object — nothing before or after, no markdown, no backticks:
{
  "statementCurrency": "<code e.g. NGN>",
  "statementCurrencySymbol": "<symbol e.g. ₦>",
  "visaCountryCurrency": "${visaInfo.currency}",
  "visaCountryCurrencySymbol": "${visaInfo.symbol}",
  "conversionRate": "<e.g. 1 GBP = 2050 NGN>",
  "avgMonthlyBalance": <number in statement currency>,
  "avgMonthlyBalanceConverted": <number in ${visaInfo.currency}>,
  "avgMonthlyIncome": <number in statement currency>,
  "avgMonthlyIncomeConverted": <number in ${visaInfo.currency}>,
  "approvalScore": <0-100>,
  "scoreGrade": "<A|B|C|D|F>",
  "approvalLikelihood": "<HIGH|MEDIUM|LOW|VERY_LOW>",
  "incomeRegular": <true|false>,
  "meetsVisaRequirement": <true|false>,
  "requirementGap": "<one sentence e.g. Has £1,200 equivalent, needs £2,000>",
  "recommendation": "<approve|conditional|likely_reject|reject>",
  "strengths": ["<s1>", "<s2>", "<s3>"],
  "concerns": ["<c1>", "<c2>", "<c3>"],
  "redFlags": ["<flag description 1>", "<flag description 2>"],
  "embassyView": "<2-3 sentence officer perspective>",
  "cashFlowAnalysis": "<2-3 sentence cash flow summary>",
  "approvalRationale": "<2-3 sentence overall rationale>"
}

Rules:
- statementCurrency is auto-detected from statement content — NEVER derived from visa type
- strengths, concerns, redFlags: max 5 items each, one sentence per item
- All string values: concise, one sentence max
- scoreGrade: A B C D F | approvalLikelihood: HIGH MEDIUM LOW VERY_LOW`
}
