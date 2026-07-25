// lib/jade/intelligence-v2.ts
// Jade Intelligence v4.2 — Features 8-14

import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendReply } from '@/lib/jade/chatwoot-client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const SITE = process.env.NEXT_PUBLIC_BASE_URL || 'https://walztravels.com'

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 8 — VISA APPROVAL PROBABILITY ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export interface VisaInput {
  nationality:          string
  destination:          string
  employmentStatus:     'employed' | 'self_employed' | 'student' | 'retired' | 'unemployed'
  intendedStayDays:     number
  averageBalanceLocal:  number     // in local currency (e.g. NGN)
  incomeCurrency:       string     // e.g. NGN, GHS, GBP
  monthsOfBankHistory:  number
  propertyOwned?:       boolean
  marriedWithFamily?:   boolean
  previousRefusals?:    number
  previousTravel?:      string[]   // IATA country codes e.g. ['AE','TR','US']
  hasJobOffer?:         boolean
  hasSponsor?:          boolean
  sponsorRelation?:     string
  purposeOfVisit?:      string
  conversationId?:      string
}

export interface VisaAssessment {
  score:          number
  band:           'Strong' | 'Good' | 'Fair' | 'Weak' | 'Poor'
  recommendation: string
  strengths:      string[]
  risks:          Array<{ issue: string; fix: string; timeline: string; fatal: boolean }>
  blockers:       string[]
  quickWins:      string[]
}

// Per-day minimum balance in GBP equivalent for each destination
const PER_DAY_GBP: Record<string, number> = {
  uk: 95, 'united kingdom': 95,
  usa: 85, 'united states': 85,
  canada: 80,
  schengen: 75, france: 75, germany: 75, italy: 75, spain: 75, netherlands: 75,
  uae: 65, dubai: 65,
  australia: 90,
  ireland: 85,
  malaysia: 40,
  turkey: 30,
  'south africa': 50,
}

// Rough exchange to GBP (approximate — not live)
const LOCAL_TO_GBP: Record<string, number> = {
  NGN: 0.00052, GHS: 0.065, KES: 0.0058, ZAR: 0.042,
  GBP: 1, USD: 0.79, EUR: 0.86, CAD: 0.58, AED: 0.21,
}

function normalizeDestination(dest: string): string {
  return dest.toLowerCase().trim()
}

export function assessVisaProbability(input: VisaInput): VisaAssessment {
  let score = 0
  const strengths: string[] = []
  const risks: VisaAssessment['risks'] = []
  const blockers: string[] = []
  const quickWins: string[] = []

  const dest = normalizeDestination(input.destination)
  const perDayGbp = PER_DAY_GBP[dest] ?? 70
  const toGbp = LOCAL_TO_GBP[input.incomeCurrency] ?? 0.001
  const balanceGbp = input.averageBalanceLocal * toGbp
  const requiredGbp = perDayGbp * input.intendedStayDays
  const ratio = balanceGbp / Math.max(requiredGbp, 1)

  // 1. Financial standing (0-30 pts)
  if (ratio >= 3)       { score += 30; strengths.push(`Strong funds: £${Math.round(balanceGbp).toLocaleString()} — ${Math.round(ratio)}× the ${input.intendedStayDays}-day requirement`) }
  else if (ratio >= 2)  { score += 22; strengths.push(`Adequate funds: £${Math.round(balanceGbp).toLocaleString()} — ${Math.round(ratio)}× the requirement`) }
  else if (ratio >= 1.2){ score += 14; quickWins.push(`Increase bank balance to at least £${Math.round(requiredGbp * 2).toLocaleString()} (2× required) before applying`) }
  else if (ratio >= 0.8){ score += 6;  risks.push({ issue: `Low funds: £${Math.round(balanceGbp).toLocaleString()} vs £${Math.round(requiredGbp).toLocaleString()} required`, fix: 'Raise balance to 2× minimum before applying', timeline: '2-3 months', fatal: false }) }
  else { blockers.push(`Critically low funds: have £${Math.round(balanceGbp).toLocaleString()}, need at least £${Math.round(requiredGbp).toLocaleString()}`) }

  // 2. Bank history (0-10 pts)
  if (input.monthsOfBankHistory >= 6)      { score += 10; strengths.push(`${input.monthsOfBankHistory} months of bank statements`) }
  else if (input.monthsOfBankHistory >= 3) { score += 6;  quickWins.push('Get 6 months of statements — request earlier months from bank') }
  else { risks.push({ issue: `Only ${input.monthsOfBankHistory} months of bank history`, fix: 'Wait and build 6+ months of clean history', timeline: `${6 - input.monthsOfBankHistory} months`, fatal: false }) }

  // 3. Employment type (0-20 pts)
  const empScores: Record<string, number> = { employed: 20, retired: 18, self_employed: 12, student: 10, unemployed: 0 }
  score += empScores[input.employmentStatus] ?? 0
  if (input.employmentStatus === 'employed')      strengths.push('Full-time employment is a strong tie to home country')
  else if (input.employmentStatus === 'retired')  strengths.push('Retired status shows financial stability')
  else if (input.employmentStatus === 'self_employed') quickWins.push('Provide 2 years of business accounts and a strong client list')
  else if (input.employmentStatus === 'student')  quickWins.push('Provide enrollment letter, sponsor letter, and sponsor bank statements')
  else risks.push({ issue: 'Unemployed status is a significant visa risk', fix: 'Get a job offer or a strong sponsor before applying', timeline: '1-3 months', fatal: true })

  // 4. Home ties (0-10 pts)
  if (input.propertyOwned) { score += 6; strengths.push('Property ownership demonstrates strong home ties') }
  if (input.marriedWithFamily) { score += 4; strengths.push('Family ties reduce overstay risk') }
  if (!input.propertyOwned && !input.marriedWithFamily) {
    risks.push({ issue: 'Weak home ties — no property, no immediate family to return to', fix: 'Provide employment contract, utility bills, lease agreements', timeline: 'Immediate', fatal: false })
  }

  // 5. Travel history (0-10 pts)
  const prev = input.previousTravel || []
  const visaStrong = ['US', 'GB', 'CA', 'AU', 'JP', 'DE', 'FR', 'NL', 'IE', 'AE']
  const strongPrior = prev.filter(c => visaStrong.includes(c.toUpperCase()))
  if (strongPrior.length >= 3)  { score += 10; strengths.push(`Strong travel history: ${strongPrior.join(', ')} — demonstrates visa compliance`) }
  else if (strongPrior.length >= 1) { score += 6; strengths.push(`Prior travel to ${strongPrior.join(', ')} helps`) }
  else if (prev.length === 0) quickWins.push('First-time applicants should add explanatory cover letter stressing strong ties to home')

  // 6. Previous refusals (-20 per refusal, flagged)
  const refusals = input.previousRefusals ?? 0
  if (refusals > 0) {
    const penalty = Math.min(refusals * 15, 35)
    score -= penalty
    if (refusals === 1) risks.push({ issue: '1 prior refusal — must be addressed in cover letter', fix: 'Write a detailed rebuttal explaining what changed since the refusal', timeline: 'Before applying', fatal: false })
    else blockers.push(`${refusals} prior refusals — high-risk profile. Fix every underlying issue before reapplying.`)
  } else {
    score += 5
    strengths.push('No prior refusals')
  }

  // 7. Sponsor (0-10 pts if applicable)
  if (input.hasSponsor) {
    score += 8
    strengths.push(`Sponsored by ${input.sponsorRelation || 'a host'} — reduces financial burden concerns`)
    quickWins.push('Ensure sponsor provides: invitation letter, bank statements (3+ months), proof of status/residency, and relationship proof')
  }

  // 8. Stay length adjustment (long stays increase scrutiny)
  if (input.intendedStayDays > 90) {
    score -= 8
    risks.push({ issue: `Long intended stay (${input.intendedStayDays} days) increases overstay scrutiny`, fix: 'Shorten planned stay or provide very strong ties to home', timeline: 'Before applying', fatal: false })
  } else if (input.intendedStayDays <= 14) {
    score += 5
    strengths.push('Short intended stay (lower overstay risk profile)')
  }

  // Clamp
  score = Math.max(0, Math.min(100, score))

  let band: VisaAssessment['band']
  let recommendation: string
  if      (score >= 85) { band = 'Strong'; recommendation = 'Your profile is strong. Apply with confidence. Keep documents well-organised and your cover letter concise.' }
  else if (score >= 70) { band = 'Good';   recommendation = 'Solid application. Address the flagged gaps before submitting — a strong cover letter will help.' }
  else if (score >= 55) { band = 'Fair';   recommendation = 'Viable but risks exist. Fix the quick wins first and give it 4-6 weeks before applying.' }
  else if (score >= 40) { band = 'Weak';   recommendation = 'Significant gaps need addressing. Applying now risks a refusal that will hurt future applications. Fix the blockers first.' }
  else                  { band = 'Poor';   recommendation = 'Do not apply yet — a refusal at this stage would close future doors. Address all blockers first.' }

  return { score, band, recommendation, strengths, risks, blockers, quickWins }
}

export async function saveVisaAssessment(assessment: VisaAssessment, input: VisaInput): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('visa_assessments').insert({
      conversation_id: input.conversationId,
      nationality:     input.nationality,
      destination:     input.destination,
      score:           assessment.score,
      band:            assessment.band,
      recommendation:  assessment.recommendation,
    })
  } catch { /* non-fatal */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 9 — VOICE NOTE INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════

export interface VoiceAnalysis {
  transcript:  string
  language:    'en' | 'pidgin' | 'yoruba' | 'igbo' | 'hausa' | 'twi' | 'fr' | 'unknown'
  intent:      string
  urgency:     'high' | 'medium' | 'low'
  entities:    { destination?: string; dates?: string; budget?: string; party?: string; visaCountry?: string }
  replyLanguage: string
}

export async function transcribeVoiceNote(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const { OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : mimeType.includes('webm') ? 'webm' : 'mp3'
  const ab   = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer
  const blob = new Blob([ab], { type: mimeType })
  const file = new File([blob], `voice.${ext}`, { type: mimeType })

  const transcript = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'en',
    prompt: 'This is a message to a travel agency. Caller may speak Nigerian Pidgin, Yoruba, Igbo, Hausa, or Ghanaian Twi. Travel terms: Lagos, Accra, Abuja, London, Dubai, Canada visa, flights, book.',
  })
  return transcript.text
}

export async function analyzeVoiceTranscript(transcript: string): Promise<VoiceAnalysis> {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 400,
    messages: [{ role: 'user', content: `Analyze this travel customer voice message transcript and return JSON ONLY:

"${transcript}"

{
  "transcript": "cleaned transcript",
  "language": "en|pidgin|yoruba|igbo|hausa|twi|fr|unknown",
  "intent": "what they want (one phrase)",
  "urgency": "high|medium|low",
  "entities": {"destination":"...","dates":"...","budget":"...","party":"...","visaCountry":"..."},
  "replyLanguage": "instruction for how to reply e.g. 'reply in Pidgin English, warm tone' or 'reply in English, formal'"
}` }],
  })
  const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
  try {
    return JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')) as VoiceAnalysis
  } catch {
    return {
      transcript, language: 'en', intent: 'travel inquiry', urgency: 'medium',
      entities: {}, replyLanguage: 'reply in English, warm and helpful tone',
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 10 — FX TIMING ADVISOR
// ═══════════════════════════════════════════════════════════════════════════

interface FxCache { rate: number; fetched: number }
const fxCache = new Map<string, FxCache>()
const FX_TTL_MS = 3_600_000 // 1 hour

// Reference 30-day ranges (updated quarterly — approximate)
const FX_RANGES: Record<string, { low: number; high: number }> = {
  'GBP-NGN': { low: 1_850, high: 2_150 },
  'USD-NGN': { low: 1_480, high: 1_700 },
  'EUR-NGN': { low: 1_620, high: 1_900 },
  'GBP-GHS': { low: 15.8, high: 19.5 },
  'USD-GHS': { low: 12.5, high: 16.0 },
  'EUR-GHS': { low: 13.8, high: 17.2 },
  'GBP-KES': { low: 163, high: 200 },
  'GBP-ZAR': { low: 22.8, high: 26.5 },
}

async function getLiveRate(from: string, to: string): Promise<number | null> {
  const key = `${from}-${to}`
  const cached = fxCache.get(key)
  if (cached && Date.now() - cached.fetched < FX_TTL_MS) return cached.rate

  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const data = await res.json()
    const rate = data.rates?.[to]
    if (!rate) return null
    fxCache.set(key, { rate, fetched: Date.now() })
    return rate
  } catch {
    return null
  }
}

export interface FxAdvice {
  pair:          string
  currentRate:   number
  percentile30d: number   // 0-100: where today sits vs 30d range
  trend:         'improving' | 'worsening' | 'stable'
  advice:        'pay_now' | 'wait' | 'neutral'
  message:       string
}

export async function getFxTimingAdvice(fromCurrency: string, toCurrency: string): Promise<FxAdvice | null> {
  const from = fromCurrency.toUpperCase()
  const to   = toCurrency.toUpperCase()
  const rate = await getLiveRate(from, to)
  if (!rate) return null

  const range = FX_RANGES[`${from}-${to}`]
  const pair  = `${from}/${to}`

  if (!range) {
    return {
      pair, currentRate: rate, percentile30d: 50, trend: 'stable', advice: 'neutral',
      message: `Current ${pair} rate: ${rate.toLocaleString()}. I don't have enough historical data for a timing recommendation on this pair.`,
    }
  }

  const { low, high } = range
  const percentile30d = Math.round(((rate - low) / (high - low)) * 100)
  const clampedPct = Math.max(0, Math.min(100, percentile30d))

  // High rate = bad for buyer of foreign currency (e.g. NGN buyer paying more NGN per GBP)
  // We're advising someone paying in NGN/GHS to buy GBP/USD
  // So: low percentile = good (cheap to buy GBP), high = expensive
  let advice: FxAdvice['advice']
  let trend: FxAdvice['trend']
  let message: string

  if (clampedPct <= 25) {
    advice = 'pay_now'; trend = 'improving'
    message = `✅ ${pair} is near its 30-day low (${clampedPct}th percentile). This is a good rate — I'd pay now rather than risk it rising. Current: ${rate.toLocaleString()} ${to} per ${from}.`
  } else if (clampedPct >= 75) {
    advice = 'wait'; trend = 'worsening'
    message = `⏳ ${pair} is near its 30-day high (${clampedPct}th percentile). Rates have been cheaper recently — if you have a week or two, it may be worth watching for a dip. Current: ${rate.toLocaleString()} ${to} per ${from}.`
  } else {
    advice = 'neutral'; trend = 'stable'
    message = `ℹ️ ${pair} is near the middle of its 30-day range (${clampedPct}th percentile). No strong signal either way — pay when it's convenient. Current: ${rate.toLocaleString()} ${to} per ${from}.`
  }

  return { pair, currentRate: rate, percentile30d: clampedPct, trend, advice, message }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 11 — FAMILY CONSTELLATION MEMORY
// ═══════════════════════════════════════════════════════════════════════════

export interface FamilyMember {
  name:          string
  relation:      string    // e.g. 'mum', 'brother', 'uncle'
  location?:     string    // where they live
  visaStatus?:   string    // e.g. 'UK citizen', 'needs Schengen visa'
  travelPattern?: string   // e.g. 'visits every December'
  lastMentioned?: string   // ISO date
}

export async function recordFamilyMember(
  primaryClientId: string,
  member: FamilyMember,
  householdName?: string,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data: existing } = await supabase
    .from('family_constellations').select('*').eq('primary_client', primaryClientId).maybeSingle()

  if (!existing) {
    await supabase.from('family_constellations').insert({
      id: `fc_${Date.now()}`,
      primary_client: primaryClientId,
      household_name: householdName || null,
      members: [{ ...member, lastMentioned: new Date().toISOString() }],
    })
  } else {
    const members = (existing.members as FamilyMember[]) || []
    const idx = members.findIndex(m => m.name.toLowerCase() === member.name.toLowerCase() && m.relation === member.relation)
    if (idx >= 0) {
      members[idx] = { ...members[idx], ...member, lastMentioned: new Date().toISOString() }
    } else {
      members.push({ ...member, lastMentioned: new Date().toISOString() })
    }
    await supabase.from('family_constellations').update({ members, updated_at: new Date().toISOString() }).eq('primary_client', primaryClientId)
  }
}

export async function getFamilyConstellation(primaryClientId: string): Promise<FamilyMember[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('family_constellations').select('members').eq('primary_client', primaryClientId).maybeSingle()
  return (data?.members as FamilyMember[]) || []
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 12 — VISA REJECTION RECOVERY ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export interface RefusalGround {
  number:      number
  rawText:     string       // caseworker's exact wording
  translation: string       // plain English
  whatTheyWanted: string    // what the caseworker actually needed
  evidenceFix: string       // exact evidence that answers it
  fatal:       boolean      // would alone cause rejection
}

export interface RefusalAnalysis {
  country:          string
  grounds:          RefusalGround[]
  overallStrategy:  string
  evidenceChecklist: string[]
  coverLetterOutline: string[]
  timeToReapply:    string
  strengthenFirst:  string[]
}

export async function analyzeVisaRefusal(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
): Promise<RefusalAnalysis> {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 1200,
    messages: [{ role: 'user', content: [{
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: imageBase64 },
    }, {
      type: 'text',
      text: `This is a visa refusal letter. Extract every refusal ground and build a full reapplication strategy. Return valid JSON ONLY:
{
  "country": "country that refused",
  "grounds": [{"number":1,"rawText":"exact wording from letter","translation":"plain English meaning","whatTheyWanted":"what evidence they needed","evidenceFix":"exactly what document/evidence fixes this","fatal":true}],
  "overallStrategy": "2-3 sentence strategy for the reapplication",
  "evidenceChecklist": ["list of every document needed"],
  "coverLetterOutline": ["point 1 to address in cover letter","point 2",...],
  "timeToReapply": "e.g. immediately / wait 3 months / wait 6 months",
  "strengthenFirst": ["what to fix before reapplying"]
}`,
    }] }],
  })
  const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
  try {
    return JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')) as RefusalAnalysis
  } catch {
    return {
      country: 'Unknown', grounds: [],
      overallStrategy: 'Unable to read refusal letter. Please send a clearer image.',
      evidenceChecklist: [], coverLetterOutline: [], timeToReapply: 'unknown', strengthenFirst: [],
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 13 — JADE WHISPER (RE-ENGAGEMENT)
// ═══════════════════════════════════════════════════════════════════════════

export type WhisperStage =
  | 'price_shock' | 'ready_then_vanished' | 'visa_anxiety' | 'comparison_shopping'
  | 'decision_pending' | 'payment_abandoned' | 'cold_lead' | 'unresponsive'

// Schedule: [firstWhisperHours, secondWhisperHours, ...]
const WHISPER_SCHEDULE: Record<WhisperStage, number[]> = {
  price_shock:        [30, 168],
  ready_then_vanished: [3, 24, 120],
  visa_anxiety:       [24, 72],
  comparison_shopping: [12, 48],
  decision_pending:   [48, 120],
  payment_abandoned:  [1, 6, 24],
  cold_lead:          [168, 336],
  unresponsive:       [72, 240],
}

const MAX_WHISPERS: Record<WhisperStage, number> = {
  price_shock: 2, ready_then_vanished: 3, visa_anxiety: 2, comparison_shopping: 2,
  decision_pending: 2, payment_abandoned: 3, cold_lead: 2, unresponsive: 2,
}

export async function registerForWhisper(opts: {
  conversationId: string
  contactPhone:   string | null
  contactName?:   string | null
  destination?:   string
  quotedPrice?:   string
  stageNote:      WhisperStage
  lastActivityAt?: string
}): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase.from('whisper_queue').upsert({
    conversation_id: opts.conversationId,
    contact_phone:   opts.contactPhone,
    contact_name:    opts.contactName,
    destination:     opts.destination,
    quoted_price:    opts.quotedPrice,
    stage_note:      opts.stageNote,
    last_activity:   opts.lastActivityAt || new Date().toISOString(),
    is_active:       true,
  }, { onConflict: 'conversation_id' })
}

async function generateWhisperMessage(
  stage: WhisperStage,
  ctx: { destination?: string; quotedPrice?: string; contactName?: string; attemptNumber: number },
): Promise<string> {
  const stageContext: Record<WhisperStage, string> = {
    price_shock:        "They went quiet after seeing the price. Don't apologise for the price. Continue the thread from where it stopped, maybe mention value or offer to look at options.",
    ready_then_vanished: "They seemed ready to book and then disappeared. Continue the thread like no time has passed — don't say 'I noticed you went quiet'.",
    visa_anxiety:       "They're nervous about their visa chances. Offer specific reassurance or the next concrete step.",
    comparison_shopping: "They're likely checking other agents. Give a reason to come back — specific expertise, a better deal, or personal service.",
    decision_pending:   "They're deciding. Give them something to decide with — one specific recommendation or a deadline (fare changes).",
    payment_abandoned:  "They started to pay and stopped. Pick up right where the booking process was.",
    cold_lead:          "Haven't spoken in a while. Reference the trip they were interested in and make it easy to restart.",
    unresponsive:       "Multiple messages haven't been seen. One final check-in, then stop.",
  }

  const prompt = `You are Jade, the AI travel consultant for Walz Travels. Write a short re-engagement WhatsApp message for this situation:

Stage: ${stage} — ${stageContext[stage]}
Destination: ${ctx.destination || 'not specified'}
Quoted price: ${ctx.quotedPrice || 'not specified'}
Client name: ${ctx.contactName || 'not specified'}
Attempt number: ${ctx.attemptNumber}

Rules:
- NEVER say "just checking in", "following up", "I noticed you went quiet", or similar
- Continue the THREAD — assume the last message never ended, just pick up naturally
- 1-3 sentences maximum
- WhatsApp-friendly tone, warm but not pushy
- If attempt 2+, try a different angle (price, urgency, different option)
- Do NOT ask multiple questions — end with one clear opening

Return ONLY the message text, no extra commentary.`

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  })
  return res.content[0].type === 'text' ? res.content[0].text.trim() : ''
}

export async function processWhisperQueue(): Promise<{ processed: number; sent: number }> {
  const supabase = getSupabaseAdmin()
  const { data: queue } = await supabase
    .from('whisper_queue').select('*').eq('is_active', true)
  if (!queue?.length) return { processed: 0, sent: 0 }

  let processed = 0; let sent = 0
  const now = new Date()

  for (const row of queue) {
    processed++
    const stage = row.stage_note as WhisperStage
    const schedule = WHISPER_SCHEDULE[stage] || []
    const maxAttempts = MAX_WHISPERS[stage] || 2
    const count = row.whisper_count || 0

    if (count >= maxAttempts) {
      await supabase.from('whisper_queue').update({ is_active: false }).eq('conversation_id', row.conversation_id)
      continue
    }

    const lastActivity = new Date(row.last_activity)
    const hoursScheduled = schedule[count]
    if (!hoursScheduled) continue

    const dueAt = new Date(lastActivity.getTime() + hoursScheduled * 3_600_000)
    if (dueAt > now) continue

    // Due — generate and send
    try {
      const msg = await generateWhisperMessage(stage, {
        destination:   row.destination,
        quotedPrice:   row.quoted_price,
        contactName:   row.contact_name,
        attemptNumber: count + 1,
      })
      if (msg) {
        await sendReply(Number(row.conversation_id), msg)
        await supabase.from('whisper_queue').update({
          whisper_count:   count + 1,
          last_whisper_at: now.toISOString(),
          is_active:       count + 1 < maxAttempts,
        }).eq('conversation_id', row.conversation_id)
        sent++
      }
    } catch (e) {
      console.error(`[whisper] conv=${row.conversation_id} error:`, e)
    }
  }

  return { processed, sent }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 14 — CULTURAL BRIDGE & IMMIGRATION COACH
// ═══════════════════════════════════════════════════════════════════════════

export interface ArrivalPack {
  destination:        string
  immigrationQuestions: Array<{ question: string; goodAnswer: string; avoid: string }>
  handLuggageDocs:    string[]
  redFlags:           string[]
  culturalBriefing:   string[]
  localPhrases:       Array<{ phrase: string; meaning: string; when: string }>
  firstDayPlan:       string[]
  emergencyNumbers:   Array<{ label: string; number: string }>
}

export async function generateArrivalPack(
  destination: string,
  nationality: string,
  purposeOfVisit: string,
): Promise<ArrivalPack> {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 1500,
    messages: [{ role: 'user', content: `Generate a complete Arrival Pack for a ${nationality} traveller arriving in ${destination} for ${purposeOfVisit}. Return valid JSON ONLY:

{
  "destination": "${destination}",
  "immigrationQuestions": [
    {"question":"actual question an immigration officer might ask","goodAnswer":"what to say","avoid":"what not to say"}
  ],
  "handLuggageDocs": ["list of documents to keep in hand luggage"],
  "redFlags": ["things that trigger secondary questioning — avoid doing/saying these"],
  "culturalBriefing": ["3-5 key cultural norms or etiquette tips for ${destination}"],
  "localPhrases": [{"phrase":"local word/phrase","meaning":"what it means","when":"when to use it"}],
  "firstDayPlan": ["practical steps for day 1 after arrival — SIM card, currency, transport, orientation"],
  "emergencyNumbers": [{"label":"Police/Fire/Ambulance","number":"999"}]
}

Be specific and practical. 5-6 immigration questions. 4-6 local phrases. Tailor everything to ${nationality} travellers specifically.` }],
  })
  const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
  try {
    return JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')) as ArrivalPack
  } catch {
    return {
      destination, immigrationQuestions: [], handLuggageDocs: [], redFlags: [],
      culturalBriefing: [], localPhrases: [], firstDayPlan: [], emergencyNumbers: [],
    }
  }
}
