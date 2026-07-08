'use client'
import { useState, useEffect } from 'react'

interface SiteSettings {
  whatsapp_uk:     string
  whatsapp_us:     string
  whatsapp_canada: string
  business_name:   string
  office_address:  string
  contact_email:   string
  instagram:       string
  facebook:        string
  twitter:         string
  snapchat:        string
  brand_tagline:   string
  footer_pitch:    string
  [key: string]:   string
}

const DEFAULTS: SiteSettings = {
  whatsapp_uk:     '+12317902336',
  whatsapp_us:     '+19843880110',
  whatsapp_canada: '+15557107823',
  business_name:   'Walz Travels',
  office_address:  '1 Commercial Street, London, E1 6RF',
  contact_email:   'contact@walztravels.com',
  instagram:       '@walztravels',
  facebook:        '@walztravels',
  twitter:         '@walztravels',
  snapchat:        '@walztravels',
  brand_tagline:   'Global Travel. Expert Care.',
  footer_pitch:    'Flights. Visas. Hotels. Tours. Expertly handled for every journey.',
}

let cache: SiteSettings | null = null
let cacheTime = 0

export function useSettings() {
  const [settings, setSettings] = useState<SiteSettings>(cache ?? DEFAULTS)

  useEffect(() => {
    if (cache && Date.now() - cacheTime < 60_000) {
      setSettings(cache)
      return
    }
    fetch('/api/public/settings')
      .then(r => r.json())
      .then(data => {
        const merged = { ...DEFAULTS, ...data } as SiteSettings
        cache = merged
        cacheTime = Date.now()
        setSettings(merged)
      })
      .catch(() => {})
  }, [])

  return settings
}

export function waLink(number: string, message?: string) {
  const clean = number.replace(/\D/g, '')
  return message
    ? `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${clean}`
}
