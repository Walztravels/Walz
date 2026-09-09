// lib/site-settings.ts
import db from '@/lib/db'
import { unstable_cache, revalidateTag } from 'next/cache'
import { BUSINESS } from '@/lib/config/business'

// Type + defaults moved to lib/site-settings-defaults.ts (client-safe) —
// re-exported here so existing server imports keep working. Client modules
// must import the defaults module directly, never this file.
export type { SiteSettings } from './site-settings-defaults'
export { SETTING_DEFAULTS } from './site-settings-defaults'
import { SETTING_DEFAULTS, type SiteSettings } from './site-settings-defaults'

// unstable_cache caches the result across ALL requests for 1 hour.
// Site settings change at most once per deploy — revalidateTag('site-settings')
// can be called from an admin action to flush immediately.
export const getSiteSettings = unstable_cache(
  async (): Promise<SiteSettings> => {
    try {
      const rows = await db.siteSetting.findMany()
      const map: Record<string, string> = {}
      for (const row of rows) {
        if (row.key && row.value) map[row.key] = row.value
      }
      return { ...SETTING_DEFAULTS, ...map } as SiteSettings
    } catch (err) {
      console.error('[SiteSettings] DB read failed, using defaults:', err)
      return SETTING_DEFAULTS
    }
  },
  ['site-settings'],
  { revalidate: 3600, tags: ['site-settings'] },
)

// Call from admin settings save action to flush the cache immediately.
export async function revalidateSiteSettings() {
  revalidateTag('site-settings')
}

// Re-exported from the client-safe module — kept here so existing server
// imports keep working. Client components must import '@/lib/whatsapp-link'
// directly (this file imports Prisma and must never enter a client bundle).
export { whatsappLink } from './whatsapp-link'
