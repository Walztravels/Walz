/**
 * Creative Studio scope — lets every creative API route serve the
 * STANDALONE studio as well as campaign contexts.
 *
 * The studio is an explicit route scope (`/api/admin/orbit/campaigns/studio/…`
 * and `/admin/orbit/studio`), NOT a database record: studio-created assets
 * simply have campaignId = null. No hidden dummy campaigns exist anywhere.
 */

export const STUDIO_SCOPE = 'studio'

export function isStudioScope(id: string): boolean {
  return id === STUDIO_SCOPE
}

/** campaignId to persist/filter by: null for the standalone studio. */
export function scopedCampaignId(id: string): string | null {
  return isStudioScope(id) ? null : id
}
