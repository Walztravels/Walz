/**
 * Orbit Benchmark Reviews API
 *
 * GET  /api/admin/orbit/benchmarks/reviews?benchmarkKey=...
 *   Returns latest review for each benchmark key (or filtered by benchmarkKey).
 *
 * POST /api/admin/orbit/benchmarks/reviews
 *   Upsert a review for a given benchmarkKey (one per reviewer per benchmark).
 *
 * RBAC: super_admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { ALL_BENCHMARKS } from '@/lib/orbit/benchmarks'

export const dynamic = 'force-dynamic'

const VALID_BENCHMARK_KEYS = new Set(ALL_BENCHMARKS.map(b => b.key))
const VALID_VERDICTS = new Set(['PUBLISHABLE', 'NEEDS_MINOR_EDIT', 'NEEDS_MAJOR_EDIT', 'REJECT'])

// ── GET — fetch reviews ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session)                          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin')    return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const benchmarkKey = req.nextUrl.searchParams.get('benchmarkKey') ?? undefined

  const where = benchmarkKey ? { benchmarkKey } : {}

  const reviews = await prisma.orbitBenchmarkReview.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take:    100,
  })

  return NextResponse.json({ reviews })
}

// ── POST — upsert review ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session)                          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin')    return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { benchmarkKey, verdict, issues = [], notes } = body as {
    benchmarkKey?: string
    verdict?:      string
    issues?:       string[]
    notes?:        string
  }

  if (!benchmarkKey || !VALID_BENCHMARK_KEYS.has(benchmarkKey)) {
    return NextResponse.json({ error: 'Invalid or unknown benchmarkKey' }, { status: 400 })
  }
  if (!verdict || !VALID_VERDICTS.has(verdict)) {
    return NextResponse.json({ error: 'verdict must be one of: PUBLISHABLE, NEEDS_MINOR_EDIT, NEEDS_MAJOR_EDIT, REJECT' }, { status: 400 })
  }
  if (!Array.isArray(issues)) {
    return NextResponse.json({ error: 'issues must be an array' }, { status: 400 })
  }

  const reviewerId = session.staffId ?? session.id

  // Upsert: one review per reviewer per benchmark
  const existing = await prisma.orbitBenchmarkReview.findFirst({
    where: { benchmarkKey, reviewerId },
  })

  const review = existing
    ? await prisma.orbitBenchmarkReview.update({
        where: { id: existing.id },
        data:  { verdict, issues, notes: notes ?? null },
      })
    : await prisma.orbitBenchmarkReview.create({
        data: { benchmarkKey, reviewerId, verdict, issues, notes: notes ?? null },
      })

  return NextResponse.json({ review }, { status: existing ? 200 : 201 })
}
