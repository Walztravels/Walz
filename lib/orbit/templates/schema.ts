/**
 * Walz Orbit — Graphic Designer template schema.
 *
 * Templates are pure TypeScript configuration — no DB required.
 * They define initial zone positions, art direction for AI generation,
 * and which commercial fields staff must fill in.
 *
 * CRITICAL: AI may NEVER generate commercial values.
 * Templates enforce this by declaring which fields are `aiMustNotGenerate`.
 */

import type { PosterData, PosterLayer } from '@/lib/orbit/poster-data'

/** Zone overrides per canvas — text is always staff-controlled so omit it from variants. */
export type ZoneVariantEntry = Partial<Omit<PosterLayer, 'text'>>
export type ZoneVariantMap   = Partial<Record<keyof PosterData, ZoneVariantEntry>>

// ── Canvas sizes ──────────────────────────────────────────────────────────────

export interface TemplateCanvas {
  key:       string   // matches FORMAT_PRESETS key
  label:     string
  width:     number
  height:    number
  openaiSize: string  // OpenAI API size param
  ratio:     '9:16' | '4:5' | '1:1' | '16:9' | '3:1'
}

export const TEMPLATE_CANVASES: Record<string, TemplateCanvas> = {
  '1080x1920': { key: '1080x1920', label: 'Story / Reel 9:16',      width: 1080, height: 1920, openaiSize: '1024x1536', ratio: '9:16' },
  '1080x1350': { key: '1080x1350', label: 'Portrait 4:5',           width: 1080, height: 1350, openaiSize: '1024x1536', ratio: '4:5' },
  '1080x1080': { key: '1080x1080', label: 'Square 1:1',             width: 1080, height: 1080, openaiSize: '1024x1024', ratio: '1:1' },
  '1200x628':  { key: '1200x628',  label: 'Facebook / LinkedIn',    width: 1200, height: 628,  openaiSize: '1536x1024', ratio: '16:9' },
  '1500x500':  { key: '1500x500',  label: 'Twitter / X Header',     width: 1500, height: 500,  openaiSize: '1536x1024', ratio: '3:1' },
}

// ── Campaign types ────────────────────────────────────────────────────────────

export type CampaignType =
  | 'flight_offer'
  | 'destination'
  | 'seasonal'
  | 'visa_immigration'
  | 'work_permit'
  | 'travel_package'
  | 'payment_feature'
  | 'general_promotion'

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  flight_offer:      'Flight Offer',
  destination:       'Destination',
  seasonal:          'Seasonal',
  visa_immigration:  'Visa / Immigration',
  work_permit:       'Work Permit',
  travel_package:    'Travel Package',
  payment_feature:   'Payment Feature',
  general_promotion: 'General Promotion',
}

// ── Commercial field definition ───────────────────────────────────────────────

export interface CommercialFieldConfig {
  /** Key in PosterData */
  layerKey:          keyof PosterData
  label:             string
  type:              'text' | 'price' | 'currency' | 'route' | 'multiline' | 'cta' | 'terms'
  required:          boolean
  placeholder:       string
  helpText?:         string
  /** AI MUST NOT generate this value — it is displayed prominently to staff */
  aiMustNotGenerate: true
}

// ── Art direction for image generation ────────────────────────────────────────

export interface ArtDirection {
  /** Where the photographic subject should sit in the frame */
  subjectPlacement:  'right' | 'left' | 'center' | 'lower_right' | 'background' | 'fill'
  /** Short mood descriptor for the AI art director */
  visualMood:        string
  /** Verbatim guidance appended to the image generation prompt */
  promptGuidance:    string
  /** Tells the image AI which regions to keep uncluttered for text overlays */
  safeAreas:         string
  /** Suggested brand presets that work well with this template */
  suggestedBrandPresets: string[]
}

// ── Template definition ───────────────────────────────────────────────────────

export interface WalzTemplate {
  key:              string
  label:            string
  description:      string
  /** Which campaign types this template is designed for (multiple allowed) */
  campaignTypes:    CampaignType[]
  canvases:         TemplateCanvas[]
  defaultCanvas:    string
  /** Background rendering family */
  background:       'dark_navy_gradient' | 'light_editorial' | 'warm_seasonal' | 'collage' | 'white_card'
  /** Initial PosterData zone configuration — overrides defaultPosterData() defaults */
  zones:            Partial<PosterData>
  /** Art direction used to build the AI image generation prompt */
  artDirection:     ArtDirection
  /** Which commercial layers have staff-entry UI */
  commercialFields: CommercialFieldConfig[]
  /**
   * Per-canvas layout overrides — reposition zones without scaling.
   * E.g. the 9:16 story format needs different y-positions than 4:5 portrait.
   * Keys are canvas key strings (e.g. '1080x1920').
   * Values are partial zone overrides merged on top of `zones`.
   */
  zoneVariants?: Record<string, ZoneVariantMap>
}

// ── Creative brief (Art Director output) ─────────────────────────────────────

export interface CreativeBrief {
  campaignType:      CampaignType
  templateKey:       string
  visualMood:        string
  subject:           string
  environment:       string
  lighting:          string
  composition:       string
  decorativeElements: string[]
  /** Fields staff MUST fill — AI never provides values */
  requiredCommercialFields: string[]
}
