import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { Message } from '@anthropic-ai/sdk/resources/messages'
import type { DocumentBlockParam } from '@anthropic-ai/sdk/resources/messages'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BankStatementAnalysis {
  status: 'PASS' | 'REVIEW' | 'FLAG'
  currency: string
  statementPeriod: string
  monthsAnalyzed: number
  averageMonthlyBalance: number
  lowestBalance: number
  highestBalance: number
  closingBalance: number
  totalCredits: number
  totalDebits: number
  incomeRegular: boolean
  estimatedMonthlyIncome: number
  salaryCreditsDetected: boolean
  salaryAmount: number | null
  salaryFrequency: 'monthly' | 'biweekly' | 'weekly' | 'irregular' | null
  otherIncomeSources: string[]
  suspiciousTransactions: Array<{
    date: string; description: string; amount: number
    type: 'debit' | 'credit'; reason: string; severity: 'low' | 'medium' | 'high'
  }>
  balanceDipsBelow: Array<{ date: string; balance: number; threshold: number }>
  largeUnexplainedWithdrawals: Array<{ date: string; amount: number; description: string }>
  embassyThresholdMet: boolean
  embassyMinimumRequired: number
  embassyCurrency: string
  overdraftsDetected: boolean
  overdraftCount: number
  roundNumberDeposits: boolean
  unusualDepositPattern: boolean
  recommendations: string[]
  summary: string
  agentNotes: string
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
  analysisEngine?: string
}

// ─── Embassy requirements ─────────────────────────────────────────────────────

const EMBASSY_REQUIREMENTS: Record<string, { min: number; currency: string; months: number; notes: string }> = {
  uk: {
    min: 2500, currency: 'GBP', months: 3,
    notes: `UK Visas and Immigration (UKVI) looks for:
- Consistent balance above £2,500 for the past 3 months
- No large unexplained deposits in the 28 days before application ("funds parking")
- Regular income pattern — salary or business income
- No overdrafts or returned payments
- Cash deposits are heavily scrutinised — must be explained
- Balance spikes just before statement end date are a red flag`,
  },
  canada: {
    min: 5000, currency: 'CAD', months: 3,
    notes: `Immigration, Refugees and Citizenship Canada (IRCC) looks for:
- Minimum CAD 5,000 for single applicant, add CAD 1,500 per additional family member
- Consistent balance — not just a high closing balance
- Stable income source (employment letter must match salary credits on statement)
- No large unexplained deposits — IRCC officers are trained to spot funds parking
- Savings pattern matters: gradual accumulation is stronger than a sudden large deposit`,
  },
  schengen: {
    min: 3000, currency: 'EUR', months: 3,
    notes: `Schengen Visa (European embassies) looks for:
- Minimum €30–€50 per day of stay — typical 2-week trip needs ~€500–€700
- Minimum holding balance of €3,000 is the common benchmark across Schengen
- Regular income — payslips must match salary credits visible on statement
- No large unexplained withdrawals
- Germany, France and Netherlands consulates are particularly strict on funds parking`,
  },
  uae: {
    min: 3000, currency: 'USD', months: 3,
    notes: `UAE Tourist / Visit Visa looks for:
- Minimum balance of AED 10,000–15,000 (approx USD 2,700–4,000) over last 3 months
- Bank statements must be on official letterhead and stamped (if from Nigeria/Ghana)
- Regular credits — salary or business income
- For self-employed applicants: 6 months of statements preferred`,
  },
  usa: {
    min: 5000, currency: 'USD', months: 3,
    notes: `US B1/B2 Tourist Visa looks for:
- Strong ties to home country — financial strength supports this
- Minimum USD 5,000 is a general guideline — higher is better
- Consistent balance over 3–6 months
- Funds parking is heavily scrutinised — large deposits in the 30 days before application are a red flag
- Nigerian/Ghanaian applicants face higher scrutiny — consistency matters more than raw amount`,
  },
  australia: {
    min: 5000, currency: 'AUD', months: 3,
    notes: `Australia Tourist Visa (subclass 600) looks for:
- Minimum AUD 5,000 for a typical trip
- Consistent balance and regular income
- No unexplained large deposits
- Savings pattern preferred over a single large deposit`,
  },
  ghana: {
    min: 3000, currency: 'USD', months: 3,
    notes: `Ghanaian bank statements must be on official letterhead with bank stamp.
GHS amounts should be converted to destination currency equivalent.
Same destination thresholds apply.`,
  },
  nigeria: {
    min: 3000, currency: 'USD', months: 3,
    notes: `Nigerian bank statements should be stamped and signed by the bank.
Embassy officers know the NGN/USD exchange rate — they will convert automatically.
Naira balances of ₦2M–₦5M at current rates (~₦1,600/USD) are approximately USD 1,250–3,125 — borderline for most applications.
Same destination thresholds apply.`,
  },
}

// ─── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompts(destination: string, applicantName: string, passportCountry: string, extractedText = '') {
  const key = destination.toLowerCase().replace(/\s+/g, '')
  const req = EMBASSY_REQUIREMENTS[key] ?? EMBASSY_REQUIREMENTS['uk']

  const system = `You are a senior visa application specialist with 15 years of experience \
at a travel consultancy. You have processed thousands of visa applications for UK, Canada, USA, \
Schengen, and UAE embassies and you know exactly what immigration officers look for and flag.

Rules:
- Be precise with numbers — read every transaction and every balance figure on the statement
- Be direct and specific in agentNotes
- Be encouraging but honest in summary (never reveal PASS/REVIEW/FLAG label to client)
- Never invent transactions — only report what is visible in the statement`

  const textSection = extractedText.trim().length > 200
    ? `\n\nEXTRACTED STATEMENT TEXT (for reference):\n---\n${extractedText.slice(0, 80000)}\n---\n`
    : ''

  const user = `Analyse the bank statement ${extractedText.trim().length > 200 ? 'text below' : 'PDF attached above'} for a ${destination.toUpperCase()} visa application.

APPLICANT: ${applicantName}
PASSPORT COUNTRY: ${passportCountry}
VISA DESTINATION: ${destination.toUpperCase()}

EMBASSY REQUIREMENTS:
${req.notes}

MINIMUM BALANCE THRESHOLD: ${req.min} ${req.currency} consistently over ${req.months} months.
${textSection}
OUTPUT RULES — CRITICAL:
- Return ONLY a valid JSON object
- Start immediately with { — do not write any text before or after
- No markdown, no code fences, no explanation
- Every field in the schema below must be present

JSON SCHEMA:
{
  "status": "PASS | REVIEW | FLAG",
  "currency": "detected currency code e.g. GBP",
  "statementPeriod": "e.g. January 2025 – March 2025",
  "monthsAnalyzed": 3,
  "averageMonthlyBalance": 4200,
  "lowestBalance": 1850,
  "highestBalance": 5100,
  "closingBalance": 4300,
  "totalCredits": 8400,
  "totalDebits": 6200,
  "incomeRegular": true,
  "estimatedMonthlyIncome": 2800,
  "salaryCreditsDetected": true,
  "salaryAmount": 2800,
  "salaryFrequency": "monthly",
  "otherIncomeSources": [],
  "suspiciousTransactions": [],
  "balanceDipsBelow": [],
  "largeUnexplainedWithdrawals": [],
  "embassyThresholdMet": true,
  "embassyMinimumRequired": ${req.min},
  "embassyCurrency": "${req.currency}",
  "overdraftsDetected": false,
  "overdraftCount": 0,
  "roundNumberDeposits": false,
  "unusualDepositPattern": false,
  "recommendations": [],
  "summary": "Client-facing plain English summary — no jargon, no PASS/REVIEW/FLAG label",
  "agentNotes": "Internal only — direct, specific, include proceed/wait recommendation",
  "confidence": "high | medium | low",
  "warnings": []
}

STATUS RULES:
- PASS → balance clearly above ${req.min} ${req.currency}, regular income, clean pattern
- REVIEW → borderline balance OR minor irregularities needing explanation
- FLAG → balance below threshold, irregular income, overdrafts, funds parking, or anything an embassy officer would question

SUSPICIOUS PATTERNS TO FLAG:
- Round-number cash deposits (£5,000, £10,000) with no source
- Balance spikes in final 2–4 weeks (funds parking)
- Vague large withdrawals: "CASH", "WITHDRAWAL" with no payee
- Overdrafts or returned direct debits
- Dormant account that suddenly shows activity
- Transfers from unidentified sources near statement end
- Large unexplained debit = any single debit above 30% of avg monthly balance or above ${Math.round(req.min * 0.5)} ${req.currency} with vague description`

  return { system, user, req }
}

// ─── Claude (document API + JSON prefill) ────────────────────────────────────
// Sends the raw PDF to Claude and uses the assistant-prefill trick ({ at the
// start of the assistant turn) to guarantee JSON output with no preamble.

async function analyzeWithClaudeDocument(
  base64Pdf: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
): Promise<BankStatementAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { system, user, req } = buildPrompts(destination, applicantName, passportCountry)

  const docBlock: DocumentBlockParam = {
    type:   'document',
    source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
  }

  console.log('[Claude-doc] calling API, base64 length:', base64Pdf.length)

  let response: Message
  try {
    response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      system,
      messages: [
        { role: 'user',      content: [docBlock, { type: 'text', text: user }] },
        // Prefill forces Claude to start immediately with JSON — no preamble possible
        { role: 'assistant', content: '{' },
      ],
    }) as Message
  } catch (e) {
    throw new Error(`Claude API error: ${e instanceof Error ? e.message : String(e)}`)
  }

  const tail = response.content[0].type === 'text' ? response.content[0].text : ''
  const raw  = '{' + tail  // reconstruct: prefill + continuation
  console.log('[Claude-doc] stop_reason:', response.stop_reason, '| raw preview:', raw.slice(0, 200))

  const parsed = JSON.parse(raw) as BankStatementAnalysis
  return { ...parsed, analysisEngine: 'Claude claude-sonnet-4-6' }
}

// ─── Claude (text mode) ───────────────────────────────────────────────────────

async function analyzeWithClaudeText(
  extractedText: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
): Promise<BankStatementAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { system, user } = buildPrompts(destination, applicantName, passportCountry, extractedText)

  console.log('[Claude-text] calling API, text length:', extractedText.length)

  let response: Message
  try {
    response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      system,
      messages: [
        { role: 'user',      content: user },
        { role: 'assistant', content: '{' },
      ],
    }) as Message
  } catch (e) {
    throw new Error(`Claude text API error: ${e instanceof Error ? e.message : String(e)}`)
  }

  const tail = response.content[0].type === 'text' ? response.content[0].text : ''
  const raw  = '{' + tail
  console.log('[Claude-text] stop_reason:', response.stop_reason, '| raw preview:', raw.slice(0, 200))

  const parsed = JSON.parse(raw) as BankStatementAnalysis
  return { ...parsed, analysisEngine: 'Claude claude-sonnet-4-6' }
}

// ─── OpenAI GPT-4o (text mode) ───────────────────────────────────────────────

async function analyzeWithOpenAI(
  extractedText: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
): Promise<BankStatementAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const client = new OpenAI({ apiKey })
  const { system, user } = buildPrompts(destination, applicantName, passportCountry, extractedText)

  console.log('[OpenAI] calling GPT-4o, text length:', extractedText.length)

  const response = await client.chat.completions.create({
    model:           'gpt-4o',
    max_tokens:      4096,
    temperature:     0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user   },
    ],
  })

  const raw = response.choices[0]?.message?.content ?? ''
  console.log('[OpenAI] finish_reason:', response.choices[0]?.finish_reason, '| preview:', raw.slice(0, 200))

  const parsed = JSON.parse(raw) as BankStatementAnalysis
  return { ...parsed, analysisEngine: 'ChatGPT gpt-4o' }
}

// ─── PDF text extractor ───────────────────────────────────────────────────────

async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod      = await import('pdf-parse') as any
    const pdfParse = mod.default ?? mod
    const result   = await pdfParse(pdfBuffer)
    return result.text ?? ''
  } catch {
    return ''
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

// Strategy:
//  1. Claude document API — sends the raw PDF bytes so Claude can visually read it.
//     Uses the JSON prefill trick to guarantee { ... } output with no preamble.
//     Works for both text-based and scanned PDFs.
//  2. If Claude doc API fails: extract text via pdf-parse → Claude text mode
//  3. If Claude text mode also fails: extract text → OpenAI GPT-4o
//  4. All engines failed → return manual-review fallback

export async function analyzeBankStatement(
  pdfBuffer: Buffer,
  destination: string,
  applicantName: string,
  passportCountry = 'Nigeria',
): Promise<BankStatementAnalysis> {
  const key = destination.toLowerCase().replace(/\s+/g, '')
  const req = EMBASSY_REQUIREMENTS[key] ?? EMBASSY_REQUIREMENTS['uk']
  const base64Pdf = pdfBuffer.toString('base64')

  // 1. Claude document API (primary — reads the actual PDF)
  try {
    const result = await analyzeWithClaudeDocument(base64Pdf, destination, applicantName, passportCountry)
    console.log('[analyzeBankStatement] Claude-doc succeeded, status:', result.status)
    return result
  } catch (e) {
    console.warn('[analyzeBankStatement] Claude-doc failed:', e instanceof Error ? e.message : e)
  }

  // 2. Extract text for text-based fallbacks
  const extractedText = await extractPdfText(pdfBuffer)
  console.log('[analyzeBankStatement] pdf-parse extracted', extractedText.length, 'chars')

  // 3. Claude text mode
  if (extractedText.length > 100) {
    try {
      const result = await analyzeWithClaudeText(extractedText, destination, applicantName, passportCountry)
      console.log('[analyzeBankStatement] Claude-text succeeded, status:', result.status)
      return result
    } catch (e) {
      console.warn('[analyzeBankStatement] Claude-text failed:', e instanceof Error ? e.message : e)
    }
  }

  // 4. OpenAI GPT-4o
  try {
    const result = await analyzeWithOpenAI(extractedText, destination, applicantName, passportCountry)
    console.log('[analyzeBankStatement] OpenAI succeeded, status:', result.status)
    return result
  } catch (e) {
    console.error('[analyzeBankStatement] OpenAI also failed:', e instanceof Error ? e.message : e)
  }

  // All engines failed
  return {
    status: 'REVIEW',
    currency: 'UNKNOWN',
    statementPeriod: 'Unable to determine',
    monthsAnalyzed: 0,
    averageMonthlyBalance: 0,
    lowestBalance: 0,
    highestBalance: 0,
    closingBalance: 0,
    totalCredits: 0,
    totalDebits: 0,
    incomeRegular: false,
    estimatedMonthlyIncome: 0,
    salaryCreditsDetected: false,
    salaryAmount: null,
    salaryFrequency: null,
    otherIncomeSources: [],
    suspiciousTransactions: [],
    balanceDipsBelow: [],
    largeUnexplainedWithdrawals: [],
    embassyThresholdMet: false,
    embassyMinimumRequired: req.min,
    embassyCurrency: req.currency,
    overdraftsDetected: false,
    overdraftCount: 0,
    roundNumberDeposits: false,
    unusualDepositPattern: false,
    recommendations: ['Manual review required — AI analysis is temporarily unavailable.'],
    summary: 'Our team will review your bank statement and get back to you within 24 hours.',
    agentNotes: 'ANALYSIS UNAVAILABLE — All AI engines failed. Check ANTHROPIC_API_KEY and OPENAI_API_KEY in Vercel env vars. Review the PDF manually.',
    confidence: 'low',
    warnings: ['Automatic analysis unavailable — manual review required'],
    analysisEngine: 'none',
  }
}
