/**
 * Walz Information Poster — structured, document-style information poster.
 *
 * Inspired by: "Czech Republic Work Permit" campaign style.
 *
 * Layout:
 *   - Clean white or off-white card background
 *   - Bold colour band or icon at top
 *   - Large headline centre
 *   - Numbered bullet-point style body (rendered as subheadline + additional text zones)
 *   - Walz branding bottom
 *
 * Best for: visa campaigns, work permits, immigration info, travel requirements.
 */

import type { WalzTemplate } from './schema'
import { TEMPLATE_CANVASES } from './schema'

export const walzInformationPoster: WalzTemplate = {
  key:         'walz_information_poster',
  label:       'Walz Information Poster',
  description: 'Structured information poster for visa, work permit, and immigration campaigns.',
  campaignTypes: ['visa_immigration', 'work_permit', 'general_promotion'],

  canvases: [
    TEMPLATE_CANVASES['1080x1350'],
    TEMPLATE_CANVASES['1080x1920'],
    TEMPLATE_CANVASES['1080x1080'],
  ],
  defaultCanvas: '1080x1350',
  background: 'white_card',

  zones: {
    logo: {
      text: 'WALZ TRAVELS',
      x: 0.5, y: 0.06,
      fontSize: 26, fontWeight: '800',
      color: '#0a1f3c', align: 'center', visible: true,
    },
    headline: {
      text: '',
      x: 0.5, y: 0.20,
      fontSize: 56, fontWeight: '800',
      color: '#0a1f3c', align: 'center', visible: true,
      maxWidth: 0.86,
    },
    subheadline: {
      text: '',
      x: 0.5, y: 0.38,
      fontSize: 26, fontWeight: '400',
      color: '#1a3060', align: 'center', visible: true,
      maxWidth: 0.82,
    },
    route: {
      text: '',
      x: 0.5, y: 0.75,
      fontSize: 22, fontWeight: '600',
      color: '#0a7eb4', align: 'center', visible: false,
    },
    price: {
      text: '',
      x: 0.5, y: 0.80,
      fontSize: 52, fontWeight: '800',
      color: '#0a1f3c', align: 'center', visible: false,
    },
    currency: {
      text: '',
      x: 0.5, y: 0.76,
      fontSize: 20, fontWeight: '600',
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
      fontSize: 13, fontWeight: '400',
      color: '#7a90a8', align: 'center', visible: true,
      maxWidth: 0.88,
    },
    contact: {
      text: '',
      x: 0.5, y: 0.99,
      fontSize: 15, fontWeight: '600',
      color: '#0a1f3c', align: 'center', visible: true,
    },
  },

  artDirection: {
    subjectPlacement: 'background',
    visualMood: 'professional, trustworthy, official, clean government/document aesthetic',
    promptGuidance:
      'Professional document-aesthetic photograph or illustration. ' +
      'Clean, credible, government-adjacent visuals: official buildings, skylines, passports, ' +
      'flags, professional travellers, border/airport scenes. ' +
      'Desaturated or very softly coloured background, light and airy. ' +
      'The image must feel authoritative and trustworthy — no lifestyle imagery for this template. ' +
      'Low contrast gentle background so white text panels read clearly on top.',
    safeAreas:
      'Upper 30% and lower 20%: keep light and clear for text panels. ' +
      'Centre of frame may have moderate detail.',
    suggestedBrandPresets: ['visa_campaign', 'work_permit'],
  },

  commercialFields: [
    {
      layerKey: 'headline', label: 'Headline', type: 'text', required: true,
      placeholder: 'e.g. Czech Republic Work Permit',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'subheadline', label: 'Key Information', type: 'multiline', required: true,
      placeholder: 'e.g. We handle your application, CV, cover letter & documents',
      helpText: 'Main benefit / info block below headline',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'cta', label: 'Call to Action', type: 'cta', required: false,
      placeholder: 'e.g. Apply Now',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'terms', label: 'Small Print / Requirements', type: 'terms', required: false,
      placeholder: 'e.g. Valid passport required. Subject to eligibility.',
      aiMustNotGenerate: true,
    },
    {
      layerKey: 'contact', label: 'Contact Line', type: 'text', required: false,
      placeholder: 'e.g. +44 7949 448680 | @walz_travels',
      aiMustNotGenerate: true,
    },
  ],
}
