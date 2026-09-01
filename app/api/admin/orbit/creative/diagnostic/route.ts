/**
 * Orbit Creative Studio — self-test diagnostic endpoint.
 *
 * GET /api/admin/orbit/creative/diagnostic
 *   Tests each layer the Creative Studio depends on and reports pass/fail
 *   per stage. All test writes are immediately rolled back (deleted).
 *
 * Stages:
 *   db_columns       — verifies all required orbit_media columns exist in production
 *   db_write_minimal — OrbitMedia create with no campaignId (schema smoke test)
 *   db_write_upload  — exact fields the manual-upload route sends
 *   db_write_library — exact fields the media-library attach route sends
 *   db_write_ref     — exact fields the reference-upload route sends
 *   openai           — confirms OPENAI_API_KEY + gpt-image-2 are reachable
 *   storage          — confirms orbit-media Supabase bucket is accessible
 *
 * RBAC: super_admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import OpenAI from 'openai'

export const dynamic   = 'force-dynamic'
export const maxDuration = 30

interface StageResult {
  pass:        boolean
  detail:      string
  prismaCode?: string
  prismaMeta?: unknown
  error?:      string
}

function captureErr(err: unknown): { error: string; prismaCode?: string; prismaMeta?: unknown } {
  if (err instanceof Error) {
    const p = err as { code?: string; meta?: unknown }
    return { error: err.message.slice(0, 300), prismaCode: p.code, prismaMeta: p.meta }
  }
  return { error: String(err) }
}

async function testCreate(
  label: string,
  data: Parameters<typeof prisma.orbitMedia.create>[0]['data'],
): Promise<StageResult> {
  let rowId: string | null = null
  try {
    const row = await prisma.orbitMedia.create({ data })
    rowId = row.id
    await prisma.orbitMedia.delete({ where: { id: rowId } })
    return { pass: true, detail: `Created and deleted test row ${rowId}.` }
  } catch (err) {
    const { error, prismaCode, prismaMeta } = captureErr(err)
    if (rowId) await prisma.orbitMedia.delete({ where: { id: rowId } }).catch(() => {})
    return { pass: false, detail: `${label} create/delete failed.`, error, prismaCode, prismaMeta }
  }
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
    const required = [
      'media_type', 'duration_ms', 'source_type', 'source_media_id',
      'is_reference', 'generation_status', 'provider', 'model',
      'provider_job_id', 'width', 'height', 'poster_data',
    ]
    const missing = required.filter(c => !present.has(c))
    results.db_columns = missing.length === 0
      ? { pass: true, detail: `All ${required.length} required columns present. Total columns: ${present.size}.` }
      : { pass: false, detail: `Missing columns: ${missing.join(', ')}` }
  } catch (err) {
    const { error, prismaCode } = captureErr(err)
    results.db_columns = { pass: false, detail: 'Could not query information_schema.', error, prismaCode }
  }

  // ── Find a real campaign to use for campaignId tests ─────────────────────
  let testCampaignId: string | null = null
  try {
    const c = await prisma.orbitCampaign.findFirst({ select: { id: true } })
    testCampaignId = c?.id ?? null
  } catch { /* non-fatal — campaignId tests will use null */ }

  // ── Stage 2: minimal create (no campaignId) ───────────────────────────────
  results.db_write_minimal = await testCreate('minimal', {
    source:           'diagnostic_test',
    storagePath:      '_diagnostic_',
    format:           '1x1',
    prompt:           '__orbit_diagnostic_minimal__',
    generationStatus: 'diagnostic',
    provider:         'diagnostic',
    model:            'diagnostic',
    mediaType:        'image',
  })

  // ── Stage 3: manual-upload field set ─────────────────────────────────────
  results.db_write_upload = await testCreate('upload', {
    source:           'uploaded',
    provider:         'uploaded',
    storagePath:      '',
    format:           '1080x1920',
    mediaType:        'image',
    campaignId:       testCampaignId ?? undefined,
    createdBy:        'diagnostic@walztravels.com',
    isReference:      false,
    generationStatus: 'processing',
  })
  if (!testCampaignId) {
    results.db_write_upload.detail += ' (no campaign found — tested without campaignId)'
  }

  // ── Stage 4: media-library field set ─────────────────────────────────────
  results.db_write_library = await testCreate('library', {
    source:           'media_library',
    provider:         'media_library',
    sourceType:       'media_library',
    sourceMediaId:    '_diagnostic_lib_id_',
    storagePath:      '',
    publicUrl:        'https://example.com/diagnostic.jpg',
    format:           '1080x1080',
    mediaType:        'image',
    campaignId:       testCampaignId ?? undefined,
    createdBy:        'diagnostic@walztravels.com',
    altText:          'diagnostic test',
    isReference:      false,
    generationStatus: 'completed',
    costUsd:          0,
  })

  // ── Stage 5: reference-upload field set ──────────────────────────────────
  results.db_write_ref = await testCreate('reference', {
    source:      'uploaded',
    storagePath: '',
    format:      'reference',
    mediaType:   'image',
    campaignId:  testCampaignId ?? undefined,
    createdBy:   'diagnostic@walztravels.com',
    isReference: true,
    altText:     'Diagnostic reference image',
  })

  // ── Stage 6: OpenAI reachability ──────────────────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    results.openai = { pass: false, detail: 'OPENAI_API_KEY env var is not set.' }
  } else {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const model  = await client.models.retrieve('gpt-image-2')
      results.openai = { pass: true, detail: `gpt-image-2 is accessible (id=${model.id}).` }
    } catch (err) {
      const { error, prismaCode } = captureErr(err)
      results.openai = { pass: false, detail: 'OpenAI API call failed.', error, prismaCode }
    }
  }

  // ── Stage 7: Supabase storage bucket ─────────────────────────────────────
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.storage.getBucket('orbit-media')
    if (error || !data) {
      results.storage = { pass: false, detail: 'orbit-media bucket not accessible.', error: error?.message ?? 'null response' }
    } else {
      results.storage = { pass: true, detail: `orbit-media bucket found (public=${data.public}).` }
    }
  } catch (err) {
    const { error } = captureErr(err)
    results.storage = { pass: false, detail: 'Supabase storage check threw.', error }
  }

  const allPass = Object.values(results).every(r => r.pass)

  return NextResponse.json({
    ok:             allPass,
    testCampaignId: testCampaignId ?? '(none found — campaignId tests ran without it)',
    summary:        allPass ? 'All diagnostic stages passed.' : 'One or more stages failed — see results.',
    results,
  }, { status: allPass ? 200 : 500 })
}
