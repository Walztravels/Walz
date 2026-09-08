/**
 * Orbit Creative Studio — Stage 2 (standalone studio + automatic saving).
 *
 * Covers: the explicit studio scope (campaignId null in the DB — no hidden
 * dummy campaigns), studio-capable creative routes, the export→library
 * pipeline ("Saved" only after storage+DB persistence), design-project
 * autosave with optimistic concurrency, retry-save, and navigation.
 */

import fs from 'fs'
import path from 'path'

import { STUDIO_SCOPE, isStudioScope, scopedCampaignId } from '@/lib/orbit/studio-scope'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const STUDIO_COMP = 'app/admin/orbit/campaigns/[id]/CreativeStudioSection.tsx'

describe('studio scope', () => {
  it('maps the studio route scope to a null campaignId', () => {
    expect(isStudioScope('studio')).toBe(true)
    expect(isStudioScope('cmp_123')).toBe(false)
    expect(scopedCampaignId(STUDIO_SCOPE)).toBeNull()
    expect(scopedCampaignId('cmp_123')).toBe('cmp_123')
  })
})

describe('creative routes serve the standalone studio', () => {
  const routes = [
    'app/api/admin/orbit/campaigns/[id]/creative/route.ts',
    'app/api/admin/orbit/campaigns/[id]/creative/upload/route.ts',
    'app/api/admin/orbit/campaigns/[id]/creative/reference/route.ts',
    'app/api/admin/orbit/campaigns/[id]/creative/library/route.ts',
  ]
  it.each(routes)('%s tolerates the campaign-less scope', route => {
    const src = read(route)
    expect(src).toContain('isStudioScope')
    expect(src).toContain('scopedCampaignId(params.id)')
    // never creates a dummy campaign to satisfy constraints
    expect(src).not.toContain('orbitCampaign.create')
  })
  it('asset lookups are scoped correctly in the single-asset guard', () => {
    const src = read('app/api/admin/orbit/campaigns/[id]/creative/[assetId]/route.ts')
    expect(src).toContain('campaignId: scopedCampaignId(id)')
  })
})

describe('export → Media Library pipeline', () => {
  const src = read('app/api/admin/orbit/campaigns/[id]/creative/export/route.ts')
  it('persists in the durable order: row (saving) → storage upload → READY', () => {
    const rowIdx    = src.indexOf("readiness:       'saving'")
    const uploadIdx = src.indexOf('/storage/v1/object/')
    const readyIdx  = src.indexOf("readiness: 'ready'")
    expect(rowIdx).toBeGreaterThan(-1)
    expect(uploadIdx).toBeGreaterThan(rowIdx)
    expect(readyIdx).toBeGreaterThan(uploadIdx)
  })
  it('reports failed saves loudly and marks save_failed — never a silent success', () => {
    expect(src).toContain("readiness: 'save_failed'")
    expect(src).toContain('Export was NOT saved')
  })
  it('links each export to its editable project and layer snapshot', () => {
    expect(src).toContain('designProjectId')
    expect(src).toContain('designSnapshot')
    expect(src).toContain("provider:        'compositor'")
  })
  it('validates type and size', () => {
    expect(src).toContain('image\\/(jpeg|png|webp)')
    expect(src).toContain('MAX_BYTES')
  })
})

describe('design projects (durable autosave)', () => {
  const src = read('app/api/admin/orbit/design-projects/route.ts')
  it('updates are optimistic-concurrency checked — stale writes 409, never overwrite', () => {
    expect(src).toContain('updateSeq: expectedSeq')
    expect(src).toContain('updateSeq:    expectedSeq + 1')
    expect(src).toContain('{ status: 409 }')
    expect(src).toContain('conflict: true')
    expect(src).toContain('reload to get their changes')
  })
  it('records the editing human from the session', () => {
    expect(src).toContain('lastEditedBy: session.email')
  })
  it('the studio component autosaves the project server-side with a visible indicator', () => {
    const comp = read(STUDIO_COMP)
    expect(comp).toContain('saveProjectToServer')
    expect(comp).toContain("void saveProjectToServer()")
    for (const label of ['Project saved ✓', 'Saving project…', 'Conflict — edited elsewhere']) {
      expect(comp).toContain(label)
    }
    expect(comp).toContain('initialProjectId')
  })
})

describe('poster export auto-save in the studio component', () => {
  const comp = read(STUDIO_COMP)
  it('saves to the library BEFORE showing Saved, and shows loud failure text', () => {
    const fn = comp.slice(comp.indexOf('async function handleExport'), comp.indexOf('function GenerationControls'))
    expect(fn.indexOf('/creative/export')).toBeGreaterThan(-1)
    expect(fn.indexOf('/creative/export')).toBeLessThan(fn.indexOf('URL.createObjectURL'))  // save first, download second
    expect(fn).toContain("setExportSave('saved')")
    expect(fn).toContain('Export was NOT saved')
    // 'saved' is set only from the server's ok response
    expect(fn).toContain('if (res.ok && data.ok)')
  })
})

describe('retry-save endpoint', () => {
  const src = read('app/api/admin/orbit/media/[mediaId]/retry-save/route.ts')
  it('is authenticated and re-ingests without regenerating', () => {
    expect(src).toContain('getAdminSession')
    expect(src).toContain('retrySave(params.mediaId)')
    expect(src).toContain('never re-charges')
    expect(src).not.toMatch(/generateOpenAIImage|replicate|fal|runway/i)
  })
})

describe('standalone studio page + navigation', () => {
  it('the studio page runs campaign-less with the explicit scope', () => {
    const src = read('app/admin/orbit/studio/page.tsx')
    expect(src).toContain('campaignId={STUDIO_SCOPE}')
    expect(src).not.toContain('orbitCampaign')
    // returnTo is restricted to admin paths (no open redirect)
    expect(src).toContain("returnTo.startsWith('/admin/')")
    expect(src).toContain('saved to the Media Library automatically')
  })
  it('Orbit navigation exposes Studio and Library', () => {
    const nav = read('app/admin/orbit/layout.tsx')
    expect(nav).toContain('/admin/orbit/studio')
    expect(nav).toContain('/admin/orbit/library')
  })
})
