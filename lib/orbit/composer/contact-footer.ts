/**
 * Walz Orbit Composer — central contact footer builder.
 *
 * All contact data is derived from BUSINESS config — never hardcoded
 * in template files. This prevents stale phone numbers / emails.
 */

import { BUSINESS } from '@/lib/config/business'
import type { ContactBarItem, ContactBarLayer } from './layer-model'

export type FooterVariant = 'dark' | 'light' | 'compact' | 'full'

const DARK_COLORS  = { color: '#d4af37',   backgroundColor: 'rgba(0,0,0,0.45)' }
const LIGHT_COLORS = { color: '#0a1f3c',   backgroundColor: 'rgba(255,255,255,0.85)' }

/** Build the set of contact bar items for a given variant. */
export function buildContactBarItems(variant: FooterVariant): ContactBarItem[] {
  const { contacts } = BUSINESS

  if (variant === 'compact') {
    return [
      { icon: '📱', text: contacts.globalWhatsapp.display,  highlight: true },
      { icon: '✉',  text: contacts.email },
    ]
  }

  if (variant === 'full') {
    return [
      { icon: '🇬🇧', text: contacts.visaWhatsapp.display },
      { icon: '🇨🇦', text: contacts.globalWhatsapp.display, highlight: true },
      { icon: '🇳🇬', text: contacts.nigeriaWhatsapp.display },
      { icon: '✉',   text: contacts.email },
      { icon: '📸',  text: '@walz_travels' },
    ]
  }

  // dark / light — standard 3-item bar
  return [
    { icon: '📱', text: contacts.globalWhatsapp.display, highlight: true },
    { icon: '✉',  text: contacts.email },
    { icon: '📸', text: '@walz_travels' },
  ]
}

/**
 * Build a ready-to-render ContactBarLayer for the bottom of a poster.
 *
 * Position defaults: pinned to bottom (y = 0.975), full width (x = 0.5 center).
 * Caller may override x/y/zIndex if the template needs a different placement.
 */
export function buildContactBarLayer(
  variant:  FooterVariant = 'dark',
  overrides?: {
    x?:       number
    y?:       number
    zIndex?:  number
    fontSize?: number
  },
): ContactBarLayer {
  const colors = variant === 'light' ? LIGHT_COLORS : DARK_COLORS

  return {
    id:      'contact_bar',
    type:    'contact_bar',
    variant,
    items:   buildContactBarItems(variant),
    x:       overrides?.x       ?? 0.5,
    y:       overrides?.y       ?? 0.975,
    zIndex:  overrides?.zIndex  ?? 100,
    visible: true,
    fontSize: overrides?.fontSize ?? 14,
    ...colors,
  }
}
