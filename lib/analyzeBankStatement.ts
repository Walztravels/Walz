import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { Message } from '@anthropic-ai/sdk/resources/messages'

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

// ─── Shared prompt builder ────────────────────────────────────────────────────

function buildPrompts(
  extractedText: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
) {
  const key = destination.toLowerCase().replace(/\s+/g, '')
  const req = EMBASSY_REQUIREMENTS[key] ?? EMBASSY_REQUIREMENTS['uk']

  const system = `You are a senior visa application specialist with 15 years of experience \
at a travel consultancy. You have processed thousands of visa applications for UK, Canada, USA, \
Schengen, and UAE embassies and you know exactly what immigration officers look for and flag.

Your job is to analyse a client's bank statement and provide:
1. A structured data assessment for the Walz Travels internal team
2. Actionable recommendations the client can act on before submission
3. An honest expert opinion — if the application looks weak, say so clearly in agentNotes

Rules:
- Be precise with numbers
- Be direct and specific in agentNotes
- Be encouraging but honest in summary (never reveal PASS/REVIEW/FLAG label to client)
- Never invent transactions — only report what is visible in the statement text`

  const user = `Analyse the bank statement below for a ${destination.toUpperCase()} visa application.

APPLICANT: ${applicantName}
PASSPORT COUNTRY: ${passportCountry}
VISA DESTINATION: ${destination.toUpperCase()}

EMBASSY REQUIREMENTS AND OFFICER PRIORITIES:
${req.notes}

MINIMUM BALANCE THRESHOLD: ${req.min} ${req.currency} maintained consistently over ${req.months} months.

BANK STATEMENT TEXT:
---
${extractedText.slice(0, 80000)}
---

Return ONLY a raw JSON object — no markdown, no code fences, no explanation before or after. \
Just the JSON starting with { and ending with }.

Required JSON structure:
{
  "status": "PASS",
  "currency": "GBP",
  "statementPeriod": "January 2025 – March 2025",
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
  "summary": "Client-facing plain English summary — no jargon, no PASS/REVIEW/FLAG label.",
  "agentNotes": "Internal-only. Direct, specific. Include proceed/wait recommendation.",
  "confidence": "high",
  "warnings": []
}

STATUS DECISION RULES:
- PASS → average balance clearly above ${req.min} ${req.currency}, income regular, pattern consistent, no disqualifying flags
- REVIEW → borderline balance OR minor irregularities that need explanation but are not disqualifying
- FLAG → balance below threshold, irregular/unverifiable income, funds parking evidence, overdrafts, or patterns an embassy officer would question

WHAT TO FLAG AS SUSPICIOUS:
- Large round-number cash deposits (e.g. exactly £5,000, £10,000) with no source
- Balance spikes in the final 2–4 weeks of the statement (funds parking signal)
- Vague large withdrawals (e.g. "CASH", "WITHDRAWAL") with no payee name
- Overdrafts or returned direct debits
- Transfers from unidentified sources just before statement closing date
- Stated income does not match salary credits
- Dormant account that suddenly shows activity
- Multiple credits on the same day from different sources shortly before period end

WHAT COUNTS AS A LARGE UNEXPLAINED WITHDRAWAL:
- Any single debit above 30% of the average monthly balance
- Any debit above ${Math.round(req.min * 0.5)} ${req.currency} with a vague description

Be thorough — a missed flag can cause a visa rejection. A false flag causes unnecessary anxiety.`

  return { system, user, req }
}

// ─── JSON extractor ───────────────────────────────────────────────────────────

function extractJson(raw: string): string {
  // Strip markdown code fences
  let clean = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
  // Find first { and last } in case there's surrounding text
  if (!clean.startsWith('{')) {
    const s = clean.indexOf('{')
    const e = clean.lastIndexOf('}')
    if (s >= 0 && e > s) clean = clean.slice(s, e + 1)
  }
  return clean
}

// ─── Claude analyser ──────────────────────────────────────────────────────────

async function analyzeWithClaude(
  extractedText: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
): Promise<BankStatementAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { system, user, req } = buildPrompts(extractedText, destination, applicantName, passportCountry)

  console.log('[Claude] calling API, text length:', extractedText.length)
  let response: Message
  try {
    response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      system,
      messages:   [{ role: 'user', content: user }],
    }) as Message
  } catch (e) {
    throw new Error(`Claude API error: ${e instanceof Error ? e.message : String(e)}`)
  }

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  console.log('[Claude] stop_reason:', response.stop_reason, '| response preview:', raw.slice(0, 200))

  const clean = extractJson(raw)
  const parsed = JSON.parse(clean) as BankStatementAnalysis
  return { ...parsed, analysisEngine: 'Claude claude-sonnet-4-6' }
}

// ─── OpenAI (ChatGPT) analyser ────────────────────────────────────────────────

async function analyzeWithOpenAI(
  extractedText: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
): Promise<BankStatementAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const client = new OpenAI({ apiKey })
  const { system, user, req } = buildPrompts(extractedText, destination, applicantName, passportCountry)

  console.log('[OpenAI] calling GPT-4o, text length:', extractedText.length)
  const response = await client.chat.completions.create({
    model:       'gpt-4o',
    max_tokens:  4096,
    temperature: 0,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user   },
    ],
    response_format: { type: 'json_object' },
  })

  const raw = response.choices[0]?.message?.content ?? ''
  console.log('[OpenAI] finish_reason:', response.choices[0]?.finish_reason, '| preview:', raw.slice(0, 200))

  const clean = extractJson(raw)
  const parsed = JSON.parse(clean) as BankStatementAnalysis
  return { ...parsed, analysisEngine: 'ChatGPT gpt-4o' }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

// Accepts raw PDF buffer. Extracts text via dynamic pdf-parse import (avoids
// module-level crash in Vercel serverless), then tries Claude first, falls
// back to OpenAI GPT-4o if Claude fails or returns invalid JSON.
export async function analyzeBankStatement(
  pdfBuffer: Buffer,
  destination: string,
  applicantName: string,
  passportCountry = 'Nigeria',
): Promise<BankStatementAnalysis> {
  const key = destination.toLowerCase().replace(/\s+/g, '')
  const req = EMBASSY_REQUIREMENTS[key] ?? EMBASSY_REQUIREMENTS['uk']

  // Extract text from PDF using dynamic import (avoids module-level init crash)
  let extractedText = ''
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod      = await import('pdf-parse') as any
    const pdfParse = mod.default ?? mod
    const result   = await pdfParse(pdfBuffer)
    extractedText  = result.text ?? ''
    console.log('[analyzeBankStatement] pdf-parse extracted', extractedText.length, 'chars')
  } catch (e) {
    console.warn('[analyzeBankStatement] pdf-parse failed:', e instanceof Error ? e.message : e)
  }

  // Try Claude
  try {
    const result = await analyzeWithClaude(extractedText, destination, applicantName, passportCountry)
    console.log('[analyzeBankStatement] Claude succeeded, status:', result.status)
    return result
  } catch (claudeErr) {
    console.warn('[analyzeBankStatement] Claude failed:', claudeErr instanceof Error ? claudeErr.message : claudeErr)
  }

  // Fallback: OpenAI GPT-4o
  try {
    const result = await analyzeWithOpenAI(extractedText, destination, applicantName, passportCountry)
    console.log('[analyzeBankStatement] OpenAI succeeded, status:', result.status)
    return result
  } catch (openaiErr) {
    console.error('[analyzeBankStatement] OpenAI also failed:', openaiErr instanceof Error ? openaiErr.message : openaiErr)
  }

  // Both failed
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
    agentNotes: 'ANALYSIS UNAVAILABLE — Both Claude and OpenAI engines failed. Check ANTHROPIC_API_KEY and OPENAI_API_KEY in Vercel environment variables. Review PDF manually.',
    confidence: 'low',
    warnings: ['Automatic analysis unavailable — manual review required'],
    analysisEngine: 'none',
  }
}
