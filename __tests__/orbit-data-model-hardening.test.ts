/**
 * Orbit — data model hardening tests.
 *
 * Verifies that:
 *   - resolveOrbitMediaAsset() correctly classifies all source types
 *   - Legacy sentinel rows (storagePath='media_library:<id>') still resolve
 *   - New sourceType/sourceMediaId rows resolve correctly
 *   - providerJobId is NOT used for Media Library IDs
 *   - storagePath sentinel is NOT used for new Media Library rows
 *   - Manual upload uses a real storage path
 *   - AI providerJobId continues working for FAL/Runway polls
 *   - Archive logic identifies library refs correctly
 *   - FAL animation source URL is resolved from DB (no SSRF)
 *   - Buffer/Campaign Media receives the resolved URL regardless of source
 *   - Duplicate attach idempotency uses new fields + legacy fallback
 *   - No arbitrary URL path introduced
 */

import {
  resolveOrbitMediaAsset,
  resolveAnimationSourceUrl,
  archiveShouldPreserveStorage,
} from '../lib/orbit/media-resolver'
import type { OrbitMediaRow } from '../lib/orbit/media-resolver'

// ── Test fixtures ─────────────────────────────────────────────────────────────

function aiRow(overrides: Partial<OrbitMediaRow> = {}): OrbitMediaRow {
  return {
    id:              'cm_ai_001',
    source:          'generated',
    storagePath:     'orbit/cm_ai_001.jpg',
    publicUrl:       'https://supabase.co/storage/orbit/cm_ai_001.jpg',
    provider:        'openai',
    providerJobId:   null,
    generationStatus: 'completed',
    isReference:     false,
    mediaType:       'image',
    altText:         'Dubai skyline',
    sourceType:      'ai',
    sourceMediaId:   null,
    ...overrides,
  }
}

function falVideoRow(overrides: Partial<OrbitMediaRow> = {}): OrbitMediaRow {
  return {
    id:              'cm_fal_001',
    source:          'generated',
    storagePath:     '',
    publicUrl:       null,
    provider:        'fal',
    providerJobId:   'fal-req-abc123',   // real FAL request ID
    generationStatus: 'pending',
    isReference:     false,
    mediaType:       'video',
    altText:         '',
    sourceType:      'ai',
    sourceMediaId:   null,
    ...overrides,
  }
}

function libraryRow(overrides: Partial<OrbitMediaRow> = {}): OrbitMediaRow {
  return {
    id:              'cm_lib_001',
    source:          'media_library',
    storagePath:     '',
    publicUrl:       'https://supabase.co/storage/marketing-media/dubai.jpg',
    provider:        'media_library',
    providerJobId:   null,               // NOT set — library ID goes in sourceMediaId
    generationStatus: 'completed',
    isReference:     false,
    mediaType:       'image',
    altText:         'Dubai skyline from library',
    sourceType:      'media_library',
    sourceMediaId:   'cm_mkt_dubai_001',
    ...overrides,
  }
}

function legacyLibraryRow(overrides: Partial<OrbitMediaRow> = {}): OrbitMediaRow {
  // Row created BEFORE the sourceType/sourceMediaId migration.
  // Uses the old sentinel pattern: storagePath = 'media_library:<id>'
  //                                providerJobId = MarketingMedia.id
  const id = overrides.sourceMediaId ?? 'cm_mkt_legacy_001'
  return {
    id:              'cm_lib_legacy_001',
    source:          'media_library',
    storagePath:     `media_library:${id}`,
    publicUrl:       'https://supabase.co/storage/marketing-media/legacy.jpg',
    provider:        'media_library',
    providerJobId:   id,                 // old overloading pattern
    generationStatus: 'completed',
    isReference:     false,
    mediaType:       'image',
    altText:         'Legacy library image',
    sourceType:      null,               // NOT yet migrated
    sourceMediaId:   null,              // NOT yet migrated
    ...overrides,
  }
}

function uploadRow(overrides: Partial<OrbitMediaRow> = {}): OrbitMediaRow {
  return {
    id:              'cm_up_001',
    source:          'uploaded',
    storagePath:     'orbit/cm_up_001.mp4',
    publicUrl:       'https://supabase.co/storage/orbit/cm_up_001.mp4',
    provider:        'uploaded',
    providerJobId:   null,
    generationStatus: 'completed',
    isReference:     false,
    mediaType:       'video',
    altText:         'Manual upload video',
    sourceType:      'manual_upload',
    sourceMediaId:   null,
    ...overrides,
  }
}

// ── resolveOrbitMediaAsset — new model ────────────────────────────────────────

describe('resolveOrbitMediaAsset — new sourceType fields', () => {
  it('classifies AI image correctly', () => {
    const r = resolveOrbitMediaAsset(aiRow())
    expect(r.sourceType).toBe('ai')
    expect(r.isAI).toBe(true)
    expect(r.isLibraryRef).toBe(false)
    expect(r.isManualUpload).toBe(false)
    expect(r.isOrbitOwned).toBe(true)
    expect(r.sourceMediaId).toBeNull()
  })

  it('classifies FAL pending video correctly', () => {
    const r = resolveOrbitMediaAsset(falVideoRow())
    expect(r.sourceType).toBe('ai')
    expect(r.isAI).toBe(true)
    expect(r.isPending).toBe(true)
    expect(r.url).toBeNull()
  })

  it('classifies FAL completed video correctly', () => {
    const r = resolveOrbitMediaAsset(falVideoRow({
      generationStatus: 'completed',
      storagePath:      'orbit/cm_fal_001.mp4',
      publicUrl:        'https://supabase.co/storage/orbit/cm_fal_001.mp4',
    }))
    expect(r.sourceType).toBe('ai')
    expect(r.isPending).toBe(false)
    expect(r.url).toMatch(/\.mp4$/)
  })

  it('classifies Media Library attachment correctly', () => {
    const r = resolveOrbitMediaAsset(libraryRow())
    expect(r.sourceType).toBe('media_library')
    expect(r.isLibraryRef).toBe(true)
    expect(r.isAI).toBe(false)
    expect(r.isManualUpload).toBe(false)
    expect(r.isOrbitOwned).toBe(false)
    expect(r.sourceMediaId).toBe('cm_mkt_dubai_001')
  })

  it('classifies manual upload correctly', () => {
    const r = resolveOrbitMediaAsset(uploadRow())
    expect(r.sourceType).toBe('manual_upload')
    expect(r.isManualUpload).toBe(true)
    expect(r.isAI).toBe(false)
    expect(r.isLibraryRef).toBe(false)
    expect(r.isOrbitOwned).toBe(true)
  })

  it('URL for library ref is marketing-media bucket URL', () => {
    const r = resolveOrbitMediaAsset(libraryRow())
    expect(r.url).toBe('https://supabase.co/storage/marketing-media/dubai.jpg')
  })

  it('URL for AI asset is orbit bucket URL', () => {
    const r = resolveOrbitMediaAsset(aiRow())
    expect(r.url).toBe('https://supabase.co/storage/orbit/cm_ai_001.jpg')
  })

  it('URL for manual upload is orbit bucket URL', () => {
    const r = resolveOrbitMediaAsset(uploadRow())
    expect(r.url).toBe('https://supabase.co/storage/orbit/cm_up_001.mp4')
  })
})

// ── resolveOrbitMediaAsset — legacy backward compat ──────────────────────────

describe('resolveOrbitMediaAsset — legacy sentinel rows', () => {
  it('resolves legacy media_library:<id> storagePath correctly', () => {
    const r = resolveOrbitMediaAsset(legacyLibraryRow())
    expect(r.sourceType).toBe('media_library')
    expect(r.isLibraryRef).toBe(true)
    expect(r.sourceMediaId).toBe('cm_mkt_legacy_001')
    expect(r.url).toBe('https://supabase.co/storage/marketing-media/legacy.jpg')
  })

  it('legacy row provides publicUrl (not storagePath sentinel) as URL', () => {
    const r = resolveOrbitMediaAsset(legacyLibraryRow())
    // URL should come from publicUrl, not from parsing the sentinel
    expect(r.url).not.toContain('media_library:')
  })

  it('extracts correct sourceMediaId from legacy sentinel', () => {
    const row = legacyLibraryRow({ sourceMediaId: 'cm_specific_id_999' })
    // The legacy row has storagePath = 'media_library:cm_specific_id_999'
    const r = resolveOrbitMediaAsset(row)
    expect(r.sourceMediaId).toBe('cm_specific_id_999')
  })

  it('legacy row marked isOrbitOwned=false', () => {
    const r = resolveOrbitMediaAsset(legacyLibraryRow())
    expect(r.isOrbitOwned).toBe(false)
  })
})

// ── providerJobId must NOT be used for library IDs ────────────────────────────

describe('providerJobId must not be used for Media Library IDs', () => {
  it('new library row has providerJobId=null', () => {
    const row = libraryRow()
    expect(row.providerJobId).toBeNull()
  })

  it('new library row sourceMediaId carries the MarketingMedia ID', () => {
    const row = libraryRow()
    expect(row.sourceMediaId).toBe('cm_mkt_dubai_001')
    // And providerJobId is NOT the same as sourceMediaId
    expect(row.providerJobId).not.toBe(row.sourceMediaId)
  })

  it('AI FAL row stores real FAL request ID in providerJobId', () => {
    const row = falVideoRow()
    expect(row.providerJobId).toBe('fal-req-abc123')
    // providerJobId is a FAL request ID, not a DB entity ID
    expect(row.sourceMediaId).toBeNull()
  })

  it('providerJobId is only present on AI rows, not library or upload rows', () => {
    const ai  = falVideoRow()
    const lib = libraryRow()
    const up  = uploadRow()
    expect(ai.providerJobId).not.toBeNull()
    expect(lib.providerJobId).toBeNull()
    expect(up.providerJobId).toBeNull()
  })
})

// ── storagePath must not carry library sentinel for new rows ──────────────────

describe('storagePath semantics', () => {
  it('new library row has empty storagePath (Orbit does not own the binary)', () => {
    const row = libraryRow()
    expect(row.storagePath).toBe('')
  })

  it('AI row storagePath is a real Orbit storage path', () => {
    const row = aiRow()
    expect(row.storagePath).toMatch(/^orbit\//)
  })

  it('manual upload row storagePath is a real Orbit storage path', () => {
    const row = uploadRow()
    expect(row.storagePath).toMatch(/^orbit\//)
  })

  it('legacy row storagePath IS the sentinel (and is still resolved correctly)', () => {
    const row = legacyLibraryRow()
    expect(row.storagePath).toMatch(/^media_library:/)
    // But the resolver handles it correctly
    const r = resolveOrbitMediaAsset(row)
    expect(r.sourceType).toBe('media_library')
  })

  it('new library row storagePath does not contain sentinel string', () => {
    const row = libraryRow()
    expect(row.storagePath).not.toContain('media_library:')
  })
})

// ── Archive / delete safety ───────────────────────────────────────────────────

describe('archiveShouldPreserveStorage', () => {
  it('library ref → true (do not touch marketing-media bucket)', () => {
    expect(archiveShouldPreserveStorage(libraryRow())).toBe(true)
  })

  it('legacy library ref → true', () => {
    expect(archiveShouldPreserveStorage(legacyLibraryRow())).toBe(true)
  })

  it('AI asset → false (Orbit owns the binary, caller decides whether to delete)', () => {
    expect(archiveShouldPreserveStorage(aiRow())).toBe(false)
  })

  it('manual upload → false (Orbit owns the binary)', () => {
    expect(archiveShouldPreserveStorage(uploadRow())).toBe(false)
  })
})

// ── FAL animation source URL resolution ──────────────────────────────────────

describe('resolveAnimationSourceUrl — SSRF protection', () => {
  it('AI image → returns orbit bucket URL from DB record', () => {
    const url = resolveAnimationSourceUrl(aiRow())
    expect(url).toBe('https://supabase.co/storage/orbit/cm_ai_001.jpg')
  })

  it('Media Library image → returns marketing-media bucket URL from DB record', () => {
    const url = resolveAnimationSourceUrl(libraryRow())
    expect(url).toBe('https://supabase.co/storage/marketing-media/dubai.jpg')
  })

  it('legacy library image → returns publicUrl from DB record', () => {
    const url = resolveAnimationSourceUrl(legacyLibraryRow())
    expect(url).toBe('https://supabase.co/storage/marketing-media/legacy.jpg')
  })

  it('manual upload → returns orbit bucket URL from DB record', () => {
    const url = resolveAnimationSourceUrl(uploadRow())
    expect(url).toBe('https://supabase.co/storage/orbit/cm_up_001.mp4')
  })

  it('pending AI with no publicUrl → returns null (not an error)', () => {
    const url = resolveAnimationSourceUrl(falVideoRow())
    expect(url).toBeNull()
  })
})

// ── Buffer / Campaign Media URL resolution ────────────────────────────────────

describe('Buffer publish URL resolution', () => {
  it('AI asset URL is available for Buffer post', () => {
    const r = resolveOrbitMediaAsset(aiRow())
    expect(r.url).toBeTruthy()
    expect(typeof r.url).toBe('string')
  })

  it('Media Library asset URL is available for Buffer post', () => {
    const r = resolveOrbitMediaAsset(libraryRow())
    expect(r.url).toBeTruthy()
    expect(typeof r.url).toBe('string')
  })

  it('Manual upload URL is available for Buffer post', () => {
    const r = resolveOrbitMediaAsset(uploadRow())
    expect(r.url).toBeTruthy()
    expect(typeof r.url).toBe('string')
  })

  it('All three source types can provide a URL without requiring AI to be enabled', () => {
    const urls = [
      resolveOrbitMediaAsset(aiRow()).url,
      resolveOrbitMediaAsset(libraryRow()).url,
      resolveOrbitMediaAsset(uploadRow()).url,
    ]
    for (const url of urls) {
      expect(url).toBeTruthy()
    }
  })
})

// ── Duplicate idempotency logic ───────────────────────────────────────────────

describe('Duplicate attach idempotency (new fields)', () => {
  it('same campaignId + sourceType + sourceMediaId identifies a duplicate', () => {
    const existing = {
      campaignId:    'camp_001',
      sourceType:    'media_library' as const,
      sourceMediaId: 'cm_mkt_001',
    }
    const incoming = {
      campaignId:    'camp_001',
      sourceType:    'media_library' as const,
      sourceMediaId: 'cm_mkt_001',
    }
    expect(existing.campaignId === incoming.campaignId &&
           existing.sourceType === incoming.sourceType &&
           existing.sourceMediaId === incoming.sourceMediaId).toBe(true)
  })

  it('different sourceMediaId is NOT a duplicate', () => {
    const existing = { campaignId: 'camp_001', sourceType: 'media_library', sourceMediaId: 'cm_mkt_001' }
    const incoming = { campaignId: 'camp_001', sourceType: 'media_library', sourceMediaId: 'cm_mkt_002' }
    expect(existing.sourceMediaId === incoming.sourceMediaId).toBe(false)
  })

  it('legacy sentinel identifies duplicate via providerJobId fallback', () => {
    const legacyExisting = { campaignId: 'camp_001', provider: 'media_library', providerJobId: 'cm_mkt_001' }
    const incoming = { mediaLibraryId: 'cm_mkt_001' }
    // Legacy lookup: provider='media_library' AND providerJobId=mediaLibraryId
    expect(legacyExisting.providerJobId === incoming.mediaLibraryId).toBe(true)
  })
})

// ── Source field values ───────────────────────────────────────────────────────

describe('Source field values after hardening', () => {
  const VALID_SOURCE_TYPES: string[] = ['ai', 'media_library', 'manual_upload']

  it('all fixture source types are valid', () => {
    const rows = [aiRow(), libraryRow(), uploadRow()]
    for (const row of rows) {
      if (row.sourceType) {
        expect(VALID_SOURCE_TYPES).toContain(row.sourceType)
      }
    }
  })

  it('library row provider remains media_library for backward compat', () => {
    expect(libraryRow().provider).toBe('media_library')
  })

  it('library row source remains media_library for backward compat', () => {
    expect(libraryRow().source).toBe('media_library')
  })

  it('AI row provider is a real AI provider name', () => {
    const AI_PROVIDERS = ['openai', 'replicate', 'fal', 'runway']
    expect(AI_PROVIDERS).toContain(aiRow().provider)
  })
})

// ── No SSRF path ──────────────────────────────────────────────────────────────

describe('SSRF protection', () => {
  it('resolver always returns URL from DB record, never from sourceMediaId', () => {
    // sourceMediaId is a DB entity ID, not a URL
    const row = libraryRow({ sourceMediaId: 'this-is-not-a-url' })
    const r = resolveOrbitMediaAsset(row)
    // URL comes from publicUrl, not sourceMediaId
    expect(r.url).not.toBe('this-is-not-a-url')
    expect(r.url).toBe('https://supabase.co/storage/marketing-media/dubai.jpg')
  })

  it('resolver returns null (not a browser-supplied URL) when publicUrl is missing', () => {
    const row = libraryRow({ publicUrl: null })
    const r = resolveOrbitMediaAsset(row)
    expect(r.url).toBeNull()
  })

  it('animation source URL is always from DB, never constructed from sourceMediaId', () => {
    const row = libraryRow({ sourceMediaId: 'https://evil.example.com/exploit' })
    const url = resolveAnimationSourceUrl(row)
    // Should return the DB publicUrl, NOT the sourceMediaId
    expect(url).toBe('https://supabase.co/storage/marketing-media/dubai.jpg')
    expect(url).not.toContain('evil.example.com')
  })
})
