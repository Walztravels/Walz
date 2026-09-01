/**
 * Walz Destination Editorial — light, airy editorial destination announcement.
 *
 * Inspired by: "Hello August, Hello New Destinations"
 *
 * Layout:
 *   - White or very pale cyan background
 *   - Logo centered top in navy
 *   - Large editorial headline, centered
 *   - Subheadline
 *   - Large rounded lifestyle/destination image (center)
 *   - Floating destination labels
 *   - Minimal Walz footer
 *
 * Best for: destination announcements, new routes, brand awareness.
 * NOT suited for heavy price/commercial campaigns.
 */

import type { WalzTemplate } from './schema'
import { TEMPLATE_CANVASES } from './schema'

export const walzDestinationEditorial: WalzTemplate = {
  key:         'walz_destination_editorial',
  label:       'Walz Destination Editorial',
  description: 'Clean editorial style for destination and route announcements. Light background, large lifestyle image.',
  campaignTypes: ['destination', 'general_promotion', 'travel_package', 'seasonal'],

  canvases: [
    TEMPLATE_CANVASES['1080x1350'],
    TEMPLATE_CANVASES['1080x1080'],
    TEMPLATE_CANVASES['1080x1920'],
  ],
  defaultCanvas: '1080x1350',
  background: 'light_editorial',

  zones: {
    logo: {
      text: 'WALZ TRAVELS',
      x: 0.5, y: 0.048,
      fontSize: 26, fontWeight: '800',
      color: '#0a1f3c', align: 'center', visible: true,
    },
    headline: {
      text: '',
      x: 0.5, y: 0.18,
      fontSize: 62, fontWeight: '800',
      color: '#0a1f3c', align: 'center', visible: true,
      maxWidth: 0.86,
    },
    subheadline: {
      text: '',
      x: 0.5, y: 0.31,
      fontSize: 26, fontWeight: '400',
      color: '#1a4080', align: 'center', visible: true,
      maxWidth: 0.78,
    },
    route: {
      text: '',
      x: 0.5, y: 0.86,
      fontSize: 20, fontWeight: '600',
      color: '#0a7eb4', align: 'center', visible: true,
    },
    // Price hidden by default for editorial — staff can enable
    price: {
      text: '',
      x: 0.5, y: 0.78,
      fontSize: 54, fontWeight: '800',
      color: '#0a1f3c', align: 'center', visible: false,
    },
    currency: {
      text: '',
      x: 0.5, y: 0.74,
      fontSize: 18, fontWeight: '600',
      color: '#0a7eb4', align: 'center', visible: false,
    },
    cta: {
      text: '',
      x: 0.5, y: 0.92,
      fontSize: 24, fontWeight: '700',
      color: '#ffffff', align: 'center', visible: true,
    },
    terms: {
      text: '',
      x: 0.5, y: 0.96,
      fontSize: 12, fontWeight: '400',
      color: '#5a7090', align: 'center', visible: false,
      maxWidth: 0.86,
    },
    contact: {
      text: '',
      x: 0.5, y: 0.98,
      fontSize: 14, fontWeight: '600',
      color: '#0a7eb4', align: 'center', visible: true,
    },
  },

  artDirection: {
    subjectPlacement: 'fill',
    visualMood: 'bright editorial travel lifestyle, aspirational, clean light tones',
    promptGuidance:
      'Editorial travel lifestyle photograph, bright and airy, warm natural light. ' +
      'The image should fill the center section of the frame. ' +
      'Uplifting, joyful travel imagery: landscapes, architecture, or travellers exploring. ' +
      'Clean composition with open sky or soft background in upper portion. ' +
      'Vibrant destination colours — do NOT use dark or moody tones for this template. ' +
      'Soft natural outdoor lighting. High resolution editorial quality.',
    safeAreas:
      'Upper 25% of frame: keep clear for logo and headline text. ' +
      'Lower 15%: keep clear for footer and contact bar.',
    suggestedBrandPresets: ['premium_travel', 'family_holiday', 'dubai', 'europe', 'africa'],
  },

  zoneVariants: {
    '1080x1920': {
      headline:    { x: 0.5, y: 0.15, fontSize: 56, fontWeight: '800', color: '#0a1f3c', align: 'center', visible: true, maxWidth: 0.86 },
      subheadline: { x: 0.5, y: 0.25, fontSize: 24, fontWeight: '400', color: '#1a4080', align: 'center', visible: true, maxWidth: 0.78 },
      route:       { x: 0.5, y: 0.86, fontSize: 18, fontWeight: '600', color: '#0a7eb4', align: 'center', visible: true },
      cta:         { x: 0.5, y: 0.92, fontSize: 22, fontWeight: '700', color: '#ffffff', align: 'center', visible: true },
      contact:     { x: 0.5, y: 0.97, fontSize: 13, fontWeight: '600', color: '#0a7eb4', align: 'center', visible: true },
    },
    '1080x1080': {
      headline:    { x: 0.5, y: 0.14, fontSize: 50, fontWeight: '800', color: '#0a1f3c', align: 'center', visible: true, maxWidth: 0.86 },
      subheadline: { x: 0.5, y: 0.24, fontSize: 20, fontWeight: '400', color: '#1a4080', align: 'center', visible: true, maxWidth: 0.82 },
      route:       { x: 0.5, y: 0.82, fontSize: 16, fontWeight: '600', color: '#0a7eb4', align: 'center', visible: true },
      cta:         { x: 0.5, y: 0.90, fontSize: 20, fontWeight: '700', color: '#ffffff', align: 'center', visible: true },
    },
  },

  commercialFields: [
    {
      layerKey: 'headline', label: 'Headline', type: 'text', required: true,
      placeholder: 'e.g. Hello August, Hello New Destinations',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'subheadline', label: 'Subheadline', type: 'text', required: false,
      placeholder: 'e.g. Explore the world with Walz Travels this August',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'route', label: 'Route / Destination Label', type: 'route', required: false,
      placeholder: 'e.g. Lagos • Dubai • London',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'cta', label: 'Call to Action', type: 'cta', required: false,
      placeholder: 'e.g. Explore Now',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'contact', label: 'Contact Line', type: 'text', required: false,
      placeholder: 'e.g. @walz_travels | walztravels.com',
      aiMustNotGenerate: true,
    },
  ],
}
