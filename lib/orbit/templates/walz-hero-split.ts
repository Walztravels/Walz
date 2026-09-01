/**
 * Walz Hero Split — premium dark navy/cyan promotional poster.
 *
 * Inspired by:
 *   "Pay for your flight with crypto"
 *   "Every week you wait, December gets more expensive"
 *
 * Layout:
 *   - Logo centered top
 *   - Large bold headline, left-aligned
 *   - Supporting subheadline, left-aligned
 *   - Photographic subject occupies right 40–50% of frame
 *   - Price / route / CTA lower-left
 *   - Decorative aircraft / feature object optional
 *   - Walz contact bar at base
 *
 * Background: premium navy → cyan gradient
 */

import type { WalzTemplate } from './schema'
import { TEMPLATE_CANVASES } from './schema'

export const walzHeroSplit: WalzTemplate = {
  key:         'walz_hero_split',
  label:       'Walz Hero Split',
  description: 'Bold headline left, photographic subject right. Best for feature campaigns and flight offers.',
  campaignTypes: ['flight_offer', 'payment_feature', 'general_promotion', 'travel_package'],

  canvases: [
    TEMPLATE_CANVASES['1080x1350'],
    TEMPLATE_CANVASES['1080x1920'],
    TEMPLATE_CANVASES['1080x1080'],
  ],
  defaultCanvas: '1080x1350',
  background: 'dark_navy_gradient',

  zones: {
    logo: {
      text: 'WALZ TRAVELS',
      x: 0.5, y: 0.055,
      fontSize: 30, fontWeight: '800',
      color: '#ffffff', align: 'center', visible: true,
    },
    headline: {
      text: '',
      x: 0.06, y: 0.26,
      fontSize: 72, fontWeight: '800',
      color: '#ffffff', align: 'left', visible: true,
      maxWidth: 0.52,
    },
    subheadline: {
      text: '',
      x: 0.06, y: 0.50,
      fontSize: 28, fontWeight: '400',
      color: '#c8e8f4', align: 'left', visible: true,
      maxWidth: 0.52,
    },
    route: {
      text: '',
      x: 0.06, y: 0.62,
      fontSize: 24, fontWeight: '600',
      color: '#d4af37', align: 'left', visible: true,
    },
    currency: {
      text: 'NGN',
      x: 0.06, y: 0.73,
      fontSize: 22, fontWeight: '600',
      color: '#d4af37', align: 'left', visible: true,
    },
    price: {
      text: '',
      x: 0.06, y: 0.80,
      fontSize: 80, fontWeight: '800',
      color: '#ffffff', align: 'left', visible: true,
    },
    cta: {
      text: '',
      x: 0.18, y: 0.90,
      fontSize: 28, fontWeight: '700',
      color: '#1a1a2e', align: 'center', visible: true,
    },
    terms: {
      text: '',
      x: 0.5, y: 0.95,
      fontSize: 14, fontWeight: '400',
      color: '#9cafc0', align: 'center', visible: true,
      maxWidth: 0.9,
    },
    contact: {
      text: '',
      x: 0.5, y: 0.98,
      fontSize: 17, fontWeight: '600',
      color: '#d4af37', align: 'center', visible: true,
    },
  },

  artDirection: {
    subjectPlacement: 'right',
    visualMood: 'premium commercial travel advertising, cinematic, aspirational',
    promptGuidance:
      'Commercial travel advertising photograph. ' +
      'Photographic subject (person or feature object) positioned on the RIGHT half of the frame. ' +
      'Left half of frame is relatively uncluttered, with dark navy or deep blue gradient tones, ' +
      'to provide clear space for headline typography. ' +
      'Premium cinematic lighting. Slight vignette at edges. ' +
      'Deep navy blues and teals. Rich, saturated but sophisticated colours. ',
    safeAreas: 'Keep left 50% of frame free of faces and busy detail. Upper centre clear for logo.',
    suggestedBrandPresets: ['premium_travel', 'december_flights_home', 'luxury_escape', 'concierge'],
  },

  commercialFields: [
    {
      layerKey: 'headline', label: 'Headline', type: 'text', required: true,
      placeholder: 'e.g. Pay for your flight with crypto',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'subheadline', label: 'Subheadline', type: 'text', required: false,
      placeholder: 'e.g. Book now and pay in Bitcoin, USDT or ETH',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'route', label: 'Route', type: 'route', required: false,
      placeholder: 'e.g. Lagos • London • Toronto',
      helpText: 'Route or feature label shown below subheadline',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'currency', label: 'Currency', type: 'currency', required: false,
      placeholder: 'NGN',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'price', label: 'Price', type: 'price', required: false,
      placeholder: 'e.g. 850,000',
      helpText: 'Leave blank if not a price-led campaign',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'cta', label: 'Call to Action', type: 'cta', required: true,
      placeholder: 'e.g. Book Now',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'terms', label: 'Terms / Small Print', type: 'terms', required: false,
      placeholder: 'e.g. *Subject to availability. T&Cs apply.',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'contact', label: 'Contact Line', type: 'text', required: false,
      placeholder: 'e.g. +234 707 769 1701 | @walz_travels',
      helpText: 'Leave blank to use default Walz contact bar',
      aiMustNotGenerate: true,
    },
  ],
}
