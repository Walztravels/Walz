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
      x: 0.5, y: 0.045,
      fontSize: 28, fontWeight: '800',
      color: '#ffffff', align: 'center', visible: true,
    },
    headline: {
      text: '',
      x: 0.05, y: 0.20,
      fontSize: 72, fontWeight: '800',
      color: '#ffffff', align: 'left', visible: true,
      maxWidth: 0.50,
    },
    subheadline: {
      text: '',
      x: 0.05, y: 0.44,
      fontSize: 26, fontWeight: '400',
      color: '#c8e8f4', align: 'left', visible: true,
      maxWidth: 0.50,
    },
    route: {
      text: '',
      x: 0.05, y: 0.56,
      fontSize: 22, fontWeight: '600',
      color: '#d4af37', align: 'left', visible: true,
    },
    currency: {
      text: 'NGN',
      x: 0.05, y: 0.64,
      fontSize: 20, fontWeight: '600',
      color: '#d4af37', align: 'left', visible: true,
    },
    price: {
      text: '',
      x: 0.05, y: 0.70,
      fontSize: 76, fontWeight: '800',
      color: '#ffffff', align: 'left', visible: true,
    },
    cta: {
      text: '',
      x: 0.17, y: 0.84,
      fontSize: 27, fontWeight: '700',
      color: '#1a1a2e', align: 'center', visible: true,
    },
    terms: {
      text: '',
      x: 0.5, y: 0.91,
      fontSize: 13, fontWeight: '400',
      color: '#9cafc0', align: 'center', visible: true,
      maxWidth: 0.9,
    },
    contact: {
      text: '',
      x: 0.5, y: 0.96,
      fontSize: 16, fontWeight: '600',
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

  zoneVariants: {
    // 9:16 story — more vertical real-estate
    '1080x1920': {
      logo:        { x: 0.5,  y: 0.040, fontSize: 28, fontWeight: '800', color: '#ffffff', align: 'center', visible: true },
      headline:    { x: 0.05, y: 0.17,  fontSize: 66, fontWeight: '800', color: '#ffffff', align: 'left', visible: true, maxWidth: 0.50 },
      subheadline: { x: 0.05, y: 0.38,  fontSize: 24, fontWeight: '400', color: '#c8e8f4', align: 'left', visible: true, maxWidth: 0.50 },
      route:       { x: 0.05, y: 0.50,  fontSize: 20, fontWeight: '600', color: '#d4af37', align: 'left', visible: true },
      currency:    { x: 0.05, y: 0.58,  fontSize: 18, fontWeight: '600', color: '#d4af37', align: 'left', visible: true },
      price:       { x: 0.05, y: 0.64,  fontSize: 72, fontWeight: '800', color: '#ffffff', align: 'left', visible: true },
      cta:         { x: 0.17, y: 0.80,  fontSize: 25, fontWeight: '700', color: '#1a1a2e', align: 'center', visible: true },
      terms:       { x: 0.5,  y: 0.88,  fontSize: 12, fontWeight: '400', color: '#9cafc0', align: 'center', visible: true, maxWidth: 0.9 },
      contact:     { x: 0.5,  y: 0.94,  fontSize: 14, fontWeight: '600', color: '#d4af37', align: 'center', visible: true },
    },
    // Square — both halves equal, tighter vertical spacing
    '1080x1080': {
      headline:    { x: 0.05, y: 0.18,  fontSize: 56, fontWeight: '800', color: '#ffffff', align: 'left', visible: true, maxWidth: 0.50 },
      subheadline: { x: 0.05, y: 0.36,  fontSize: 20, fontWeight: '400', color: '#c8e8f4', align: 'left', visible: true, maxWidth: 0.50 },
      price:       { x: 0.05, y: 0.64,  fontSize: 60, fontWeight: '800', color: '#ffffff', align: 'left', visible: true },
      cta:         { x: 0.17, y: 0.80,  fontSize: 21, fontWeight: '700', color: '#1a1a2e', align: 'center', visible: true },
      terms:       { x: 0.5,  y: 0.90,  fontSize: 10, fontWeight: '400', color: '#9cafc0', align: 'center', visible: true, maxWidth: 0.9 },
    },
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
