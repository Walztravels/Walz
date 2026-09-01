/**
 * Walz Seasonal Campaign — emotionally warm seasonal and cultural moment campaigns.
 *
 * Inspired by: "Every week you wait, December gets more expensive",
 *              "December Flights Home", Christmas and Eid seasonal campaigns.
 *
 * Layout:
 *   - Warm gradient or rich seasonal background (amber/gold/deep red)
 *   - Seasonal imagery: family reunion, airport, festive destination
 *   - Large centred headline with emotional hook
 *   - Supporting subheadline
 *   - Countdown / urgency element (rendered via subheadline or terms)
 *   - Price and CTA lower
 *
 * Best for: December holidays, Eid, Easter, summer peak, school holidays.
 */

import type { WalzTemplate } from './schema'
import { TEMPLATE_CANVASES } from './schema'

export const walzSeasonalCampaign: WalzTemplate = {
  key:         'walz_seasonal_campaign',
  label:       'Walz Seasonal Campaign',
  description: 'Warm, emotional seasonal campaign. Ideal for December, Eid, summer — any cultural moment.',
  campaignTypes: ['seasonal', 'flight_offer', 'travel_package'],

  canvases: [
    TEMPLATE_CANVASES['1080x1350'],
    TEMPLATE_CANVASES['1080x1920'],
    TEMPLATE_CANVASES['1080x1080'],
  ],
  defaultCanvas: '1080x1350',
  background: 'warm_seasonal',

  zones: {
    logo: {
      text: 'WALZ TRAVELS',
      x: 0.5, y: 0.048,
      fontSize: 26, fontWeight: '800',
      color: '#ffffff', align: 'center', visible: true,
    },
    headline: {
      text: '',
      x: 0.5, y: 0.22,
      fontSize: 70, fontWeight: '800',
      color: '#ffffff', align: 'center', visible: true,
      maxWidth: 0.86,
    },
    subheadline: {
      text: '',
      x: 0.5, y: 0.42,
      fontSize: 28, fontWeight: '400',
      color: '#ffe8b0', align: 'center', visible: true,
      maxWidth: 0.80,
    },
    route: {
      text: '',
      x: 0.5, y: 0.60,
      fontSize: 20, fontWeight: '600',
      color: '#ffd580', align: 'center', visible: true,
    },
    currency: {
      text: '',
      x: 0.5, y: 0.66,
      fontSize: 18, fontWeight: '600',
      color: '#ffd580', align: 'center', visible: false,
    },
    price: {
      text: '',
      x: 0.5, y: 0.72,
      fontSize: 74, fontWeight: '800',
      color: '#ffffff', align: 'center', visible: false,
    },
    cta: {
      text: '',
      x: 0.5, y: 0.85,
      fontSize: 25, fontWeight: '700',
      color: '#1a1a2e', align: 'center', visible: true,
    },
    terms: {
      text: '',
      x: 0.5, y: 0.91,
      fontSize: 13, fontWeight: '400',
      color: '#ffd580', align: 'center', visible: true,
      maxWidth: 0.86,
    },
    contact: {
      text: '',
      x: 0.5, y: 0.96,
      fontSize: 14, fontWeight: '600',
      color: '#ffe8b0', align: 'center', visible: true,
    },
  },

  artDirection: {
    subjectPlacement: 'fill',
    visualMood: 'warm, emotional, festive, family reunion, homecoming, joyful travel',
    promptGuidance:
      'Warm, emotionally resonant seasonal travel photograph. ' +
      'The image should evoke homecoming and family reunion: airport arrivals, family embraces, ' +
      'festive destinations lit up at night, cultural celebrations, or joyful travellers. ' +
      'Rich, warm colour palette: amber, gold, deep orange, candlelit tones, or festive night lights. ' +
      'The upper and lower portions of the frame should be darker to allow white headline text to read clearly. ' +
      'Slightly soft focus on background for depth. Cinematic, emotionally engaging quality.',
    safeAreas:
      'Upper 20%: darker tones for logo. ' +
      'Lower 20%: slightly darker for CTA and contact bar. ' +
      'Central 60% can have warm, busy, festive imagery.',
    suggestedBrandPresets: ['december_flights_home', 'family_holiday', 'premium_travel'],
  },

  zoneVariants: {
    '1080x1920': {
      headline:    { x: 0.5, y: 0.18, fontSize: 62, fontWeight: '800', color: '#ffffff', align: 'center', visible: true, maxWidth: 0.86 },
      subheadline: { x: 0.5, y: 0.34, fontSize: 26, fontWeight: '400', color: '#ffe8b0', align: 'center', visible: true, maxWidth: 0.80 },
      route:       { x: 0.5, y: 0.52, fontSize: 18, fontWeight: '600', color: '#ffd580', align: 'center', visible: true },
      price:       { x: 0.5, y: 0.66, fontSize: 68, fontWeight: '800', color: '#ffffff', align: 'center', visible: false },
      cta:         { x: 0.5, y: 0.82, fontSize: 23, fontWeight: '700', color: '#1a1a2e', align: 'center', visible: true },
      terms:       { x: 0.5, y: 0.88, fontSize: 12, fontWeight: '400', color: '#ffd580', align: 'center', visible: true, maxWidth: 0.86 },
      contact:     { x: 0.5, y: 0.94, fontSize: 13, fontWeight: '600', color: '#ffe8b0', align: 'center', visible: true },
    },
    '1080x1080': {
      headline:    { x: 0.5, y: 0.16, fontSize: 56, fontWeight: '800', color: '#ffffff', align: 'center', visible: true, maxWidth: 0.86 },
      subheadline: { x: 0.5, y: 0.30, fontSize: 22, fontWeight: '400', color: '#ffe8b0', align: 'center', visible: true, maxWidth: 0.80 },
      route:       { x: 0.5, y: 0.52, fontSize: 16, fontWeight: '600', color: '#ffd580', align: 'center', visible: true },
      cta:         { x: 0.5, y: 0.80, fontSize: 21, fontWeight: '700', color: '#1a1a2e', align: 'center', visible: true },
    },
  },

  commercialFields: [
    {
      layerKey: 'headline', label: 'Headline', type: 'text', required: true,
      placeholder: 'e.g. Don\'t Miss December',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'subheadline', label: 'Subheadline / Urgency', type: 'text', required: false,
      placeholder: 'e.g. Every week you wait, prices get higher',
      helpText: 'Use for emotional hook or urgency message',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'route', label: 'Route', type: 'route', required: false,
      placeholder: 'e.g. Lagos • London • Toronto',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'currency', label: 'Currency', type: 'currency', required: false,
      placeholder: 'NGN',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'price', label: 'Price', type: 'price', required: false,
      placeholder: 'e.g. 1,200,000',
      helpText: 'Leave blank for non-price seasonal campaigns',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'cta', label: 'Call to Action', type: 'cta', required: true,
      placeholder: 'e.g. Book Now',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'terms', label: 'Urgency / Terms', type: 'terms', required: false,
      placeholder: 'e.g. *Limited seats available. Book before 30 Nov.',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'contact', label: 'Contact Line', type: 'text', required: false,
      placeholder: 'e.g. +234 707 769 1701 | @walz_travels',
      aiMustNotGenerate: true,
    },
  ],
}
