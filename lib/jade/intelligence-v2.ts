// lib/jade/intelligence-v2.ts
// Jade Intelligence v4.2 — Features 8-14

import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function sendToConversation(conversationId: string | number, content: string): Promise<void> {
  const base  = process.env.CW_BASE!
  const token = process.env.CW_TOKEN!
  await fetch(`${base}/api/v1/accounts/1/conversations/${conversationId}/messages`, {
    method:  'POST',
    headers: { api_access_token: token, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ content, message_type: 'outgoing', private: false }),
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 8 — VISA APPROVAL PROBABILITY ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export interface VisaApplicantProfile {
  nationality:          string
  destination:          string
  employmentStatus:     'employed' | 'self_employed' | 'student' | 'retired' | 'unemployed'
  employerName?:        string
  jobTitle?:            string
  monthsInRole?:        number
  annualIncomeGBP?:     number
  intendedStayDays:     number
  averageBalanceLocal:  number
  incomeCurrency:       string
  monthsOfBankHistory:  number
  hasSavingsAccount?:   boolean
  propertyOwned?:       boolean
  marriedWithFamily?:   boolean
  previousRefusals?:    number
  previousTravel?:      string[]
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
  feeGBP:         number
}

interface CountryWeight {
  perDayGBP:      number
  refusalPenalty: number
  feeGBP:         number
  scrutinyLevel:  'low' | 'medium' | 'high' | 'very_high'
}

const COUNTRY_WEIGHTS: Record<string, CountryWeight> = {
  uk:                 { perDayGBP: 95,  refusalPenalty: 20, feeGBP: 115, scrutinyLevel: 'very_high' },
  'united kingdom':   { perDayGBP: 95,  refusalPenalty: 20, feeGBP: 115, scrutinyLevel: 'very_high' },
  usa:                { perDayGBP: 85,  refusalPenalty: 25, feeGBP: 185, scrutinyLevel: 'very_high' },
  'united states':    { perDayGBP: 85,  refusalPenalty: 25, feeGBP: 185, scrutinyLevel: 'very_high' },
  canada:             { perDayGBP: 80,  refusalPenalty: 18, feeGBP: 85,  scrutinyLevel: 'high' },
  schengen:           { perDayGBP: 75,  refusalPenalty: 15, feeGBP: 90,  scrutinyLevel: 'high' },
  france:             { perDayGBP: 75,  refusalPenalty: 15, feeGBP: 90,  scrutinyLevel: 'high' },
  germany:            { perDayGBP: 75,  refusalPenalty: 15, feeGBP: 90,  scrutinyLevel: 'high' },
  italy:              { perDayGBP: 75,  refusalPenalty: 15, feeGBP: 90,  scrutinyLevel: 'high' },
  spain:              { perDayGBP: 75,  refusalPenalty: 15, feeGBP: 90,  scrutinyLevel: 'high' },
  netherlands:        { perDayGBP: 75,  refusalPenalty: 15, feeGBP: 90,  scrutinyLevel: 'high' },
  australia:          { perDayGBP: 90,  refusalPenalty: 20, feeGBP: 95,  scrutinyLevel: 'high' },
  ireland:            { perDayGBP: 85,  refusalPenalty: 15, feeGBP: 60,  scrutinyLevel: 'high' },
  uae:                { perDayGBP: 65,  refusalPenalty: 10, feeGBP: 80,  scrutinyLevel: 'medium' },
  dubai:              { perDayGBP: 65,  refusalPenalty: 10, feeGBP: 80,  scrutinyLevel: 'medium' },
  malaysia:           { perDayGBP: 40,  refusalPenalty: 5,  feeGBP: 25,  scrutinyLevel: 'low' },
  turkey:             { perDayGBP: 30,  refusalPenalty: 5,  feeGBP: 35,  scrutinyLevel: 'low' },
  'south africa':     { perDayGBP: 50,  refusalPenalty: 8,  feeGBP: 40,  scrutinyLevel: 'medium' },
}

const STRONG_TRAVEL_HISTORY = ['US','GB','CA','AU','JP','DE','FR','NL','IE','AE','CH','SE','NO','DK','SG','NZ']

// Units of local currency per 1 GBP (approximate — not live)
const UNITS_PER_GBP: Record<string, number> = {
  NGN: 1923, GHS: 15.4, KES: 172, ZAR: 23.8,
  GBP: 1, USD: 1.27, EUR: 1.16, CAD: 1.73, AED: 4.66,
}

export function calculateVisaProbability(p: VisaApplicantProfile): VisaAssessment {
  let score = 0
  const strengths: string[] = []
  const risks: VisaAssessment['risks'] = []
  const blockers: string[] = []
  const quickWins: string[] = []

  const dest = p.destination.toLowerCase().trim()
  const w = COUNTRY_WEIGHTS[dest] || { perDayGBP: 70, refusalPenalty: 15, feeGBP: 80, scrutinyLevel: 'medium' as const }

  const unitsPerGBP = UNITS_PER_GBP[p.incomeCurrency] || 1000
  const balanceGBP  = p.averageBalanceLocal / unitsPerGBP
  const requiredGBP = w.perDayGBP * p.intendedStayDays
  const ratio       = balanceGBP / Math.max(requiredGBP, 1)

  // 1. Financial standing (0-30)
  if (ratio >= 3)        { score += 30; strengths.push(`Strong funds: £${Math.round(balanceGBP).toLocaleString()} — ${Math.round(ratio)}× the ${p.intendedStayDays}-day requirement`) }
  else if (ratio >= 2)   { score += 22; strengths.push(`Adequate funds: £${Math.round(balanceGBP).toLocaleString()} — ${Math.round(ratio)}× the requirement`) }
  else if (ratio >= 1.2) { score += 14; quickWins.push(`Increase bank balance to at least £${Math.round(requiredGBP * 2).toLocaleString()} (2× required) before applying`) }
  else if (ratio >= 0.8) { score += 6;  risks.push({ issue: `Low funds: £${Math.round(balanceGBP).toLocaleString()} vs £${Math.round(requiredGBP).toLocaleString()} required`, fix: 'Raise balance to 2× minimum before applying', timeline: '2-3 months', fatal: false }) }
  else                   { blockers.push(`Critically low funds: have £${Math.round(balanceGBP).toLocaleString()}, need at least £${Math.round(requiredGBP).toLocaleString()}`) }

  // 2. Bank history (0-10)
  if (p.monthsOfBankHistory >= 6)      { score += 10; strengths.push(`${p.monthsOfBankHistory} months of bank statements`) }
  else if (p.monthsOfBankHistory >= 3) { score += 6;  quickWins.push('Get 6 months of statements — request earlier months from bank') }
  else { risks.push({ issue: `Only ${p.monthsOfBankHistory} months of bank history`, fix: 'Wait and build 6+ months of clean history', timeline: `${6 - p.monthsOfBankHistory} months`, fatal: false }) }

  // 3. Employment (0-20)
  const empScores: Record<string, number> = { employed: 20, retired: 18, self_employed: 12, student: 10, unemployed: 0 }
  score += empScores[p.employmentStatus] ?? 0
  if (p.employmentStatus === 'employed') {
    const tenure = p.monthsInRole || 0
    strengths.push(tenure >= 12
      ? `Full-time employment (${Math.floor(tenure/12)}y${tenure%12}m tenure) — strong home country tie`
      : 'Full-time employment is a strong tie to home country')
    if (tenure < 6) quickWins.push('Less than 6 months in role — provide prior employment history to show stability')
  } else if (p.employmentStatus === 'retired') {
    strengths.push('Retired status shows financial stability')
  } else if (p.employmentStatus === 'self_employed') {
    quickWins.push('Provide 2 years of business accounts, tax returns, and a strong client list')
  } else if (p.employmentStatus === 'student') {
    quickWins.push('Provide enrollment letter, sponsor letter, and sponsor bank statements')
  } else {
    risks.push({ issue: 'Unemployed status is a significant visa risk', fix: 'Get a job offer or a strong sponsor before applying', timeline: '1-3 months', fatal: true })
  }

  // 4. Home ties (0-10)
  if (p.propertyOwned)     { score += 6; strengths.push('Property ownership demonstrates strong home ties') }
  if (p.marriedWithFamily) { score += 4; strengths.push('Family ties reduce overstay risk') }
  if (!p.propertyOwned && !p.marriedWithFamily) {
    risks.push({ issue: 'Weak home ties — no property, no immediate family to return to', fix: 'Provide employment contract, utility bills, lease agreements', timeline: 'Immediate', fatal: false })
  }

  // 5. Travel history (0-10)
  const prev       = p.previousTravel || []
  const strongPrior = prev.filter(c => STRONG_TRAVEL_HISTORY.includes(c.toUpperCase()))
  if (strongPrior.length >= 3)     { score += 10; strengths.push(`Strong travel history: ${strongPrior.join(', ')} — demonstrates visa compliance`) }
  else if (strongPrior.length >= 1){ score += 6;  strengths.push(`Prior travel to ${strongPrior.join(', ')} helps`) }
  else if (prev.length === 0)      { quickWins.push('First-time applicants should add an explanatory cover letter stressing strong ties to home') }

  // 6. Refusals — country-specific penalty
  const refusals = p.previousRefusals ?? 0
  if (refusals > 0) {
    const penalty = Math.min(refusals * w.refusalPenalty, 40)
    score -= penalty
    if (refusals === 1) risks.push({ issue: '1 prior refusal — must be addressed in cover letter', fix: 'Write a detailed rebuttal explaining what changed since the refusal', timeline: 'Before applying', fatal: false })
    else blockers.push(`${refusals} prior refusals — high-risk profile. Fix every underlying issue before reapplying.`)
  } else {
    score += 5
    strengths.push('No prior refusals')
  }

  // 7. Sponsor (0-8)
  if (p.hasSponsor) {
    score += 8
    strengths.push(`Sponsored by ${p.sponsorRelation || 'a host'} — reduces financial burden concerns`)
    quickWins.push('Ensure sponsor provides: invitation letter, bank statements (3+ months), proof of status/residency, and relationship proof')
  }

  // 8. Stay length
  if (p.intendedStayDays > 90) {
    score -= 8
    risks.push({ issue: `Long intended stay (${p.intendedStayDays} days) increases overstay scrutiny`, fix: 'Shorten planned stay or provide very strong ties to home', timeline: 'Before applying', fatal: false })
  } else if (p.intendedStayDays <= 14) {
    score += 5
    strengths.push('Short intended stay (lower overstay risk profile)')
  }

  // Very-high-scrutiny cap: hard to get above 88 for UK/US regardless of profile
  if (w.scrutinyLevel === 'very_high' && score > 88) score = 88

  score = Math.max(0, Math.min(100, score))

  let band: VisaAssessment['band']
  let recommendation: string
  if      (score >= 85) { band = 'Strong'; recommendation = 'Your profile is strong. Apply with confidence. Keep documents well-organised and your cover letter concise.' }
  else if (score >= 70) { band = 'Good';   recommendation = 'Solid application. Address the flagged gaps before submitting — a strong cover letter will help.' }
  else if (score >= 55) { band = 'Fair';   recommendation = 'Viable but risks exist. Fix the quick wins first and give it 4-6 weeks before applying.' }
  else if (score >= 40) { band = 'Weak';   recommendation = 'Significant gaps need addressing. Applying now risks a refusal that will hurt future applications. Fix the blockers first.' }
  else                  { band = 'Poor';   recommendation = 'Do not apply yet — a refusal at this stage would close future doors. Address all blockers first.' }

  return { score, band, recommendation, strengths, risks, blockers, quickWins, feeGBP: w.feeGBP }
}

export async function saveVisaAssessment(assessment: VisaAssessment, p: VisaApplicantProfile): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('visa_assessments').insert({
      conversation_id: p.conversationId,
      nationality:     p.nationality,
      destination:     p.destination,
      score:           assessment.score,
      band:            assessment.band,
      recommendation:  assessment.recommendation,
    })
  } catch { /* non-fatal */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 9 — VOICE NOTE INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════

export interface VoiceNoteAnalysis {
  transcript:    string
  language:      'en' | 'pidgin' | 'yoruba' | 'igbo' | 'hausa' | 'twi' | 'fr' | 'unknown'
  intent:        string
  urgency:       'high' | 'medium' | 'low'
  entities:      { destination?: string; dates?: string; budget?: string; party?: string; visaCountry?: string }
  replyLanguage: string
}

export async function analyseVoiceNote(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<VoiceNoteAnalysis> {
  const ext = mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('mp4') ? 'mp4'
    : mimeType.includes('webm') ? 'webm'
    : 'mp3'

  // Transcribe via OpenAI Whisper (native fetch + FormData — no SDK required)
  const form = new FormData()
  const ab   = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer
  const blob = new Blob([ab], { type: mimeType })
  form.append('file', new File([blob], `voice.${ext}`, { type: mimeType }))
  form.append('model', 'whisper-1')
  form.append('language', 'en')
  form.append('prompt', 'Travel agency message. Speaker may use Nigerian Pidgin, Yoruba, Igbo, Hausa, or Ghanaian Twi. Terms: Lagos, Accra, Abuja, London, Dubai, Canada visa, flights, book.')

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  })
  if (!whisperRes.ok) throw new Error(`Whisper API error: ${whisperRes.status}`)
  const { text: transcript } = await whisperRes.json() as { text: string }

  // Analyse intent via Claude Haiku
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 400,
    messages: [{ role: 'user', content: `Analyse this travel customer voice message transcript and return JSON ONLY:

"${transcript}"

{
  "transcript": "cleaned transcript",
  "language": "en|pidgin|yoruba|igbo|hausa|twi|fr|unknown",
  "intent": "what they want (one phrase)",
  "urgency": "high|medium|low",
  "entities": {"destination":"...","dates":"...","budget":"...","party":"...","visaCountry":"..."},
  "replyLanguage": "instruction e.g. 'reply in Pidgin English, warm tone' or 'reply in English, formal'"
}` }],
  })
  const raw = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
  try {
    return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')) as VoiceNoteAnalysis
  } catch {
    return {
      transcript, language: 'en', intent: 'travel inquiry', urgency: 'medium',
      entities: {}, replyLanguage: 'reply in English, warm and helpful tone',
    }
  }
}

// Analyse an already-transcribed transcript (used by the tool path when Whisper ran upstream)
export async function analyseTranscript(transcript: string): Promise<VoiceNoteAnalysis> {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 400,
    messages: [{ role: 'user', content: `Analyse this travel customer voice message transcript and return JSON ONLY:

"${transcript}"

{
  "transcript": "cleaned transcript",
  "language": "en|pidgin|yoruba|igbo|hausa|twi|fr|unknown",
  "intent": "what they want (one phrase)",
  "urgency": "high|medium|low",
  "entities": {"destination":"...","dates":"...","budget":"...","party":"...","visaCountry":"..."},
  "replyLanguage": "instruction e.g. 'reply in Pidgin English, warm tone' or 'reply in English, formal'"
}` }],
  })
  const raw = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
  try {
    return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')) as VoiceNoteAnalysis
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

interface FxCache { rates: Record<string, number>; fetched: number }
const fxCache = new Map<string, FxCache>()
const FX_TTL_MS = 3_600_000 // 1h in-process cache

async function getHistoricalRates(from: string, to: string): Promise<{ rates: number[]; current: number } | null> {
  const key = `${from}-${to}`
  const cached = fxCache.get(key)
  if (cached && Date.now() - cached.fetched < FX_TTL_MS) {
    return { rates: Object.values(cached.rates), current: cached.rates[Object.keys(cached.rates).at(-1)!] }
  }

  try {
    const end   = new Date()
    const start = new Date(end.getTime() - 30 * 86_400_000)
    const fmt   = (d: Date) => d.toISOString().slice(0, 10)
    const url   = `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?from=${from}&to=${to}`
    const res   = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) return null
    const data  = await res.json() as { rates: Record<string, Record<string, number>> }
    const byDate = data.rates
    const normalized: Record<string, number> = {}
    for (const [date, currencies] of Object.entries(byDate)) {
      if (currencies[to] != null) normalized[date] = currencies[to]
    }
    fxCache.set(key, { rates: normalized, fetched: Date.now() })
    const values = Object.values(normalized)
    return { rates: values, current: values.at(-1)! }
  } catch {
    return null
  }
}

export interface FxAdvice {
  pair:          string
  currentRate:   number
  percentile30d: number
  trend:         'improving' | 'worsening' | 'stable'
  advice:        'pay_now' | 'wait' | 'neutral'
  message:       string
}

export async function getFxAdvice(fromCurrency: string, toCurrency: string): Promise<FxAdvice | null> {
  const from = fromCurrency.toUpperCase()
  const to   = toCurrency.toUpperCase()
  const data = await getHistoricalRates(from, to)
  if (!data || !data.current) return null

  const { rates, current } = data
  const pair = `${from}/${to}`

  if (rates.length < 3) {
    return {
      pair, currentRate: current, percentile30d: 50, trend: 'stable', advice: 'neutral',
      message: `Current ${pair} rate: ${current.toLocaleString()}. Not enough historical data for a timing recommendation.`,
    }
  }

  const sorted = [...rates].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted.at(-1)!
  const percentile30d = Math.round(((current - min) / Math.max(max - min, 0.0001)) * 100)
  const clamped = Math.max(0, Math.min(100, percentile30d))

  // High rate = expensive for the NGN/GHS buyer paying more per GBP
  // Low percentile = cheap (good to pay now)
  let advice: FxAdvice['advice']
  let trend: FxAdvice['trend']
  let message: string

  if (clamped <= 25) {
    advice = 'pay_now'; trend = 'improving'
    message = `✅ ${pair} is near its 30-day low (${clamped}th percentile). This is a good rate — I'd pay now rather than risk it rising. Current: ${current.toLocaleString()} ${to} per ${from}.`
  } else if (clamped >= 75) {
    advice = 'wait'; trend = 'worsening'
    message = `⏳ ${pair} is near its 30-day high (${clamped}th percentile). Rates have been cheaper recently — if you have a week or two, it may be worth watching for a dip. Current: ${current.toLocaleString()} ${to} per ${from}.`
  } else {
    advice = 'neutral'; trend = 'stable'
    message = `ℹ️ ${pair} is near the middle of its 30-day range (${clamped}th percentile). No strong signal either way — pay when it's convenient. Current: ${current.toLocaleString()} ${to} per ${from}.`
  }

  return { pair, currentRate: current, percentile30d: clamped, trend, advice, message }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 11 — FAMILY CONSTELLATION MEMORY
// ═══════════════════════════════════════════════════════════════════════════

export interface FamilyMember {
  name:           string
  relation:       string
  location?:      string
  visaStatus?:    string
  travelPattern?: string
  lastMentioned?: string
}

export interface FamilyConstellation {
  primaryClient:   string
  householdName?:  string
  members:         FamilyMember[]
  homeCountry?:    string
  hubCountries?:   string[]
  recurringTrips?: string[]
}

export async function upsertFamilyMember(
  primaryClientId: string,
  member: FamilyMember,
  householdName?: string,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data: existing } = await supabase
    .from('family_constellations').select('*').eq('primary_client', primaryClientId).maybeSingle()

  const now = new Date().toISOString()
  const updated = { ...member, lastMentioned: now }

  if (!existing) {
    await supabase.from('family_constellations').insert({
      id:             `fc_${primaryClientId.replace(/\W/g, '_')}`,
      primary_client: primaryClientId,
      household_name: householdName || null,
      members:        [updated],
    })
  } else {
    const members = (existing.members as FamilyMember[]) || []
    const idx = members.findIndex(
      m => m.name.toLowerCase() === member.name.toLowerCase() && m.relation === member.relation,
    )
    if (idx >= 0) members[idx] = { ...members[idx], ...updated }
    else members.push(updated)
    await supabase.from('family_constellations')
      .update({ members, updated_at: now })
      .eq('primary_client', primaryClientId)
  }
}

export async function getFamilyConstellation(primaryClientId: string): Promise<FamilyConstellation | null> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('family_constellations').select('*').eq('primary_client', primaryClientId).maybeSingle()
  if (!data) return null
  return {
    primaryClient:  data.primary_client,
    householdName:  data.household_name,
    members:        (data.members as FamilyMember[]) || [],
    homeCountry:    data.home_country,
    hubCountries:   data.hub_countries,
    recurringTrips: data.recurring_trips,
  }
}

export function buildFamilyContext(constellation: FamilyConstellation): string {
  if (!constellation.members.length) return ''
  const lines = constellation.members.map(m => {
    const parts = [`${m.relation} ${m.name}`]
    if (m.location)      parts.push(`lives in ${m.location}`)
    if (m.visaStatus)    parts.push(m.visaStatus)
    if (m.travelPattern) parts.push(m.travelPattern)
    return parts.join(' — ')
  })
  return `FAMILY CONSTELLATION${constellation.householdName ? ` (${constellation.householdName})` : ''}:\n${lines.join('\n')}`
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 12 — VISA REJECTION RECOVERY ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export interface RefusalGround {
  number:         number
  rawText:        string
  translation:    string
  whatTheyWanted: string
  evidenceFix:    string
  fatal:          boolean
}

export interface RefusalAnalysis {
  country:             string
  grounds:             RefusalGround[]
  overallStrategy:     string
  evidenceChecklist:   string[]
  coverLetterOutline:  string[]
  timeToReapply:       string
  strengthenFirst:     string[]
}

export async function analyseRefusalLetter(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
): Promise<RefusalAnalysis> {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 1200,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
      { type: 'text', text: `This is a visa refusal letter. Extract every refusal ground and build a full reapplication strategy. Return valid JSON ONLY:
{
  "country": "country that refused",
  "grounds": [{"number":1,"rawText":"exact wording from letter","translation":"plain English meaning","whatTheyWanted":"what evidence they needed","evidenceFix":"exactly what document/evidence fixes this","fatal":true}],
  "overallStrategy": "2-3 sentence reapplication strategy",
  "evidenceChecklist": ["every document needed"],
  "coverLetterOutline": ["point 1","point 2"],
  "timeToReapply": "immediately / wait 3 months / wait 6 months",
  "strengthenFirst": ["what to fix before reapplying"]
}` },
    ] }],
  })
  const raw = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
  try {
    return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')) as RefusalAnalysis
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

// Hours after last activity for each whisper attempt
const WHISPER_SCHEDULE: Record<WhisperStage, number[]> = {
  price_shock:         [30, 168],
  ready_then_vanished: [3, 24, 120],
  visa_anxiety:        [24, 72],
  comparison_shopping: [12, 48],
  decision_pending:    [48, 120],
  payment_abandoned:   [1, 6, 24],
  cold_lead:           [168, 336],
  unresponsive:        [72, 240],
}

interface WhisperState {
  whisperStage:    WhisperStage
  whisperCount:    number
  lastWhisperAt:   string | null
  destination?:    string
  quotedPrice?:    string
  contactName?:    string
}

export async function planWhisper(opts: {
  conversationId: string
  stage:          WhisperStage
  destination?:   string
  quotedPrice?:   string
  contactName?:   string
}): Promise<void> {
  const supabase = getSupabaseAdmin()
  const whisperState: WhisperState = {
    whisperStage:  opts.stage,
    whisperCount:  0,
    lastWhisperAt: null,
    destination:   opts.destination,
    quotedPrice:   opts.quotedPrice,
    contactName:   opts.contactName,
  }

  const { data: existing } = await supabase
    .from('JadeSession')
    .select('id, state')
    .eq('chatwootConversationId', opts.conversationId)
    .maybeSingle()

  if (existing) {
    const currentState = (existing.state as Record<string, unknown>) || {}
    await supabase.from('JadeSession')
      .update({ state: { ...currentState, ...whisperState } })
      .eq('id', existing.id)
  } else {
    await supabase.from('JadeSession').insert({
      chatwootConversationId: opts.conversationId,
      state: whisperState,
    })
  }
}

export function detectDropOffStage(state: Record<string, unknown>): WhisperStage | null {
  return (state.whisperStage as WhisperStage) || null
}

async function generateWhisperMessage(
  stage: WhisperStage,
  ctx: { destination?: string; quotedPrice?: string; contactName?: string; attemptNumber: number },
): Promise<string> {
  const stageContext: Record<WhisperStage, string> = {
    price_shock:         "They went quiet after seeing the price. Don't apologise for the price. Continue the thread naturally, maybe mention value or offer alternative options.",
    ready_then_vanished: "They seemed ready to book and disappeared. Continue the thread like no time has passed — don't say 'I noticed you went quiet'.",
    visa_anxiety:        "They're nervous about visa chances. Offer specific reassurance or the next concrete step.",
    comparison_shopping: "They're likely checking other agents. Give a reason to come back — specific expertise, a better deal, or personal service.",
    decision_pending:    "They're deciding. Give them something to decide with — one specific recommendation or a fare-change deadline.",
    payment_abandoned:   "They started to pay and stopped. Pick up right where the booking process was.",
    cold_lead:           "Haven't spoken in a while. Reference the trip they were interested in and make it easy to restart.",
    unresponsive:        "Multiple messages unanswered. One final natural check-in, then stop.",
  }

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 150,
    messages: [{ role: 'user', content: `You are Jade, AI travel consultant for Walz Travels. Write a short re-engagement WhatsApp message:

Stage: ${stage} — ${stageContext[stage]}
Destination: ${ctx.destination || 'not specified'}
Quoted price: ${ctx.quotedPrice || 'not specified'}
Client name: ${ctx.contactName || 'not specified'}
Attempt: ${ctx.attemptNumber}

Rules:
- NEVER say "just checking in", "following up", "I noticed you went quiet"
- Continue the THREAD — pick up naturally as if the last message never ended
- 1-3 sentences maximum
- WhatsApp-friendly tone, warm but not pushy
- Attempt 2+: try a different angle (price, urgency, different option)
- End with ONE clear question or opening

Return ONLY the message text.` }],
  })
  return res.content[0].type === 'text' ? res.content[0].text.trim() : ''
}

export async function runWhisperSweep(): Promise<{ processed: number; sent: number }> {
  const supabase = getSupabaseAdmin()

  // Query JadeSession rows that have a whisperStage registered
  const { data: sessions } = await supabase
    .from('JadeSession')
    .select('chatwootConversationId, state, updatedAt')
    .not('state->>whisperStage', 'is', null)

  if (!sessions?.length) return { processed: 0, sent: 0 }

  let processed = 0
  let sent = 0
  const now = new Date()

  for (const session of sessions) {
    const state = (session.state as Record<string, unknown>) || {}
    const stage = detectDropOffStage(state)
    if (!stage) continue

    const whisperCount = (state.whisperCount as number) || 0
    const schedule = WHISPER_SCHEDULE[stage] || []
    if (whisperCount >= schedule.length) continue

    processed++

    const lastActivityAt = new Date(session.updatedAt as string)
    const lastWhisperAt  = state.lastWhisperAt ? new Date(state.lastWhisperAt as string) : null
    const baseTime       = lastWhisperAt || lastActivityAt
    const hoursScheduled = schedule[whisperCount]
    const dueAt          = new Date(baseTime.getTime() + hoursScheduled * 3_600_000)

    if (dueAt > now) continue

    try {
      const msg = await generateWhisperMessage(stage, {
        destination:   state.destination as string | undefined,
        quotedPrice:   state.quotedPrice as string | undefined,
        contactName:   state.contactName as string | undefined,
        attemptNumber: whisperCount + 1,
      })

      if (msg) {
        await sendToConversation(session.chatwootConversationId, msg)

        const newCount = whisperCount + 1
        const newState: WhisperState = {
          ...(state as unknown as WhisperState),
          whisperCount:  newCount,
          lastWhisperAt: now.toISOString(),
          ...(newCount >= schedule.length ? { whisperStage: null as unknown as WhisperStage } : {}),
        }

        await supabase.from('JadeSession')
          .update({ state: newState })
          .eq('chatwootConversationId', session.chatwootConversationId)

        sent++
      }
    } catch (e) {
      console.error(`[whisper] conv=${session.chatwootConversationId} error:`, e)
    }
  }

  return { processed, sent }
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE 14 — CULTURAL BRIDGE & IMMIGRATION COACH
// ═══════════════════════════════════════════════════════════════════════════

export interface ImmigrationCoaching {
  questions: Array<{ question: string; goodAnswer: string; avoid: string }>
  handLuggageDocs: string[]
  redFlags: string[]
}

export interface CulturalBriefing {
  norms:           string[]
  localPhrases:    Array<{ phrase: string; meaning: string; when: string }>
  firstDayPlan:    string[]
  emergencyNumbers: Array<{ label: string; number: string }>
}

export interface ArrivalPack {
  destination:        string
  nationality:        string
  purposeOfVisit:     string
  immigration:        ImmigrationCoaching
  cultural:           CulturalBriefing
}

export async function buildArrivalPack(opts: {
  destination:    string
  nationality:    string
  purposeOfVisit: string
}): Promise<ArrivalPack> {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 1800,
    messages: [{ role: 'user', content: `Generate a complete Arrival Pack for a ${opts.nationality} traveller arriving in ${opts.destination} for ${opts.purposeOfVisit}. Return valid JSON ONLY:

{
  "immigration": {
    "questions": [
      {"question":"exact question an immigration officer asks","goodAnswer":"what to say","avoid":"what NOT to say"}
    ],
    "handLuggageDocs": ["list of documents to keep in hand luggage, not checked bags"],
    "redFlags": ["things that trigger secondary questioning — avoid doing/saying these at immigration"]
  },
  "cultural": {
    "norms": ["3-5 key cultural norms or etiquette tips specific to ${opts.destination}"],
    "localPhrases": [{"phrase":"local word or phrase","meaning":"what it means","when":"when to use it"}],
    "firstDayPlan": ["practical step-by-step for day 1 after arrival — SIM card, currency, transport, orientation"],
    "emergencyNumbers": [{"label":"Police","number":"..."},{"label":"Ambulance","number":"..."},{"label":"Tourist Helpline","number":"..."}]
  }
}

Requirements:
- 5-7 immigration questions relevant to ${opts.purposeOfVisit}
- 5-6 local phrases (including greetings and practical phrases)
- Tailor everything specifically to ${opts.nationality} travellers — their likely questions, their typical concerns
- Emergency numbers must be real numbers for ${opts.destination}
- Red flags should reflect what's specifically scrutinised for ${opts.nationality} passport holders` }],
  })

  const raw = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')) as {
      immigration: ImmigrationCoaching
      cultural: CulturalBriefing
    }
    return {
      destination:    opts.destination,
      nationality:    opts.nationality,
      purposeOfVisit: opts.purposeOfVisit,
      immigration:    parsed.immigration,
      cultural:       parsed.cultural,
    }
  } catch {
    return {
      destination:    opts.destination,
      nationality:    opts.nationality,
      purposeOfVisit: opts.purposeOfVisit,
      immigration:    { questions: [], handLuggageDocs: [], redFlags: [] },
      cultural:       { norms: [], localPhrases: [], firstDayPlan: [], emergencyNumbers: [] },
    }
  }
}
