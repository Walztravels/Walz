/**
 * Orbit Media Resolver — canonical source-of-truth for OrbitMedia asset metadata.
 *
 * Handles three asset origins:
 *   - AI-generated  (OpenAI, FAL, Replicate, Runway)
 *   - Media Library (attachment reference to a MarketingMedia record)
 *   - Manual upload (file the user uploaded directly into Orbit)
 *
 * Backward-compatible with legacy rows that used the storagePath sentinel
 * "media_library:<id>" before the sourceType/sourceMediaId fields existed.
 */

export type OrbitSourceType = 'ai' | 'media_library' | 'manual_upload' | 'unknown'

/** Minimal shape expected from an OrbitMedia DB row. */
export interface OrbitMediaRow {
  id:              string
  source:          string
  storagePath:     string
  publicUrl:       string | null
  provider:        string | null
  providerJobId:   string | null
  generationStatus?: string | null
  isReference:     boolean
  mediaType:       string
  altText:         string
  // New explicit source fields (nullable on legacy rows)
  sourceType:      string | null
  sourceMediaId:   string | null
}

export interface ResolvedOrbitAsset {
  /** Canonical URL for display, Buffer publish, and FAL animation input. */
  url:             string | null
  /** Explicit source classification. */
  sourceType:      OrbitSourceType
  /** MarketingMedia.id when sourceType='media_library'; null otherwise. */
  sourceMediaId:   string | null
  /** True when Orbit owns the binary (AI-generated or manually uploaded). */
  isOrbitOwned:    boolean
  /** True when this record is an AI-generated asset. */
  isAI:            boolean
  /** True when this record references an external MarketingMedia asset. */
  isLibraryRef:    boolean
  /** True when the user uploaded the file directly into Orbit. */
  isManualUpload:  boolean
  /** True when this is a pending/processing generation. */
  isPending:       boolean
}

/**
 * Resolve an OrbitMedia row into a canonical asset descriptor.
 *
 * Priority order:
 * 1. Explicit sourceType/sourceMediaId fields (new rows)
 * 2. Legacy storagePath sentinel "media_library:<id>"
 * 3. Infer from provider field ('uploaded' → manual_upload, else ai)
 */
export function resolveOrbitMediaAsset(media: OrbitMediaRow): ResolvedOrbitAsset {
  const isPending = media.generationStatus === 'pending' || media.generationStatus === 'processing'

  // ── 1. Explicit new-model fields ─────────────────────────────────────────────
  if (media.sourceType) {
    const sourceType = media.sourceType as OrbitSourceType
    return {
      url:           media.publicUrl,
      sourceType,
      sourceMediaId: media.sourceMediaId,
      isOrbitOwned:  sourceType !== 'media_library',
      isAI:          sourceType === 'ai',
      isLibraryRef:  sourceType === 'media_library',
      isManualUpload: sourceType === 'manual_upload',
      isPending,
    }
  }

  // ── 2. Legacy sentinel: storagePath = "media_library:<id>" ───────────────────
  if (media.storagePath?.startsWith('media_library:')) {
    const sourceMediaId = media.storagePath.replace('media_library:', '') || null
    return {
      url:           media.publicUrl,
      sourceType:    'media_library',
      sourceMediaId,
      isOrbitOwned:  false,
      isAI:          false,
      isLibraryRef:  true,
      isManualUpload: false,
      isPending,
    }
  }

  // ── 3. Infer from provider / source fields ───────────────────────────────────
  if (media.provider === 'uploaded' || media.source === 'uploaded') {
    return {
      url:           media.publicUrl,
      sourceType:    'manual_upload',
      sourceMediaId: null,
      isOrbitOwned:  true,
      isAI:          false,
      isLibraryRef:  false,
      isManualUpload: true,
      isPending,
    }
  }

  if (media.source === 'generated' ||
      media.provider === 'openai' ||
      media.provider === 'replicate' ||
      media.provider === 'fal' ||
      media.provider === 'runway') {
    return {
      url:           media.publicUrl,
      sourceType:    'ai',
      sourceMediaId: null,
      isOrbitOwned:  true,
      isAI:          true,
      isLibraryRef:  false,
      isManualUpload: false,
      isPending,
    }
  }

  // ── Fallback: unknown origin (should not occur on well-formed data) ───────────
  return {
    url:           media.publicUrl,
    sourceType:    'unknown',
    sourceMediaId: null,
    isOrbitOwned:  false,
    isAI:          false,
    isLibraryRef:  false,
    isManualUpload: false,
    isPending,
  }
}

/**
 * Returns the URL that should be passed to FAL.ai for image-to-video animation.
 * For library references this is the stored publicUrl (marketing-media bucket).
 * For uploaded/generated assets this is the Orbit storage publicUrl.
 * Never returns a browser-supplied URL (SSRF protection).
 */
export function resolveAnimationSourceUrl(media: OrbitMediaRow): string | null {
  return resolveOrbitMediaAsset(media).url
}

/**
 * Returns true when archiving this asset should NOT touch underlying storage.
 * Library references leave the MarketingMedia object untouched.
 */
export function archiveShouldPreserveStorage(media: OrbitMediaRow): boolean {
  const resolved = resolveOrbitMediaAsset(media)
  return resolved.isLibraryRef
}
