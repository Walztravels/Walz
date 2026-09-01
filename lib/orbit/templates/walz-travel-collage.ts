/**
 * Walz Travel Collage — multi-image mosaic / collage banner.
 *
 * Inspired by: brand awareness banners, "multiple destinations" collage posts.
 *
 * Layout:
 *   - Dark or navy background with space for a collage of destination images
 *   - Bold brand headline overlaid
 *   - Multiple smaller images arranged in a grid / mosaic pattern
 *     (images are AI-generated; the compositor renders them as layers)
 *   - Clean, minimal text — primarily brand-focused
 *
 * Best for: multi-destination announcements, brand campaigns, LinkedIn/Facebook banners.
 */

import type { WalzTemplate } from './schema'
import { TEMPLATE_CANVASES } from './schema'

export const walzTravelCollage: WalzTemplate = {
  key:         'walz_travel_collage',
  label:       'Walz Travel Collage',
  description: 'Multi-destination mosaic banner. Strong brand statement with rich destination visuals.',
  campaignTypes: ['destination', 'general_promotion', 'travel_package', 'seasonal'],

  canvases: [
    TEMPLATE_CANVASES['1200x628'],
    TEMPLATE_CANVASES['1080x1080'],
    TEMPLATE_CANVASES['1080x1350'],
  ],
  defaultCanvas: '1200x628',
  background: 'dark_navy_gradient',

  zones: {
    logo: {
      text: 'WALZ TRAVELS',
      x: 0.05, y: 0.12,
      fontSize: 30, fontWeight: '800',
      color: '#ffffff', align: 'left', visible: true,
    },
    headline: {
      text: '',
      x: 0.05, y: 0.36,
      fontSize: 58, fontWeight: '800',
      color: '#ffffff', align: 'left', visible: true,
      maxWidth: 0.48,
    },
    subheadline: {
      text: '',
      x: 0.05, y: 0.58,
      fontSize: 22, fontWeight: '400',
      color: '#c8e8f4', align: 'left', visible: true,
      maxWidth: 0.42,
    },
    route: {
      text: '',
      x: 0.05, y: 0.74,
      fontSize: 16, fontWeight: '600',
      color: '#d4af37', align: 'left', visible: false,
    },
    cta: {
      text: '',
      x: 0.05, y: 0.82,
      fontSize: 20, fontWeight: '700',
      color: '#1a1a2e', align: 'left', visible: true,
    },
    // Price not primary for collage
    price: {
      text: '',
      x: 0.05, y: 0.70,
      fontSize: 42, fontWeight: '800',
      color: '#ffffff', align: 'left', visible: false,
    },
    currency: {
      text: '',
      x: 0.05, y: 0.66,
      fontSize: 16, fontWeight: '600',
      color: '#d4af37', align: 'left', visible: false,
    },
    terms: {
      text: '',
      x: 0.5, y: 0.96,
      fontSize: 11, fontWeight: '400',
      color: '#7a90a8', align: 'center', visible: false,
      maxWidth: 0.9,
    },
    contact: {
      text: '',
      x: 0.05, y: 0.93,
      fontSize: 13, fontWeight: '600',
      color: '#d4af37', align: 'left', visible: true,
    },
  },

  artDirection: {
    subjectPlacement: 'right',
    visualMood: 'vibrant multi-destination travel collage, rich colours, diversity of places',
    promptGuidance:
      'Rich travel destination photograph composition. ' +
      'The RIGHT 50% of the frame should be filled with a vibrant, layered travel collage: ' +
      'multiple destination scenes blended together — city skylines, beaches, mountains, historic sites. ' +
      'Destinations from multiple continents: Africa, Europe, Middle East, North America. ' +
      'Rich saturated colours, high contrast, full of life and energy. ' +
      'LEFT 50% should have a very dark, deep navy gradient to ensure left-aligned white text is legible. ' +
      'The transition from dark left to vivid right should be smooth but clear. ' +
      'Cinematic, professional travel photography aesthetic.',
    safeAreas:
      'Left 50%: must remain dark navy for text. ' +
      'Upper left corner: logo placement. ',
    suggestedBrandPresets: ['premium_travel', 'luxury_escape', 'europe', 'africa', 'dubai'],
  },

  commercialFields: [
    {
      layerKey: 'headline', label: 'Headline', type: 'text', required: true,
      placeholder: 'e.g. Your World Awaits',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'subheadline', label: 'Subheadline', type: 'text', required: false,
      placeholder: 'e.g. Premium travel to 50+ destinations worldwide',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'cta', label: 'Call to Action', type: 'cta', required: false,
      placeholder: 'e.g. Plan Your Journey',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'contact', label: 'Contact Line', type: 'text', required: false,
      placeholder: 'e.g. @walz_travels | walztravels.com',
      aiMustNotGenerate: true,
    },
  ],
}
