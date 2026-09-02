/**
 * Walz Orbit — Designer Draft Persistence
 *
 * Lightweight localStorage persistence for the Designer Mode editing session.
 * Keyed per-campaign with a versioned schema so incompatible versions fail safely.
 *
 * Storage key: orbit_designer_draft_v1_{campaignId}
 * Never stores: signed URLs, canvas blobs, base64 images, AI payloads.
 * Only stores: stable IDs, control state, field text staff typed.
 */

import type { DesignControls } from './composer/design-controls'

export const DRAFT_VERSION = 1 as const
export const DRAFT_KEY = (campaignId: string) => `orbit_designer_draft_v1_${campaignId}`

export interface DesignerDraftV1 {
  version: 1
  templateKey: string
  starterKey: string | null
  format: string
  visualAssetId: string | null
  commercialFields: Record<string, string>
  controls: DesignControls
  layerOverrides: Record<string, unknown>
  savedAt: string
}

/** Build a draft snapshot — pure, no side effects. */
export function serializeDraft(
  templateKey:      string,
  starterKey:       string | null,
  format:           string,
  visualAssetId:    string | null,
  commercialFields: Record<string, string>,
  controls:         DesignControls,
  layerOverrides:   Record<string, unknown>,
  now = new Date().toISOString(),
): DesignerDraftV1 {
  return {
    version:    DRAFT_VERSION,
    templateKey,
    starterKey,
    format,
    visualAssetId,
    commercialFields,
    controls,
    layerOverrides,
    savedAt: now,
  }
}

/** Write draft to localStorage. No-op if unavailable (SSR / storage blocked). */
export function saveDraft(campaignId: string, draft: DesignerDraftV1): void {
  try {
    localStorage.setItem(DRAFT_KEY(campaignId), JSON.stringify(draft))
  } catch { /* quota exceeded or storage blocked — non-fatal */ }
}

/**
 * Read draft from localStorage.
 * Returns null if absent, corrupt, or incompatible version.
 */
export function loadDraft(campaignId: string): DesignerDraftV1 | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(campaignId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { version?: unknown }
    if (parsed.version !== DRAFT_VERSION) return null
    return parsed as DesignerDraftV1
  } catch { return null }
}

/** Remove draft from localStorage. */
export function clearDraft(campaignId: string): void {
  try {
    localStorage.removeItem(DRAFT_KEY(campaignId))
  } catch { /* non-fatal */ }
}

/**
 * When switching to a new template, keep commercial field values whose layer keys
 * exist in the new template. Drop keys that don't exist in the new template.
 *
 * This ensures staff never lose text they typed, while avoiding phantom fields
 * from a previous template being injected into an incompatible composition.
 */
export function preserveCompatibleFields(
  existingFields:     Record<string, string>,
  newTemplateLayerKeys: string[],
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of newTemplateLayerKeys) {
    if (existingFields[key] !== undefined && existingFields[key] !== '') {
      result[key] = existingFields[key]
    }
  }
  return result
}
