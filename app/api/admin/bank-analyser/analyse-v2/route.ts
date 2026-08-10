import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'
import OpenAI                        from 'openai'
import { getAdminSession }           from '@/lib/admin-auth'
import { getSupabaseAdmin }          from '@/lib/supabase'

export const maxDuration = 120

// ─── Shared system prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are VisaFortress AI, a forensic bank statement analyst for visa applications. Analyse the provided bank statement and return your findings as valid JSON only.

CRITICAL OUTPUT RULES:
- Return valid JSON only — no markdown fences, no preamble, no explanation
- Start your response with { and end with }
- If analysis is impossible return: {"error": "reason", "analysable": false}

Return a JSON object with EXACTLY these fields:
{
  "status": "PASS",
  "currency": "NGN",
  "statementPeriod": "Jan 2024 – Mar 2024",
  "averageMonthlyBalance": 850000.00,
  "lowestBalance": 120000.00,
  "closingBalance": 1100000.00,
  "estimatedMonthlyIncome": 500000.00,
  "salaryCreditsDetected": true,
  "embassyThresholdMet": true,
  "embassyMinimumRequired": 500000,
  "embassyCurrency": "NGN",
  "suspiciousTransactions": [
    { "date": "2024-02-14", "description": "CASH DEPOSIT", "amount": 2000000, "reason": "Large unexplained cash deposit", "severity": "high" }
  ],
  "largeUnexplainedWithdrawals": [
    { "date": "2024-01-30", "amount": 1500000, "description": "TRF TO UNKNOWN" }
  ],
  "recommendations": ["Request explanation for February cash deposit"],
  "agentNotes": "Two to three paragraph assessment of account health, income stability, and visa risk.",
  "confidence": "high",
  "warnings": ["Statement shows end-of-period balance inflation"]
}

Rules:
- status must be one of: PASS REVIEW FLAG
- PASS = strong finances, embassy threshold met, no red flags; REVIEW = minor concerns; FLAG = significant red flags
- confidence must be one of: high medium low
- severity must be one of: high medium low
- embassyMinimumRequired is the minimum the destination embassy typically requires for this nationality
- All monetary amounts in the statement's native currency`

// ─── Robust JSON extractor (bracket-counting to handle nested arrays/objects) ─

function cleanAndParse(raw: string): unknown {
  const stripped = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  try { return JSON.parse(stripped) } catch {}
  // Bracket-counting: find the outermost {...} block without greedy regex issues
  const start = stripped.indexOf('{')
  if (start !== -1) {
    let depth = 0; let inStr = false; let esc = false
    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i]
      if (esc)              { esc = false; continue }
      if (ch === '\\' && inStr) { esc = true; continue }
      if (ch === '"')           { inStr = !inStr; continue }
      if (inStr)                continue
      if (ch === '{')           depth++
      else if (ch === '}')      { depth--; if (depth === 0) { try { return JSON.parse(stripped.slice(start, i + 1)) } catch {} ; break } }
    }
  }
  throw new Error('No valid JSON found in response')
}

// ─── PDF text extractor (for OpenAI fallback — GPT-4o reads text, not binary) ─

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('pdf-parse') as any
    const pp  = mod.default ?? mod
    return ((await pp(buffer)).text ?? '').trim()
  } catch {
    return ''
  }
}

// ─── Markdown converter — preserves tabular structure for bank statements ─────
// Collapses whitespace-aligned columns into pipe-delimited rows so Claude reads
// the transaction table as structured data rather than a wall of numbers.

function toMarkdown(text: string): string {
  const DATE_RE   = /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}/i
  const AMOUNT_RE = /[\d,]{1,10}\.\d{2}/

  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (!trimmed) return ''
      const cells = trimmed.replace(/\s{2,}/g, '\t').split('\t').map(c => c.trim()).filter(Boolean)
      if (cells.length >= 3 && DATE_RE.test(trimmed) && AMOUNT_RE.test(trimmed)) {
        return '| ' + cells.join(' | ') + ' |'
      }
      return cells.join(' ')
    })
    .join('\n')
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const adminSession = await getAdminSession()
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const {
    storagePath,
    destination,
    applicantName,
    passportCountry = 'Nigeria',
    applicationId,
  } = body ?? {}

  if (!storagePath || !destination || !applicantName) {
    return NextResponse.json(
      { error: 'Missing required fields: storagePath, destination, applicantName' },
      { status: 400 },
    )
  }

  // ── Fetch PDF from Supabase Storage ─────────────────────────────────────────

  const supabase = getSupabaseAdmin()

  const { data: signed, error: signErr } = await supabase.storage
    .from('visa-documents')
    .createSignedUrl(storagePath, 60 * 60 * 2)

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: 'Could not access uploaded file. Please re-upload.' },
      { status: 502 },
    )
  }

  const fileRes = await fetch(signed.signedUrl)
  if (!fileRes.ok) {
    return NextResponse.json({ error: `Storage fetch failed (${fileRes.status})` }, { status: 502 })
  }

  const arrayBuffer = await fileRes.arrayBuffer()
  if (arrayBuffer.byteLength > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 413 })
  }

  const pdfBuffer = Buffer.from(arrayBuffer)
  const userText  = `Analyse this bank statement for ${applicantName} (${passportCountry}) applying for a ${destination} visa. Return only the JSON object.`

  // ── Markdown fast-path: extract text first; send as markdown if text-based ──
  // Avoids expensive base64 document tokens for machine-generated PDFs.
  // Never send near-empty text to Claude — it will confidently hallucinate.

  const rawExtracted   = await extractPdfText(pdfBuffer)
  const nonWsChars     = rawExtracted.replace(/\s/g, '').length
  let markdownText: string | null = null
  let extractionPath: 'markdown' | 'native' = 'native'

  if (nonWsChars > 200) {
    markdownText   = toMarkdown(rawExtracted)
    extractionPath = 'markdown'
    console.log(`[analyse-v2] path: markdown chars: ${nonWsChars}`)
  } else {
    console.log(`[analyse-v2] path: native chars: ${nonWsChars}`)
  }

  // ── Try Claude ───────────────────────────────────────────────────────────────

  let analysis: unknown | null = null
  let claudeError: string | null = null

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      const userContent: Anthropic.MessageParam['content'] = markdownText
        ? [{ type: 'text', text: `${userText}\n\nBank statement (text extracted):\n\n${markdownText}` }]
        : [
            {
              type:   'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBuffer.toString('base64') },
            } as Anthropic.DocumentBlockParam,
            { type: 'text', text: userText },
          ]

      const response = await claude.messages.create({
        model:       'claude-sonnet-4-6',
        max_tokens:  2000,
        temperature: 0,
        system:      SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      })
      const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
      analysis  = cleanAndParse(raw)
      console.log('[analyse-v2] Claude succeeded')
    } catch (e) {
      claudeError = e instanceof Error ? e.message : String(e)
      console.warn('[analyse-v2] Claude failed, trying OpenAI fallback:', claudeError.slice(0, 200))
    }
  } else {
    claudeError = 'ANTHROPIC_API_KEY not configured'
  }

  // ── OpenAI fallback ──────────────────────────────────────────────────────────

  if (!analysis) {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: `Analysis failed: ${claudeError ?? 'No AI providers configured'}` },
        { status: 502 },
      )
    }

    try {
      // Reuse already-extracted text — avoid a second pdf-parse call
      const pdfText = markdownText ?? rawExtracted
      if (!pdfText || pdfText.replace(/\s/g, '').length < 50) {
        return NextResponse.json(
          { error: 'Could not extract text from PDF. Please upload a digital (not scanned) bank statement.' },
          { status: 422 },
        )
      }

      const openai   = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const response = await openai.chat.completions.create({
        model:           'gpt-4o',
        max_tokens:      2000,
        temperature:     0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role:    'user',
            content: `Analyse this bank statement text for ${applicantName} (${passportCountry}) applying for a ${destination} visa.\n\nStatement:\n${pdfText.slice(0, 12000)}`,
          },
        ],
      })

      const raw = response.choices[0]?.message?.content ?? '{}'
      analysis  = cleanAndParse(raw)
      console.log('[analyse-v2] OpenAI fallback succeeded')
    } catch (oErr) {
      const oMsg = oErr instanceof Error ? oErr.message : String(oErr)
      console.error('[analyse-v2] OpenAI fallback also failed:', oMsg.slice(0, 200))
      return NextResponse.json(
        { error: `All AI providers failed. Claude: ${claudeError}. OpenAI: ${oMsg}` },
        { status: 502 },
      )
    }
  }

  // ── Persist to Supabase (non-fatal) ──────────────────────────────────────────

  if (applicationId) {
    try {
      await supabase
        .from('bank_statement_analyses')
        .upsert(
          {
            application_id:  applicationId,
            admin_file_url:  signed.signedUrl,
            analysis_result: analysis,
            analysis_engine: 'v2.1',
            uploaded_by:     'admin',
            extracted_text:  markdownText ?? null,
            extraction_path: extractionPath,
            char_count:      nonWsChars,
          },
          { onConflict: 'application_id' },
        )
    } catch (dbErr) {
      console.warn('[analyse-v2] DB persist failed (non-fatal):', dbErr)
    }
  }

  return NextResponse.json(analysis)
}
