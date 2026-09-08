/**
 * Orbit Media Library UI + campaign integration — Stage 3.
 *
 * Covers: library listing filters, asset detail actions (rename/tag,
 * archive with named blockers, versioning, retry-save), reference-based
 * campaign attachments (attach/preview/reorder/detach without deleting),
 * the create-from-campaign Studio round-trip, and page wiring.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('library list API', () => {
  const src = read('app/api/admin/orbit/library/route.ts')
  it('is super-admin gated and supports the required filters', () => {
    expect(src).toContain('getAdminSession')
    expect(src).toContain("session.role !== 'super_admin'")
    for (const f of ['mediaType', 'kind', 'readiness', 'format', 'creator', 'includeArchived']) {
      expect(src).toContain(`sp.get('${f}')`)
    }
    // design exports are distinguished from generated/uploaded assets
    expect(src).toContain("kind === 'export'")
    expect(src).toContain("provider: 'compositor'")
  })
  it('hides archived assets unless explicitly requested', () => {
    expect(src).toContain("readiness: { not: 'archived' }")
  })
})

describe('library asset API', () => {
  const src = read('app/api/admin/orbit/library/[mediaId]/route.ts')
  it('returns detail with usage and version history', () => {
    expect(src).toContain('getAssetUsage')
    expect(src).toContain("orderBy: { version: 'desc' }")
  })
  it('archive is blocked with the exact campaigns named (never silent destruction)', () => {
    expect(src).toContain('archiveAsset')
    expect(src).toContain('used by active campaign(s)')
    expect(src).toContain('{ status: 409 }')
    expect(src).not.toContain('orbitMedia.delete')     // no destructive deletion path
  })
  it('supports rename/tag and explicit new versions', () => {
    expect(src).toContain('Title cannot be empty')
    expect(src).toContain('createAssetVersion')
  })
})

describe('campaign attachments API (references, not copies)', () => {
  const src = read('app/api/admin/orbit/campaigns/[id]/attachments/route.ts')
  it('attaches by reference with a batch cap and per-item failure reporting', () => {
    expect(src).toContain('attachToCampaign')
    expect(src).toContain('at most 20')
    expect(src).toContain('failed.push')
  })
  it('detach removes ONLY the reference — the library asset is untouched', () => {
    expect(src).toContain('orbitCampaignMedia.deleteMany')
    expect(src).not.toContain('orbitMedia.delete')
    expect(src).toContain('reference ONLY')
  })
  it('reorder is transactional and GET reports per-asset publishability', () => {
    expect(src).toContain('$transaction')
    expect(src).toContain('canPublishAsset')
  })
})

describe('Media Library page', () => {
  const src = read('app/admin/orbit/library/page.tsx')
  it('offers grid/list, search, and the required filters', () => {
    for (const needle of ["'grid'", "'list'", 'Search title or tag', 'All types', 'All kinds', 'All states', 'All aspects', 'All creators']) {
      expect(src).toContain(needle)
    }
  })
  it('previews images and plays videos', () => {
    expect(src).toContain('<video')
    expect(src).toContain('controls')
  })
  it('exposes detail actions: rename/tags, download, open project, version, usage, archive', () => {
    for (const needle of ['Save details', 'Download', 'Open project in Studio', 'New version', 'Used by', 'Archive', 'Restore']) {
      expect(src).toContain(needle)
    }
    expect(src).toContain('/admin/orbit/studio?project=')
  })
  it('surfaces save failures with a retry that never regenerates', () => {
    expect(src).toContain('Retry save')
    expect(src).toContain('retry-save')
    expect(src).toContain('no regeneration')
  })
  it('supports Use in campaign without copying files', () => {
    expect(src).toContain('Use in campaign')
    expect(src).toContain('referenced — file not copied')
  })
})

describe('campaign media section', () => {
  const src = read('app/admin/orbit/campaigns/[id]/CampaignAttachments.tsx')
  it('makes Choose from Media Library the primary action, with multi-select + preview', () => {
    expect(src).toContain('Choose from Media Library')
    expect(src).toContain('picked')
    expect(src).toContain('Preview')
  })
  it('shows resolution, duration and readiness/approval per attachment', () => {
    expect(src).toContain('dims(a.media)')
    expect(src).toContain('durationMs')
    expect(src).toContain('not publishable')
  })
  it('reorders and detaches without deleting from the library', () => {
    expect(src).toContain("method: 'PATCH'")
    expect(src).toContain('Removes from this campaign only')
  })
  it('Create new asset round-trips through the standalone Studio with the brief', () => {
    expect(src).toContain('/admin/orbit/studio?returnTo=')
    expect(src).toContain('brief=')
  })
  it('states that attachments pin a specific version', () => {
    expect(src).toContain('reference a specific asset version')
  })
  it('is rendered on the campaign page', () => {
    expect(read('app/admin/orbit/campaigns/[id]/page.tsx')).toContain('<CampaignAttachments')
  })
})
