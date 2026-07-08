// lib/site-settings.ts
import db from '@/lib/db'
import { cache } from 'react'
import { unstable_noStore as noStore } from 'next/cache'

export type SiteSettings = {
  whatsapp_header: string
  whatsapp_header_display: string
  whatsapp_cta: string
  whatsapp_cta_display: string
  phone_uk: string
  phone_canada: string
  phone_uae: string
  phone_nigeria: string
  phone_ghana: string
  footer_wa_1_label: string
  footer_wa_1_number: string
  footer_wa_2_label: string
  footer_wa_2_number: string
  footer_wa_3_label: string
  footer_wa_3_number: string
  footer_wa_4_label: string
  footer_wa_4_number: string
  business_address: string
  business_email: string
  business_name: string
}

export const SETTING_DEFAULTS: SiteSettings = {
  whatsapp_header:         '+12317902336',
  whatsapp_header_display: '+12317902336',
  whatsapp_cta:            '+12317902336',
  whatsapp_cta_display:    '+12317902336',
  phone_uk:                '+12317902336',
  phone_canada:            '+13657200865',
  phone_uae:               '+971000000000',
  phone_nigeria:           '+2347077691701',
  phone_ghana:             '+2330000000000',
  footer_wa_1_label:       'WhatsApp UK',
  footer_wa_1_number:      '+12317902336',
  footer_wa_2_label:       'WhatsApp Canada',
  footer_wa_2_number:      '+13657200865',
  footer_wa_3_label:       '',
  footer_wa_3_number:      '',
  footer_wa_4_label:       '',
  footer_wa_4_number:      '',
  business_address:        'THE WALZ TRAVELS INC · Ontario, Canada · Registered in England & Wales',
  business_email:          'contact@walztravels.com',
  business_name:           'Walz Travels Ltd',
}

// react cache() deduplicates within a single request.
// noStore() inside opts every call out of Next.js static / CDN caching entirely,
// so changes in the DB appear on the very next page load — no revalidation needed.
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  noStore()
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
})

// No-op — no longer needed without unstable_cache
export async function revalidateSiteSettings() {}

export function whatsappLink(number: string, message = '') {
  const clean = number.replace(/\D/g, '')
  const msg = message ? `?text=${encodeURIComponent(message)}` : ''
  return `https://wa.me/${clean}${msg}`
}
