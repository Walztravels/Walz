import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'

export const dynamic = 'force-dynamic'

// Recruitment context for a careers Email Hub thread: which candidate this
// email belongs to, and their applications — or nothing, if unmatched.

interface Participant { email?: string; name?: string | null }

async function loadThread(id: string) {
  return prisma.emailThread.findUnique({
    where:  { id },
    select: { id: true, category: true, refType: true, refId: true, participants: true },
  })
}

function senderOf(thread: { participants: unknown }): Participant | null {
  const list = Array.isArray(thread.participants) ? (thread.participants as Participant[]) : []
  return list.find(p => typeof p?.email === 'string' && p.email.includes('@')) ?? null
}

const candidateSelect = {
  id: true, email: true, firstName: true, lastName: true,
  applications: {
    orderBy: { createdAt: 'desc' as const },
    select:  { id: true, reference: true, jobId: true, stageKey: true, status: true, createdAt: true },
  },
}

// GET — resolve the candidate for this thread (linked ref → sender email).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const thread = await loadThread(params.id)
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    if (thread.category !== 'careers') {
      return NextResponse.json({ candidate: null, matched: null })
    }

    let candidate = null
    let matched: 'application' | 'candidate' | 'email' | null = null

    if (thread.refType === 'application' && thread.refId) {
      const application = await prisma.jobApplication.findUnique({
        where:  { id: thread.refId },
        select: { candidateId: true },
      })
      if (application) {
        candidate = await prisma.candidate.findUnique({ where: { id: application.candidateId }, select: candidateSelect })
        if (candidate) matched = 'application'
      }
    }
    if (!candidate && thread.refType === 'candidate' && thread.refId) {
      candidate = await prisma.candidate.findUnique({ where: { id: thread.refId }, select: candidateSelect })
      if (candidate) matched = 'candidate'
    }
    if (!candidate) {
      const sender = senderOf(thread)
      if (sender?.email) {
        candidate = await prisma.candidate.findUnique({
          where: { email: sender.email.toLowerCase() }, select: candidateSelect,
        })
        if (candidate) matched = 'email'
      }
    }

    // Resolve job titles for the applications shown in the panel.
    const jobIds = Array.from(new Set((candidate?.applications ?? []).map((a: { jobId: string }) => a.jobId)))
    const jobs = jobIds.length > 0
      ? await prisma.jobOpening.findMany({ where: { id: { in: jobIds } }, select: { id: true, title: true } })
      : []
    return NextResponse.json({ candidate, matched, jobs, sender: senderOf(thread) })
  } catch (err) {
    console.error('[email thread candidate GET]', err)
    return NextResponse.json({ error: 'Failed to load candidate context' }, { status: 500 })
  }
}

// POST — create (or link) a candidate from this thread's sender and pin the
// thread to them. A management-role human action, audited.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const thread = await loadThread(params.id)
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    if (thread.category !== 'careers') {
      return NextResponse.json({ error: 'Only careers threads can be converted to candidates' }, { status: 400 })
    }
    const sender = senderOf(thread)
    if (!sender?.email) return NextResponse.json({ error: 'Thread has no sender email' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const clean = (v: unknown, fallback: string) =>
      (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : fallback)
    const nameParts = (sender.name ?? '').trim().split(/\s+/)
    const firstName = clean(body.firstName, nameParts[0] || 'Unknown')
    const lastName  = clean(body.lastName, nameParts.slice(1).join(' ') || '—')

    const email = sender.email.toLowerCase()
    const candidate = await prisma.candidate.upsert({
      where:  { email },
      update: {},                                      // never overwrite an existing record
      create: { email, firstName, lastName, source: 'careers_email' },
      select: { id: true, email: true, firstName: true, lastName: true },
    })
    await prisma.emailThread.update({
      where: { id: thread.id },
      data:  { refType: 'candidate', refId: candidate.id },
    })
    await recruitmentAudit(session, 'Candidate Linked From Email', `thread ${thread.id} → candidate ${candidate.id} (${email})`)
    return NextResponse.json({ candidate })
  } catch (err) {
    console.error('[email thread candidate POST]', err)
    return NextResponse.json({ error: 'Failed to create candidate' }, { status: 500 })
  }
}
