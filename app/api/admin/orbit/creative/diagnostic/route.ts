/**
 * Orbit Creative Studio — self-test diagnostic endpoint.
 *
 * GET /api/admin/orbit/creative/diagnostic
 *   Tests each layer the Creative Studio depends on and reports pass/fail
 *   per stage so issues can be isolated without trial-and-error.
 *
 * Stages tested:
 *   db_columns   — verifies all orbit_media columns required by the Prisma
 *                  schema exist in the production database
 *   db_write     — does a test OrbitMedia create + immediate delete (no
 *                  lasting side-effects; uses a recognisable sentinel prompt)
 *   openai       — confirms OPENAI_API_KEY is set and the API is reachable
 *                  by calling models.retrieve('gpt-image-2')
 *   storage      — confirms the orbit-media Supabase bucket is accessible
 *
 * RBAC: super_admin only.
 * Read-only: the test write is rolled-back (delete) in the same request.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import OpenAI from 'openai'

export const dynamic   = 'force-dynamic'
export const maxDuration = 30

interface StageResult {
  pass:    boolean
  detail:  string
  error?:  string
}

export async function GET(_req: NextRequest) {
  const session = await getAdminSession()
  if (!session)                     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const results: Record<string, StageResult> = {}

  // ── Stage 1: column presence ──────────────────────────────────────────────
  try {
    const rows = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'orbit_media'
      ORDER BY column_name
    `
    const present = new Set(rows.map(r => r.column_name))
    const required = ['media_type', 'duration_ms', 'source_type', 'source_media_id', 'is_reference', 'generation_status', 'provider', 'model', 'provider_job_id', 'width', 'height', 'poster_data']
    const missing = required.filter(c => !present.has(c))
    if (missing.length === 0) {
      results.db_columns = { pass: true, detail: `All ${required.length} required columns present.` }
    } else {
      results.db_columns = { pass: false, detail: `Missing columns: ${missing.join(', ')}` }
    }
  } catch (err) {
    results.db_columns = { pass: false, detail: 'Could not query information_schema.', error: err instanceof Error ? err.message : String(err) }
  }

  // ── Stage 2: DB write round-trip ──────────────────────────────────────────
  let testId: string | null = null
  try {
    const row = await prisma.orbitMedia.create({
      data: {
        source:           'diagnostic_test',
        storagePath:      '_diagnostic_',
        format:           '1x1',
        prompt:           '__orbit_diagnostic_test__',
        generationStatus: 'diagnostic',
        provider:         'diagnostic',
        model:            'diagnostic',
        mediaType:        'image',
      },
    })
    testId = row.id
    await prisma.orbitMedia.delete({ where: { id: testId } })
    results.db_write = { pass: true, detail: `Created and deleted test row ${testId}.` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    results.db_write = { pass: false, detail: 'OrbitMedia create/delete failed.', error: msg }
    // Attempt cleanup in case create succeeded but delete failed
    if (testId) {
      await prisma.orbitMedia.delete({ where: { id: testId } }).catch(() => {})
    }
  }

  // ── Stage 3: OpenAI reachability ──────────────────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    results.openai = { pass: false, detail: 'OPENAI_API_KEY env var is not set.' }
  } else {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const model = await client.models.retrieve('gpt-image-2')
      results.openai = { pass: true, detail: `gpt-image-2 is accessible (id=${model.id}).` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.openai = { pass: false, detail: 'OpenAI API call failed.', error: msg.slice(0, 200) }
    }
  }

  // ── Stage 4: Supabase storage bucket ─────────────────────────────────────
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.storage.getBucket('orbit-media')
    if (error || !data) {
      results.storage = { pass: false, detail: 'orbit-media bucket not accessible.', error: error?.message ?? 'null bucket response' }
    } else {
      results.storage = { pass: true, detail: `orbit-media bucket found (public=${data.public}).` }
    }
  } catch (err) {
    results.storage = { pass: false, detail: 'Supabase storage check threw.', error: err instanceof Error ? err.message : String(err) }
  }

  const allPass = Object.values(results).every(r => r.pass)

  return NextResponse.json({
    ok:      allPass,
    summary: allPass ? 'All diagnostic stages passed.' : 'One or more stages failed — see results.',
    results,
  }, { status: allPass ? 200 : 500 })
}
