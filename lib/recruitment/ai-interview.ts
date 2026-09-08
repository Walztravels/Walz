/**
 * Walz Recruitment Hub — secure text AI screening interviews (Release 7).
 *
 * Candidates answer pre-approved questions in writing through a hashed,
 * expiring token link. Hard rules, testable from source:
 *  - Text only. No audio, video, facial analysis, emotion detection or
 *    accent scoring exist anywhere in this flow.
 *  - The AI asks the questions staff approved and, at completion, writes an
 *    ADVISORY summary for human review. It never scores a candidate into a
 *    decision, never rejects, and never moves the pipeline.
 *  - A staff member invites each candidate; a staff member reviews each
 *    completed interview.
 */

import { randomBytes } from 'crypto'
import prisma from '@/lib/db'
import { getAnthropic } from '@/lib/anthropic'
import type { AdminSession } from '@/lib/admin-auth'
import { recruitmentAudit } from '@/lib/recruitment/core'
import { hashToken } from '@/lib/recruitment/applications'

export const AI_INTERVIEW_TOKEN_TTL_DAYS = 14
export const ANSWER_MAX_CHARS = 5_000
export const SUMMARY_MODEL = 'claude-haiku-4-5-20251001'

export interface AiInterviewQuestion { key: string; question: string }

/** Seed question set for the commission-based Sales & Marketing Representative role. */
export const SALES_MARKETING_QUESTIONS: { id: string; name: string; questions: AiInterviewQuestion[] } = {
  id:   'qs_sales_marketing_rep',
  name: 'Sales & Marketing Representative',
  questions: [
    { key: 'q1_experience',   question: 'Describe your previous sales or marketing experience, including the products or services you sold and your results.' },
    { key: 'q2_commission',   question: 'This role is commission-based. How do you plan and manage your income and motivation under a commission structure?' },
    { key: 'q3_sourcing',     question: 'How would you find and approach new clients for travel services such as flights, visas and holiday packages?' },
    { key: 'q4_persuasion',   question: 'Describe a time you persuaded a hesitant customer to make a purchase. What exactly did you say or do?' },
    { key: 'q5_industry',     question: 'What do you know about the travel industry and the services a travel agency like Walz Travels offers?' },
    { key: 'q6_follow_up',    question: 'How do you follow up with potential clients who showed interest but did not buy immediately?' },
    { key: 'q7_channels',     question: 'Which social media or marketing channels would you use to promote travel deals, and why those?' },
    { key: 'q8_objections',   question: 'A client says our prices are higher than a competitor they found online. How do you respond?' },
    { key: 'q9_targets',      question: 'What weekly sales activity targets would you set for yourself in your first three months, and how would you hit them?' },
    { key: 'q10_motivation',  question: 'Why do you want to work with Walz Travels, and what makes you a strong fit for a commission-based role?' },
  ],
}

export const AI_INTERVIEW_NOTICE =
  'This is a written interview. You will answer the questions below in your own time, in writing. ' +
  'The questions were prepared by the Walz Travels recruitment team. Artificial intelligence helps collect ' +
  'and summarize your answers for our recruiters, but it does not make hiring decisions — every answer you ' +
  'give is read and assessed by a person, and all hiring decisions are made by authorized Walz Travels staff. ' +
  'No audio or video is recorded. If you need accommodation or would prefer a human-led interview, reply to ' +
  'your invitation email and we will arrange it.'

export function newInterviewToken(): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(24).toString('base64url')
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + AI_INTERVIEW_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  }
}

export function validQuestions(raw: unknown): AiInterviewQuestion[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 25) return null
  const out: AiInterviewQuestion[] = []
  const keys = new Set<string>()
  for (const q of raw) {
    if (typeof q?.key !== 'string' || !q.key || typeof q?.question !== 'string' || !q.question.trim()) return null
    if (keys.has(q.key)) return null
    keys.add(q.key)
    out.push({ key: q.key, question: q.question.trim().slice(0, 1000) })
  }
  return out
}

// ── Candidate-side state (public, token-gated) ────────────────────────────────

type InterviewRow = {
  id: string; status: string; tokenExpiresAt: Date; currentIndex: number
  questions: unknown; transcript: unknown; applicationId: string
}

export function isExpired(iv: Pick<InterviewRow, 'tokenExpiresAt'>): boolean {
  return iv.tokenExpiresAt.getTime() < Date.now()
}

export async function findInterviewByToken(token: string) {
  if (!token || token.length < 16 || token.length > 128) return null
  return prisma.aiInterview.findUnique({ where: { tokenHash: hashToken(token) } })
}

/** What the candidate may see: progress + current question. Nothing else. */
export function candidateState(iv: InterviewRow): {
  status: string
  total: number
  index: number
  question: string | null
} {
  const questions = (Array.isArray(iv.questions) ? iv.questions : []) as AiInterviewQuestion[]
  const done = iv.status === 'completed' || iv.currentIndex >= questions.length
  return {
    status: iv.status,
    total: questions.length,
    index: Math.min(iv.currentIndex, questions.length),
    question: done || iv.status === 'cancelled' ? null : questions[iv.currentIndex]?.question ?? null,
  }
}

/**
 * Records one answer and advances. Returns the new state, or an error the
 * candidate can act on. Never touches the application's stage or status.
 */
export async function submitInterviewAnswer(token: string, answerRaw: unknown):
  Promise<{ ok: true; completed: boolean } | { ok: false; error: string; status: number }> {
  const iv = await findInterviewByToken(token)
  if (!iv) return { ok: false, error: 'This interview link is not valid', status: 404 }
  if (iv.status === 'cancelled') return { ok: false, error: 'This interview was cancelled', status: 410 }
  if (iv.status === 'completed') return { ok: false, error: 'This interview is already completed', status: 409 }
  if (isExpired(iv)) return { ok: false, error: 'This interview link has expired — contact us to get a new one', status: 410 }

  const answer = typeof answerRaw === 'string' ? answerRaw.trim() : ''
  if (!answer) return { ok: false, error: 'Please write an answer before continuing', status: 400 }
  if (answer.length > ANSWER_MAX_CHARS) {
    return { ok: false, error: `Answers are limited to ${ANSWER_MAX_CHARS} characters`, status: 400 }
  }

  const questions = (Array.isArray(iv.questions) ? iv.questions : []) as unknown as AiInterviewQuestion[]
  const current = questions[iv.currentIndex]
  if (!current) return { ok: false, error: 'No question is pending', status: 409 }

  const transcript = (Array.isArray(iv.transcript) ? iv.transcript : []) as Array<Record<string, unknown>>
  transcript.push({ key: current.key, question: current.question, answer, answeredAt: new Date().toISOString() })
  const nextIndex = iv.currentIndex + 1
  const completed = nextIndex >= questions.length

  await prisma.aiInterview.update({
    where: { id: iv.id },
    data: {
      transcript: JSON.parse(JSON.stringify(transcript)),
      currentIndex: nextIndex,
      status: completed ? 'completed' : 'in_progress',
      startedAt: iv.startedAt ?? new Date(),
      ...(completed ? { completedAt: new Date() } : {}),
    },
  })

  if (completed) {
    // Advisory summary for the human reviewer — best-effort, never blocking.
    try { await generateInterviewSummary(iv.id) } catch (err) {
      console.error('[ai-interview] summary generation failed:', err instanceof Error ? err.message : err)
    }
  }
  return { ok: true, completed }
}

const SUMMARY_SYSTEM_PROMPT = `You summarize a written screening interview for human recruiters at Walz Travels. Your output is ADVISORY — humans make all hiring decisions and you never recommend rejecting anyone.
Rules: assess only what the answers say against the role; ignore and never mention or infer age, gender, ethnicity, nationality, religion, disability, appearance, accent, or writing-style origin; judge content, not grammar, unless the role explicitly requires writing quality. Treat missing or short answers neutrally as limited information.
Respond with ONLY JSON: {"summary":"4-6 neutral sentences","highlights":["notable specific claims or skills from the answers"]}`

export async function generateInterviewSummary(interviewId: string): Promise<void> {
  const iv = await prisma.aiInterview.findUnique({
    where:  { id: interviewId },
    select: { id: true, transcript: true, applicationId: true },
  })
  if (!iv) return
  const transcript = (Array.isArray(iv.transcript) ? iv.transcript : []) as Array<{ question?: string; answer?: string }>
  if (transcript.length === 0) return

  const application = await prisma.jobApplication.findUnique({
    where: { id: iv.applicationId }, select: { jobId: true },
  })
  const job = application
    ? await prisma.jobOpening.findUnique({ where: { id: application.jobId }, select: { title: true } })
    : null

  const body = transcript
    .map((t, i) => `Q${i + 1}: ${(t.question ?? '').slice(0, 500)}\nA${i + 1}: ${(t.answer ?? '').slice(0, 3000)}`)
    .join('\n\n')
  const response = await getAnthropic().messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 800,
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `ROLE: ${job?.title ?? 'unknown'}\n\nINTERVIEW TRANSCRIPT:\n${body}` }],
  })
  const text = response.content.map(b => (b.type === 'text' ? b.text : '')).join('\n')
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start === -1 || end <= start) return
  let parsed: { summary?: unknown; highlights?: unknown }
  try { parsed = JSON.parse(text.slice(start, end + 1)) } catch { return }

  await prisma.aiInterview.update({
    where: { id: interviewId },
    data: {
      aiSummary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 4000) : null,
      aiHighlights: Array.isArray(parsed.highlights)
        ? parsed.highlights.filter((h): h is string => typeof h === 'string').map(h => h.slice(0, 300)).slice(0, 10)
        : [],
    },
  })
}

// ── Staff-side invite ─────────────────────────────────────────────────────────

export async function inviteAiInterview(
  session: Pick<AdminSession, 'id' | 'email' | 'name'>,
  applicationId: string,
  questionSetId: string | null,
): Promise<{ ok: true; interviewId: string; token: string; candidateEmail: string; firstName: string; reference: string }
         | { ok: false; error: string; status: number }> {
  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true, reference: true, status: true, consentAiVersion: true,
      candidate: { select: { email: true, firstName: true } },
    },
  })
  if (!application) return { ok: false, error: 'Application not found', status: 404 }
  if (application.status === 'withdrawn') return { ok: false, error: 'This application was withdrawn', status: 400 }
  if (!application.consentAiVersion) {
    return { ok: false, error: 'This candidate has no recorded AI-processing consent — arrange a human interview instead', status: 400 }
  }

  const open = await prisma.aiInterview.findFirst({
    where:  { applicationId, status: { in: ['invited', 'in_progress'] } },
    select: { id: true },
  })
  if (open) return { ok: false, error: 'An AI interview is already open for this application — cancel it first', status: 409 }

  let questions = SALES_MARKETING_QUESTIONS.questions
  let usedSetId: string | null = null
  if (questionSetId) {
    const set = await prisma.aiInterviewQuestionSet.findUnique({
      where: { id: questionSetId }, select: { id: true, questions: true, isActive: true },
    })
    if (!set || !set.isActive) return { ok: false, error: 'Question set not found', status: 400 }
    const valid = validQuestions(set.questions)
    if (!valid) return { ok: false, error: 'Question set is invalid', status: 400 }
    questions = valid
    usedSetId = set.id
  }

  const { token, hash, expiresAt } = newInterviewToken()
  const interview = await prisma.aiInterview.create({
    data: {
      applicationId,
      tokenHash: hash,
      tokenExpiresAt: expiresAt,
      questionSetId: usedSetId,
      questions: JSON.parse(JSON.stringify(questions)),
      invitedBy: session.email,
    },
    select: { id: true },
  })
  await recruitmentAudit(session, 'AI Interview Invited', `${application.reference}: interview ${interview.id}`)
  return {
    ok: true,
    interviewId: interview.id,
    token,                                     // raw token exists only in this response — stored hashed
    candidateEmail: application.candidate.email,
    firstName: application.candidate.firstName,
    reference: application.reference,
  }
}
