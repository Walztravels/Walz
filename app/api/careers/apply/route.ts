import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { publicJobWhere } from '@/lib/recruitment/core'
import {
  submitApplication, uploadCandidateDocument, uniqueReference, safeFilename,
} from '@/lib/recruitment/applications'

export const dynamic = 'force-dynamic'

const MAX_TEXT = 5000

function field(fd: FormData, name: string, max = 200): string {
  const v = fd.get(name)
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

// ── POST /api/careers/apply — public application submission ──────────────────
export async function POST(req: NextRequest) {
  // Abuse protection: 5 applications / hour / IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = rateLimit({ key: `careers-apply:${ip}`, limit: 5, windowMs: 60 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many applications from this connection — please try again later.' }, { status: 429 })
  }

  let fd: FormData
  try { fd = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form submission' }, { status: 400 })
  }

  const slug = field(fd, 'jobSlug', 120)
  const job = await prisma.jobOpening.findFirst({
    where: { slug, ...publicJobWhere() },
    include: { screeningQuestions: { orderBy: { sortOrder: 'asc' } } },
  }).catch(() => null)
  if (!job) return NextResponse.json({ error: 'This position is no longer accepting applications.' }, { status: 404 })

  // ── Field validation (server-authoritative) ────────────────────────────────
  const firstName = field(fd, 'firstName', 80)
  const lastName  = field(fd, 'lastName', 80)
  const email     = field(fd, 'email', 200).toLowerCase()
  const phone     = field(fd, 'phone', 40)
  if (!firstName || !lastName) return NextResponse.json({ error: 'First and last name are required' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })

  // Consent is mandatory (privacy + AI-processing acknowledgement)
  if (fd.get('consentPrivacy') !== 'true' || fd.get('consentAi') !== 'true') {
    return NextResponse.json({ error: 'Please accept the privacy notice and AI-processing acknowledgement' }, { status: 400 })
  }

  // Screening answers: required questions must be answered
  const answers: Array<{ questionId: string | null; question: string; answer: string }> = []
  for (const q of job.screeningQuestions) {
    const answer = field(fd, `q_${q.id}`, MAX_TEXT)
    if (q.required && !answer) {
      return NextResponse.json({ error: `Please answer: "${q.question.slice(0, 80)}"` }, { status: 400 })
    }
    if (answer) answers.push({ questionId: q.id, question: q.question, answer })
  }

  // ── CV upload (private bucket) — before persistence ────────────────────────
  const cvFile = fd.get('cv')
  if (!(cvFile instanceof File) || cvFile.size === 0) {
    return NextResponse.json({ error: 'Please attach your CV' }, { status: 400 })
  }
  const buffer = Buffer.from(await cvFile.arrayBuffer())
  const reference = await uniqueReference()   // used only for the storage path prefix
  const upload = await uploadCandidateDocument({
    reference,
    file: { name: cvFile.name, type: cvFile.type, buffer },
  })
  if (!upload.ok) return NextResponse.json({ error: upload.error }, { status: 400 })

  // ── Persist (transaction) then post-commit emails/Email Hub ────────────────
  const result = await submitApplication({
    jobId: job.id, jobTitle: job.title, hiringManager: job.hiringManager,
    firstName, lastName, email,
    phone: phone || undefined,
    country: field(fd, 'country', 80) || undefined,
    city: field(fd, 'city', 80) || undefined,
    linkedinUrl: field(fd, 'linkedinUrl', 300) || undefined,
    portfolioUrl: field(fd, 'portfolioUrl', 300) || undefined,
    coverLetter: field(fd, 'coverLetter', MAX_TEXT) || undefined,
    howHeard: field(fd, 'howHeard', 200) || undefined,
    referral: field(fd, 'referral', 200) || undefined,
    workAuthorization: field(fd, 'workAuthorization', 200) || undefined,
    accommodation: field(fd, 'accommodation', 2000) || undefined,
    answers,
    cv: {
      storagePath: upload.storagePath,
      filename: safeFilename(cvFile.name), contentType: cvFile.type, size: buffer.length,
    },
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  if (result.duplicate) {
    return NextResponse.json({
      ok: true, duplicate: true, reference: result.reference,
      message: 'You have already applied for this position — your application is on file.',
    })
  }
  return NextResponse.json({ ok: true, reference: result.reference })
}
