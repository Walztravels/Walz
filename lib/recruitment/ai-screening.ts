/**
 * Walz Recruitment Hub — human-reviewed AI résumé screening (Release 6).
 *
 * Hard rules, enforced here and testable from source:
 *  - A human triggers every run; nothing screens automatically.
 *  - The output is ADVISORY: this module never writes stageKey or status,
 *    never rejects, and produces no decision of any kind.
 *  - The prompt instructs the model to assess only job-relevant
 *    qualifications and to ignore protected personal characteristics.
 *  - A human marks each result reviewed; the pipeline decision stays with
 *    the humans in Release 3's move engine.
 */

import prisma from '@/lib/db'
import { getAnthropic } from '@/lib/anthropic'
import { getSupabaseAdmin } from '@/lib/supabase'
import { extractPdfText } from '@/lib/extractPdfText'
import type { AdminSession } from '@/lib/admin-auth'
import { recruitmentAudit } from '@/lib/recruitment/core'
import { RECRUITMENT_BUCKET } from '@/lib/recruitment/applications'

export const SCREENING_MODEL  = 'claude-haiku-4-5-20251001'
export const PROMPT_VERSION   = '2026-09'
const MAX_CV_CHARS      = 15_000
const MAX_FIELD_CHARS   = 4_000
const MAX_OUTPUT_TOKENS = 1_500

export const SCREENING_SYSTEM_PROMPT = `You are a recruitment screening assistant for Walz Travels. You produce an ADVISORY assessment for human recruiters. You never make hiring decisions and never recommend rejecting anyone — humans decide.

Strict fairness rules:
- Assess ONLY job-relevant qualifications, skills and experience against the role requirements.
- Ignore entirely, and never mention or infer: age, gender, ethnicity, nationality, religion, marital or family status, disability, appearance, photos, accent, name origin, or address.
- If information is missing, say so neutrally — treat absence of information as unknown, not negative.

Respond with ONLY a JSON object, no markdown fences, in this shape:
{"summary": "3-5 sentence neutral summary of fit against the requirements",
 "strengths": ["..."], "concerns": ["... (gaps against stated requirements only)"],
 "suggestedQuestions": ["... (interview questions a human could ask)"],
 "matchScore": 0-100 integer, an advisory indication of alignment with the stated requirements}`

export interface ScreeningOutput {
  summary: string
  strengths: string[]
  concerns: string[]
  suggestedQuestions: string[]
  matchScore: number | null
}

/** Parses the model's JSON reply defensively (fences, prose padding, bad types). */
export function parseScreeningResponse(raw: string): ScreeningOutput | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = cleaned.indexOf('{')
  const end   = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(cleaned.slice(start, end + 1)) } catch { return null }

  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && !!s.trim()).map(s => s.trim().slice(0, 500)).slice(0, 10) : []
  const scoreRaw = Number(parsed.matchScore)
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 3000) : '',
    strengths: strList(parsed.strengths),
    concerns: strList(parsed.concerns),
    suggestedQuestions: strList(parsed.suggestedQuestions),
    matchScore: Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : null,
  }
}

async function loadCvText(applicationId: string): Promise<{ text: string; used: boolean }> {
  try {
    const doc = await prisma.candidateDocument.findFirst({
      where:   { applicationId, kind: 'cv' },
      orderBy: { createdAt: 'desc' },
      select:  { storagePath: true, contentType: true },
    })
    if (!doc) return { text: '', used: false }
    const { data, error } = await getSupabaseAdmin().storage.from(RECRUITMENT_BUCKET).download(doc.storagePath)
    if (error || !data) return { text: '', used: false }
    const buf = Buffer.from(await data.arrayBuffer())
    if (doc.contentType.includes('pdf')) {
      const { text, isLikelyScanned } = await extractPdfText(buf)
      return isLikelyScanned ? { text: '', used: false } : { text: text.slice(0, MAX_CV_CHARS), used: true }
    }
    if (doc.contentType.startsWith('text/')) {
      return { text: buf.toString('utf8').slice(0, MAX_CV_CHARS), used: true }
    }
    return { text: '', used: false }   // Word docs: not parsed — the human reads the file
  } catch (err) {
    console.error('[ai-screening] CV load failed (continuing without):', err instanceof Error ? err.message : err)
    return { text: '', used: false }
  }
}

export function buildScreeningUserPrompt(input: {
  jobTitle: string; requirements: string; description: string
  answers: Array<{ question: string; answer: string }>
  coverLetter: string; cvText: string
}): string {
  const clip = (s: string) => (s || '').slice(0, MAX_FIELD_CHARS)
  const parts = [
    `ROLE: ${clip(input.jobTitle)}`,
    `REQUIREMENTS:\n${clip(input.requirements) || clip(input.description) || '(none stated)'}`,
  ]
  if (input.coverLetter) parts.push(`COVER LETTER:\n${clip(input.coverLetter)}`)
  if (input.answers.length > 0) {
    parts.push(`SCREENING ANSWERS:\n${input.answers.map(a => `Q: ${clip(a.question)}\nA: ${clip(a.answer)}`).join('\n')}`)
  }
  parts.push(input.cvText ? `CV TEXT:\n${input.cvText}` : 'CV TEXT: (not machine-readable — assess from the material above and note the limitation)')
  return parts.join('\n\n')
}

export async function runAiScreening(
  session: Pick<AdminSession, 'id' | 'email' | 'name'>,
  applicationId: string,
): Promise<{ ok: true; resultId: string } | { ok: false; error: string; status: number }> {
  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true, reference: true, jobId: true, coverLetter: true, consentAiVersion: true,
      answers: { select: { question: true, answer: true } },
    },
  })
  if (!application) return { ok: false, error: 'Application not found', status: 404 }
  if (!application.consentAiVersion) {
    // Candidates who applied without recording AI consent are never AI-screened.
    return { ok: false, error: 'This candidate has no recorded AI-processing consent — screen manually', status: 400 }
  }
  const job = await prisma.jobOpening.findUnique({
    where:  { id: application.jobId },
    select: { title: true, requirements: true, description: true },
  })
  if (!job) return { ok: false, error: 'Job not found for this application', status: 404 }

  const cv = await loadCvText(applicationId)
  const userPrompt = buildScreeningUserPrompt({
    jobTitle: job.title,
    requirements: job.requirements ?? '',
    description: job.description ?? '',
    answers: application.answers,
    coverLetter: application.coverLetter ?? '',
    cvText: cv.text,
  })

  let output: ScreeningOutput | null = null
  let failure: string | null = null
  try {
    const response = await getAnthropic().messages.create({
      model: SCREENING_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SCREENING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const text = response.content
      .map(b => (b.type === 'text' ? b.text : ''))
      .join('\n')
    output = parseScreeningResponse(text)
    if (!output) failure = 'Model reply was not valid screening JSON'
  } catch (err) {
    failure = err instanceof Error ? err.message.slice(0, 300) : 'AI request failed'
  }

  const result = await prisma.aiScreeningResult.create({
    data: {
      applicationId,
      model:         SCREENING_MODEL,
      promptVersion: PROMPT_VERSION,
      status:        output ? 'completed' : 'failed',
      summary:       output?.summary ?? null,
      strengths:     output?.strengths ?? [],
      concerns:      output?.concerns ?? [],
      suggestedQuestions: output?.suggestedQuestions ?? [],
      matchScore:    output?.matchScore ?? null,
      cvUsed:        cv.used,
      error:         failure,
      requestedBy:   session.email,
    },
    select: { id: true },
  })
  await recruitmentAudit(session, 'AI Screening Run',
    `${application.reference}: ${output ? `completed (advisory score ${output.matchScore ?? 'n/a'})` : `failed — ${failure}`}`)
  // Deliberately no stage or status change: screening informs humans only.
  return { ok: true, resultId: result.id }
}
