import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { Message } from '@anthropic-ai/sdk/resources/messages'
import type { DocumentBlockParam } from '@anthropic-ai/sdk/resources/messages'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthlyBreakdown {
  month: string
  openingBalance: number
  closingBalance: number
  totalCredits: number
  totalDebits: number
  transactions: Array<{
    date: string
    description: string
    amount: number
    type: 'credit' | 'debit'
    runningBalance: number | null
    flag: string | null
  }>
}

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
  monthlyBreakdown: MonthlyBreakdown[]
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

const EMBASSY_REQUIREMENTS: Record<string, { min: number; currency: string; months: number; notes: string; specificChecks: string }> = {
  uk: {
    min: 2500, currency: 'GBP', months: 3,
    notes: `UK Visas and Immigration (UKVI) — what officers check line by line:
- Every balance figure across the full 3 months must stay above £2,500
- Salary credits must appear on consistent dates each month
- Any cash deposit must be explained — UKVI treats cash as suspicious by default
- No "funds parking" — large deposits in the 28 days before the statement end date are an instant flag
- No returned direct debits, no overdrafts, no unarranged borrowing
- Vague payee names ("BACS CREDIT", "FASTER PAYMENT") without a recognisable employer name are flagged
- Balance spikes in the final 4 weeks of the statement that are not salary are very high risk`,
    specificChecks: `UKVI-SPECIFIC CHECKS:
1. List every instance the balance fell below £2,500 with exact date and lowest point
2. Identify the salary credit date in each month — must be consistent (within 3 business days)
3. Flag any deposit over £500 that is NOT the identified salary — explain its source or flag it
4. Check the 28 days before statement close date for any large or unexplained deposits
5. Identify all cash withdrawals and deposits — list each one explicitly
6. Check for any "TFR", "TRANSFER", or "BACS" credits with no clear employer name
7. Verify the account holder name on the statement matches the applicant name
8. Note if the statement is from a recognised UK/Nigerian/Ghanaian bank and whether it appears official`,
  },
  canada: {
    min: 5000, currency: 'CAD', months: 3,
    notes: `IRCC (Canada) — what officers check line by line:
- Minimum CAD 5,000 consistently — not just at month end
- Salary credits must match the employment letter amount exactly
- Large deposits not from salary must be explained (gift letter, sale of asset, etc.)
- Funds parking pattern: balance suddenly rises in final month — this is an instant flag
- Gradual saving pattern is stronger than a sudden large deposit
- Business income must show regular monthly receipts, not lump sums`,
    specificChecks: `IRCC-SPECIFIC CHECKS:
1. Calculate the average daily balance for each month — not just the month-end figure
2. Flag any month where the balance dropped below CAD 5,000 at any point — with exact dates
3. Identify the source of every credit above CAD 500 — salary, transfer, cash, other
4. Check if the final month shows a sudden large deposit not present in earlier months
5. Check if salary amount matches stated employment income consistently each month
6. List all transfers received — from whom and how much`,
  },
  schengen: {
    min: 3000, currency: 'EUR', months: 3,
    notes: `Schengen Visa — what embassy officers check:
- Minimum €30–€50 per day of travel (2-week trip = €500–€700 minimum)
- General account minimum of €3,000 maintained throughout
- Salary credits should match payslips submitted
- Germany, France, Netherlands are strictest — they check for funds parking
- No overdrafts, no returned payments`,
    specificChecks: `SCHENGEN-SPECIFIC CHECKS:
1. Convert all balances to EUR equivalent if statement is in another currency
2. Identify the lowest balance in each month
3. Check if the account has enough for the planned trip (€50/day minimum)
4. Flag any large transfer-in within 30 days of the application date
5. Note if income is from employment, self-employment, or business — each requires different supporting docs`,
  },
  uae: {
    min: 3000, currency: 'USD', months: 3,
    notes: `UAE Tourist/Visit Visa — what DHA officers check:
- Minimum AED 10,000–15,000 (approx USD 2,700–4,000) maintained throughout
- Bank statements must show regular income — salary or business receipts
- For Nigerian/Ghanaian applicants: 6 months preferred, 3 months minimum
- Stamped and signed statements carry more weight
- Self-employed: business account credits should show consistent monthly revenue`,
    specificChecks: `UAE-SPECIFIC CHECKS:
1. Convert all balance figures to USD equivalent for the embassy threshold comparison
2. Identify whether this is a personal or business account
3. Flag any month where the balance dropped below USD 2,700
4. List all significant credits and their sources
5. Note the account closing balance and whether it comfortably exceeds the UAE threshold`,
  },
  usa: {
    min: 5000, currency: 'USD', months: 3,
    notes: `US B1/B2 — what consulate officers check:
- Minimum USD 5,000 is a guideline — the real test is financial stability and ties to home country
- Consistent income for 3–6 months shows genuine employment
- Funds parking in the 30 days before application = near-automatic denial
- Nigerian applicants face elevated scrutiny — officer will look for any pattern suggesting immigration intent
- Inconsistent income, dormant accounts suddenly becoming active, or large transfers from family are all flagged`,
    specificChecks: `US CONSULATE-SPECIFIC CHECKS:
1. Check if the account was dormant before the statement period — sudden activation is a red flag
2. Identify the 30 days before the statement end and flag any large unexplained deposits in that window
3. Calculate the stability score: how many months stayed above USD 5,000 throughout the full month?
4. List every transfer from a third party with amount and frequency
5. Note if income appears to be from self-employment or business — this requires additional documentation`,
  },
  australia: {
    min: 5000, currency: 'AUD', months: 3,
    notes: `Australia Tourist Visa (600) — what immigration officers check:
- Minimum AUD 5,000 for a typical trip
- Consistent income and savings pattern
- No large unexplained deposits
- Regular living expenses should be visible (rent, utilities, groceries) — shows genuine resident lifestyle`,
    specificChecks: `AUSTRALIA-SPECIFIC CHECKS:
1. Identify regular recurring expenses (rent, utilities) — their absence can suggest the account is not the applicant's main account
2. Flag the lowest point in each month
3. Note if the account shows a genuine savings pattern over the period
4. Identify all large credits and their sources`,
  },
  ghana: {
    min: 3000, currency: 'USD', months: 3,
    notes: `Ghanaian applicants — same destination thresholds apply. GHS amounts are converted to destination currency by embassy officers at the current exchange rate. Official letterhead and bank stamp are required.`,
    specificChecks: `GHANA-SPECIFIC CHECKS:
1. Note the currency of the statement (GHS or USD)
2. Convert all GHS figures to USD at approximate current rate (check rate at time of statement)
3. Apply the destination-specific threshold in USD equivalent
4. Flag if the statement lacks a bank stamp or official letterhead`,
  },
  nigeria: {
    min: 3000, currency: 'USD', months: 3,
    notes: `Nigerian applicants — same destination thresholds apply. NGN amounts are converted by embassy officers. ₦2M–₦5M at ~₦1,600/USD = approx USD 1,250–3,125 — borderline for most applications. Bank stamp and signature required.`,
    specificChecks: `NIGERIA-SPECIFIC CHECKS:
1. Note the currency of the statement (NGN or USD)
2. Convert all NGN figures to USD at approximately ₦1,600/USD (or the rate visible on the statement date)
3. State the USD equivalent of the average monthly balance, lowest balance, and closing balance clearly in agentNotes
4. Flag if the statement lacks bank stamp and authorised signatory
5. Note the bank name — tier-1 banks (GTBank, Access, Zenith, UBA, First Bank) carry more credibility with embassies`,
  },
}

// ─── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompts(destination: string, applicantName: string, passportCountry: string, extractedText = '') {
  const key = destination.toLowerCase().replace(/\s+/g, '')
  const req = EMBASSY_REQUIREMENTS[key] ?? EMBASSY_REQUIREMENTS['uk']

  const system = `You are a senior visa application specialist and forensic financial analyst with 15 years of experience at a premium travel consultancy. You analyse bank statements for visa applications and know exactly what embassy officers look for.

Rules:
- Read every transaction on the statement — use the EXACT currency shown (never assume)
- Calculate figures from the actual numbers — no estimates
- In agentNotes be brutally direct — this is internal only
- Do NOT list every routine transaction. The monthlyBreakdown contains SUMMARY figures + ONLY notable/suspicious transactions per month`

  const textSection = extractedText.trim().length > 200
    ? `\n\nBANK STATEMENT TEXT:\n---\n${extractedText.slice(0, 80000)}\n---\n`
    : ''

  const user = `Analyse the bank statement ${extractedText.trim().length > 200 ? 'text below' : 'PDF attached above'} for a ${destination.toUpperCase()} visa application.

APPLICANT: ${applicantName} | PASSPORT: ${passportCountry} | DESTINATION: ${destination.toUpperCase()}
MINIMUM THRESHOLD: ${req.min} ${req.currency} consistently over ${req.months} months.

EMBASSY REQUIREMENTS (${destination.toUpperCase()}):
${req.notes}

${req.specificChecks}
${textSection}
READ EVERY PAGE AND EVERY TRANSACTION. Then output the JSON below.

RULES FOR monthlyBreakdown.transactions — IMPORTANT:
- Include ONLY transactions that are notable, suspicious, or need embassy attention
- Do NOT list every grocery purchase or utility payment — skip routine debits
- DO include: all salary/income credits, all cash transactions, all large debits (>10% of monthly balance), any round-number deposits, any returned payments, any unidentified transfers
- This keeps the JSON concise so nothing gets cut off

Return ONLY valid JSON. Start with {. No markdown, no preamble.

{
  "status": "PASS | REVIEW | FLAG",
  "currency": "exact currency from statement (GBP / NGN / USD / etc.)",
  "statementPeriod": "Month YYYY – Month YYYY",
  "monthsAnalyzed": 3,
  "averageMonthlyBalance": 0,
  "lowestBalance": 0,
  "highestBalance": 0,
  "closingBalance": 0,
  "totalCredits": 0,
  "totalDebits": 0,
  "incomeRegular": true,
  "estimatedMonthlyIncome": 0,
  "salaryCreditsDetected": true,
  "salaryAmount": 0,
  "salaryFrequency": "monthly",
  "otherIncomeSources": ["e.g. rental income from XYZ"],
  "monthlyBreakdown": [
    {
      "month": "July 2023",
      "openingBalance": 0,
      "closingBalance": 0,
      "totalCredits": 0,
      "totalDebits": 0,
      "transactions": [
        {
          "date": "01 Jul 2023",
          "description": "EXACT DESCRIPTION FROM STATEMENT",
          "amount": 0,
          "type": "credit",
          "runningBalance": 0,
          "flag": "reason if suspicious, otherwise null"
        }
      ]
    }
  ],
  "suspiciousTransactions": [
    {
      "date": "date",
      "description": "exact description from statement",
      "amount": 0,
      "type": "debit",
      "reason": "why this is a concern for the embassy",
      "severity": "high | medium | low"
    }
  ],
  "balanceDipsBelow": [
    { "date": "exact date", "balance": 0, "threshold": ${req.min} }
  ],
  "largeUnexplainedWithdrawals": [
    { "date": "date", "amount": 0, "description": "exact description" }
  ],
  "embassyThresholdMet": true,
  "embassyMinimumRequired": ${req.min},
  "embassyCurrency": "${req.currency}",
  "overdraftsDetected": false,
  "overdraftCount": 0,
  "roundNumberDeposits": false,
  "unusualDepositPattern": false,
  "recommendations": [
    "Specific recommendation with actual dates and amounts from this statement"
  ],
  "summary": "2–3 sentences client-facing. Honest but encouraging. Never say PASS/REVIEW/FLAG.",
  "agentNotes": "Internal only. (1) Financial health verdict. (2) Specific concerns with exact dates/amounts. (3) Proceed or wait? (4) What must client provide?",
  "confidence": "high | medium | low",
  "warnings": ["specific warning with date/amount"]
}`

  return { system, user, req }
}

// ─── Claude (document API + JSON prefill) ────────────────────────────────────

async function analyzeWithClaudeDocument(
  base64Pdf: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
): Promise<BankStatementAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { system, user } = buildPrompts(destination, applicantName, passportCountry)

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
        { role: 'assistant', content: '{' },
      ],
    }) as Message
  } catch (e) {
    throw new Error(`Claude API error: ${e instanceof Error ? e.message : String(e)}`)
  }

  const tail = response.content[0].type === 'text' ? response.content[0].text : ''
  const raw  = '{' + tail
  console.log('[Claude-doc] stop_reason:', response.stop_reason, '| raw preview:', raw.slice(0, 300))

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
  console.log('[Claude-text] stop_reason:', response.stop_reason, '| raw preview:', raw.slice(0, 300))

  const parsed = JSON.parse(raw) as BankStatementAnalysis
  return { ...parsed, analysisEngine: 'Claude claude-sonnet-4-6' }
}

// ─── OpenAI GPT-4o ───────────────────────────────────────────────────────────

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
    max_tokens:      8000,
    temperature:     0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user   },
    ],
  })

  const raw = response.choices[0]?.message?.content ?? ''
  console.log('[OpenAI] finish_reason:', response.choices[0]?.finish_reason)

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

export async function analyzeBankStatement(
  pdfBuffer: Buffer,
  destination: string,
  applicantName: string,
  passportCountry = 'Nigeria',
): Promise<BankStatementAnalysis> {
  const key = destination.toLowerCase().replace(/\s+/g, '')
  const req = EMBASSY_REQUIREMENTS[key] ?? EMBASSY_REQUIREMENTS['uk']
  const base64Pdf = pdfBuffer.toString('base64')

  // 1. Claude document API — reads the actual PDF visually (best for all PDF types)
  try {
    const result = await analyzeWithClaudeDocument(base64Pdf, destination, applicantName, passportCountry)
    console.log('[analyzeBankStatement] Claude-doc succeeded, status:', result.status)
    return result
  } catch (e) {
    console.warn('[analyzeBankStatement] Claude-doc failed:', e instanceof Error ? e.message : e)
  }

  // 2. Extract text fallback
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
    monthlyBreakdown: [],
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
    agentNotes: 'ANALYSIS UNAVAILABLE — All AI engines failed. Check ANTHROPIC_API_KEY and OPENAI_API_KEY.',
    confidence: 'low',
    warnings: ['Automatic analysis unavailable — manual review required'],
    analysisEngine: 'none',
  }
}
