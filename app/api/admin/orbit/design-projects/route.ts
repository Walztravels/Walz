/**
 * Orbit design projects — durable, server-side editable layer configurations.
 *
 * GET  — list recent projects (for "reopen project" in the Studio/Library)
 * POST — create or autosave a project. Updates are optimistic-concurrency
 *        checked: the client sends expectedSeq, and a stale write returns
 *        409 instead of silently overwriting another staff member's edit.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const campaignId = req.nextUrl.searchParams.get('campaignId')
    const projects = await prisma.orbitDesignProject.findMany({
      where:   { archived: false, ...(campaignId ? { campaignId } : {}) },
      orderBy: { updatedAt: 'desc' },
      take:    50,
      select: {
        id: true, title: true, templateKey: true, format: true, campaignId: true,
        updateSeq: true, createdBy: true, lastEditedBy: true, updatedAt: true,
        exports: { select: { id: true, publicUrl: true, readiness: true, version: true }, orderBy: { createdAt: 'desc' }, take: 3 },
      },
    })
    return NextResponse.json({ projects })
  } catch (err) {
    console.error('[design-projects GET]', err)
    return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 })
  }
}

interface SaveBody {
  id?:              string
  expectedSeq?:     number
  title?:           string
  templateKey?:     string
  format?:          string
  campaignId?:      string | null
  commercialFields?: Record<string, unknown>
  controls?:         Record<string, unknown>
  layerOverrides?:   Record<string, unknown>
  structuredRoutes?: unknown[]
  visualMediaId?:    string | null
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({})) as SaveBody
    const fields = {
      title:            typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 160) : undefined,
      templateKey:      typeof body.templateKey === 'string' ? body.templateKey.slice(0, 80) : undefined,
      format:           typeof body.format === 'string' ? body.format.slice(0, 20) : undefined,
      commercialFields: body.commercialFields as never,
      controls:         body.controls as never,
      layerOverrides:   body.layerOverrides as never,
      structuredRoutes: body.structuredRoutes as never,
      visualMediaId:    body.visualMediaId === undefined ? undefined : body.visualMediaId,
    }

    if (!body.id) {
      if (!fields.templateKey) return NextResponse.json({ error: 'templateKey is required' }, { status: 400 })
      const project = await prisma.orbitDesignProject.create({
        data: {
          title:            fields.title ?? 'Untitled design',
          templateKey:      fields.templateKey,
          format:           fields.format ?? '1080x1350',
          campaignId:       body.campaignId ?? null,
          commercialFields: fields.commercialFields ?? {},
          controls:         fields.controls ?? {},
          layerOverrides:   fields.layerOverrides ?? {},
          structuredRoutes: fields.structuredRoutes ?? [],
          visualMediaId:    fields.visualMediaId ?? null,
          updateSeq:        1,
          createdBy:        session.email,
          lastEditedBy:     session.email,
        },
        select: { id: true, updateSeq: true, title: true },
      })
      return NextResponse.json({ project })
    }

    // Optimistic-concurrency update: only applies when the caller saw the
    // current sequence. A colleague's newer save makes this a 409.
    const expectedSeq = Number(body.expectedSeq)
    if (!Number.isInteger(expectedSeq)) {
      return NextResponse.json({ error: 'expectedSeq is required for updates' }, { status: 400 })
    }
    const updated = await prisma.orbitDesignProject.updateMany({
      where: { id: body.id, updateSeq: expectedSeq, archived: false },
      data: {
        ...(fields.title            !== undefined ? { title: fields.title } : {}),
        ...(fields.templateKey      !== undefined ? { templateKey: fields.templateKey } : {}),
        ...(fields.format           !== undefined ? { format: fields.format } : {}),
        ...(fields.commercialFields !== undefined ? { commercialFields: fields.commercialFields } : {}),
        ...(fields.controls         !== undefined ? { controls: fields.controls } : {}),
        ...(fields.layerOverrides   !== undefined ? { layerOverrides: fields.layerOverrides } : {}),
        ...(fields.structuredRoutes !== undefined ? { structuredRoutes: fields.structuredRoutes } : {}),
        ...(fields.visualMediaId    !== undefined ? { visualMediaId: fields.visualMediaId } : {}),
        updateSeq:    expectedSeq + 1,
        lastEditedBy: session.email,
      },
    })
    if (updated.count === 0) {
      const current = await prisma.orbitDesignProject.findUnique({
        where: { id: body.id }, select: { updateSeq: true, lastEditedBy: true },
      })
      if (!current) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      return NextResponse.json({
        error: `This design was updated by ${current.lastEditedBy ?? 'another editor'} — reload to get their changes before saving.`,
        conflict: true,
        currentSeq: current.updateSeq,
      }, { status: 409 })
    }
    return NextResponse.json({ project: { id: body.id, updateSeq: expectedSeq + 1 } })
  } catch (err) {
    console.error('[design-projects POST]', err)
    return NextResponse.json({ error: 'Failed to save project' }, { status: 500 })
  }
}
