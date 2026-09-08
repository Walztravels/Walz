/**
 * Recruitment Hub — candidate application engine.
 *
 * Ordering contract (Release 2, mandatory):
 *   1. Validate + upload documents to PRIVATE storage
 *   2. Persist candidate + application + answers + documents + stage history
 *      in ONE transaction
 *   3. Only after commit: candidate confirmation email, hiring-team
 *      notification, Email Hub thread
 *   4. Respond
 * Emails are never sent before persistence succeeds; email failures never
 * roll back the stored application.
 */

import { createHash, randomBytes, randomInt } from 'crypto'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import { getSupabaseAdmin } from '@/lib/supabase'
import { recruitmentAudit } from './core'

export const PRIVACY_POLICY_VERSION = '2026-09'
export const AI_DISCLOSURE_VERSION  = '2026-09'
export const STATUS_TOKEN_TTL_DAYS  = 90

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.walztravels.com'
export const RECRUITMENT_BUCKET = 'recruitment-docs'   // PRIVATE — no public URLs

export const CV_ALLOWED_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]
export const CV_MAX_BYTES = 8 * 1024 * 1024

// ── References & tokens ───────────────────────────────────────────────────────

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // unambiguous

export function generateReference(year = new Date().getFullYear()): string {
  let suffix = ''
  for (let i = 0; i < 6; i++) suffix += REF_ALPHABET[randomInt(REF_ALPHABET.length)]
  return `WALZ-CAREERS-${year}-${suffix}`
}

export async function uniqueReference(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const ref = generateReference()
    const exists = await prisma.jobApplication.findUnique({ where: { reference: ref }, select: { id: true } })
    if (!exists) return ref
  }
  return `WALZ-CAREERS-${Date.now()}`
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newStatusToken(): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(24).toString('base64url')
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + STATUS_TOKEN_TTL_DAYS * 24 * 3600 * 1000),
  }
}

/** Candidate-safe status labels — internal stages are never exposed. */
export function candidateSafeStatus(stageKey: string, status: string): string {
  if (status === 'withdrawn') return 'Closed'
  if (status === 'hired')     return 'Closed — position filled'
  if (status === 'rejected')  return 'Closed'
  switch (stageKey) {
    case 'new':                  return 'Application received'
    case 'ai_review':
    case 'recruiter_review':     return 'Under review'
    case 'shortlisted':          return 'Under review'
    case 'ai_interview_invited':
    case 'ai_interview_done':
    case 'human_interview':      return 'Interview stage'
    case 'reference_check':
    case 'offer':                return 'Final review'
    case 'hired':                return 'Closed — position filled'
    case 'rejected':
    case 'talent_pool':          return 'Closed'
    default:                     return 'Under review'
  }
}

export function safeFilename(name: string): string {
  return (name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ── Document upload (private bucket, before the transaction) ─────────────────

export async function uploadCandidateDocument(opts: {
  reference: string
  file:      { name: string; type: string; buffer: Buffer }
}): Promise<{ ok: true; storagePath: string } | { ok: false; error: string }> {
  if (!CV_ALLOWED_TYPES.includes(opts.file.type)) {
    return { ok: false, error: 'CV must be a PDF, Word document or plain text file' }
  }
  if (opts.file.buffer.length === 0 || opts.file.buffer.length > CV_MAX_BYTES) {
    return { ok: false, error: 'CV must be between 1 byte and 8MB' }
  }
  const supabase = getSupabaseAdmin()
  const storagePath = `applications/${opts.reference}/${Date.now()}_${safeFilename(opts.file.name)}`
  let { error } = await supabase.storage.from(RECRUITMENT_BUCKET)
    .upload(storagePath, opts.file.buffer, { contentType: opts.file.type, upsert: false })
  if (error && /not found/i.test(error.message)) {
    // Create the PRIVATE bucket on demand (portal-upload convention)
    await supabase.storage.createBucket(RECRUITMENT_BUCKET, { public: false }).catch(() => {})
    ;({ error } = await supabase.storage.from(RECRUITMENT_BUCKET)
      .upload(storagePath, opts.file.buffer, { contentType: opts.file.type, upsert: false }))
  }
  if (error) {
    console.error('[recruitment] CV upload failed:', error.message)
    return { ok: false, error: 'We could not store your CV — please try again' }
  }
  return { ok: true, storagePath }
}

// ── Submission ────────────────────────────────────────────────────────────────

export interface SubmissionInput {
  jobId:        string
  jobTitle:     string
  hiringManager?: string | null
  firstName:    string
  lastName:     string
  email:        string
  phone?:       string
  country?:     string
  city?:        string
  linkedinUrl?: string
  portfolioUrl?: string
  coverLetter?: string
  howHeard?:    string
  referral?:    string
  workAuthorization?: string
  accommodation?: string
  answers:      Array<{ questionId: string | null; question: string; answer: string }>
  cv:           { storagePath: string; filename: string; contentType: string; size: number }
}

export interface SubmissionResult {
  ok:           boolean
  duplicate?:   boolean
  reference?:   string
  statusUrl?:   string
  error?:       string
}

export async function submitApplication(input: SubmissionInput): Promise<SubmissionResult> {
  const email = input.email.trim().toLowerCase()

  // Candidate deduplication: one canonical candidate per email
  const candidate = await prisma.candidate.upsert({
    where:  { email },
    create: {
      email,
      firstName: input.firstName, lastName: input.lastName,
      phone: input.phone ?? null, country: input.country ?? null, city: input.city ?? null,
      linkedinUrl: input.linkedinUrl ?? null, portfolioUrl: input.portfolioUrl ?? null,
    },
    update: {   // refresh contact details on re-application
      firstName: input.firstName, lastName: input.lastName,
      phone: input.phone ?? undefined, country: input.country ?? undefined,
      city: input.city ?? undefined,
      linkedinUrl: input.linkedinUrl ?? undefined, portfolioUrl: input.portfolioUrl ?? undefined,
    },
    select: { id: true },
  })

  // Duplicate application for the same job → clear, friendly outcome
  const existing = await prisma.jobApplication.findUnique({
    where:  { candidateId_jobId: { candidateId: candidate.id, jobId: input.jobId } },
    select: { reference: true },
  })
  if (existing) {
    return { ok: true, duplicate: true, reference: existing.reference }
  }

  const reference = await uniqueReference()
  const status    = newStatusToken()

  // ── ONE transaction: application + answers + document + stage history ─────
  let applicationId: string
  try {
    const application = await prisma.jobApplication.create({
      data: {
        reference,
        candidateId: candidate.id,
        jobId:       input.jobId,
        stageKey:    'new',
        coverLetter: input.coverLetter ?? null,
        howHeard:    input.howHeard ?? null,
        referral:    input.referral ?? null,
        workAuthorization: input.workAuthorization ?? null,
        accommodation:     input.accommodation ?? null,
        statusTokenHash:      status.hash,
        statusTokenExpiresAt: status.expiresAt,
        consentPrivacyVersion: PRIVACY_POLICY_VERSION,
        consentAiVersion:      AI_DISCLOSURE_VERSION,
        consentAt:             new Date(),
        answers: {
          create: input.answers.map(a => ({
            questionId: a.questionId, question: a.question, answer: a.answer,
          })),
        },
        documents: {
          create: [{
            candidateId: candidate.id, kind: 'cv',
            filename: input.cv.filename, contentType: input.cv.contentType,
            size: input.cv.size, storagePath: input.cv.storagePath,
          }],
        },
        stageHistory: {
          create: [{ fromKey: null, toKey: 'new', movedBy: 'system', note: 'Application submitted' }],
        },
      },
      select: { id: true },
    })
    applicationId = application.id
  } catch (e) {
    console.error('[recruitment] application persist failed:', e)
    return { ok: false, error: 'We could not save your application — please try again.' }
  }

  const statusUrl = `${BASE_URL}/careers/application/${reference}/status?t=${status.token}`

  // ── Post-commit side effects (never before; failures never roll back) ─────
  const resend = getResend()
  const fullName = `${input.firstName} ${input.lastName}`.trim()

  // 1. Candidate confirmation
  try {
    await resend.emails.send({
      from:    'Walz Travels Careers <hello@walztravels.com>',
      to:      email,
      subject: `Application received — ${input.jobTitle} (${reference})`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#0B1F3A;font-size:18px">Thank you for applying, ${escapeHtml(input.firstName)}</h2>
        <p style="color:#444;font-size:14px;line-height:1.6">We've received your application for
        <strong>${escapeHtml(input.jobTitle)}</strong>. Your reference is
        <strong style="font-family:monospace">${reference}</strong>.</p>
        <p style="color:#444;font-size:14px;line-height:1.6">Our team reviews every application. You can check
        your application status at any time:</p>
        <a href="${statusUrl}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:13px">Check application status</a>
        <p style="color:#999;font-size:11px;margin-top:20px">This link is personal to you and expires after ${STATUS_TOKEN_TTL_DAYS} days.
        If you need an accommodation at any point, just reply to this email.</p>
      </div>`,
    })
  } catch (e) {
    console.error('[recruitment] confirmation email failed:', e instanceof Error ? e.message : e)
  }

  // 2. Hiring-team notification
  try {
    await resend.emails.send({
      from:    'Walz Travels Careers <hello@walztravels.com>',
      to:      input.hiringManager?.trim() || 'contact@walztravels.com',
      subject: `New application: ${input.jobTitle} — ${fullName}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#0B1F3A;font-size:16px">New application received</h2>
        <table style="width:100%;border-collapse:collapse;background:#f8f8f5;border-radius:8px;font-size:13px">
          <tr><td style="padding:8px 14px;color:#999;width:110px">Candidate</td><td style="padding:8px 14px;color:#0B1F3A;font-weight:600">${escapeHtml(fullName)} &lt;${escapeHtml(email)}&gt;</td></tr>
          <tr><td style="padding:8px 14px;color:#999">Role</td><td style="padding:8px 14px;color:#0B1F3A">${escapeHtml(input.jobTitle)}</td></tr>
          <tr><td style="padding:8px 14px;color:#999">Reference</td><td style="padding:8px 14px;color:#0B1F3A;font-family:monospace">${reference}</td></tr>
        </table>
        <a href="${BASE_URL}/admin/recruitment/jobs/${input.jobId}/candidates" style="display:inline-block;margin-top:16px;background:#C9A84C;color:#0B1F3A;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:13px">Review in Recruitment Hub →</a>
      </div>`,
    })
  } catch (e) {
    console.error('[recruitment] hiring-team notification failed:', e instanceof Error ? e.message : e)
  }

  // 3. Email Hub record (careers category — full communication timeline anchor)
  try {
    await prisma.emailThread.create({
      data: {
        subject:  `Application for ${input.jobTitle} — ${reference}`,
        category: 'careers',
        status:   'open',
        refType:  'application',
        refId:    applicationId,
        participants: JSON.parse(JSON.stringify([{ email, name: fullName }])),
        messages: {
          create: {
            direction: 'inbound',
            from:      email,
            fromName:  fullName,
            to:        ['careers@walztravels.com'],
            subject:   `Application for ${input.jobTitle} — ${reference}`,
            bodyText:  input.coverLetter?.trim() || `Application submitted via walztravels.com/careers (${reference}).`,
            bodyHtml:  '',
            status:    'received',
            receivedAt: new Date(),
            sentAt:     new Date(),
            resendId:  `application:${reference}`,
          },
        },
      },
    })
  } catch (e) {
    console.error('[recruitment] email hub record failed:', e instanceof Error ? e.message : e)
  }

  await recruitmentAudit(null, 'Application Submitted', `${reference} · ${input.jobTitle} · candidate ${candidate.id}`)

  return { ok: true, reference, statusUrl }
}
