/**
 * Walz Orbit — Production starter variants.
 *
 * Pre-calibrated TemplateVariant objects that staff can load as a starting point.
 * Each starter encodes visual controls and typography that match a known
 * publishing-quality outcome.
 *
 * No commercial values are stored here — all text fields are placeholders.
 * Starters only set design controls and layer visual properties.
 */

import type { TemplateVariant } from '../composer/template-variants'
import type { DesignControls }  from '../composer/design-controls'

// Starters store no decorative element instances (positions are set at design time).
// Recommended element keys are recorded in the description only.
const EMPTY_DECORATIVES: [] = []

function makeStarter(
  key:              string,
  label:            string,
  baseTemplateKey:  string,
  controls:         Partial<DesignControls>,
  typographyPreset: string,
  _recommendedDecoratives: string[],  // informational only — not stored as instances
  description:      string,
): TemplateVariant {
  const now = new Date().toISOString()
  return {
    key,
    label,
    baseTemplateKey,
    controls:           controls as DesignControls,
    layerOverrides:     {},
    typographyPreset,
    decorativeElements: EMPTY_DECORATIVES,
    createdBy:          'walz_production_library',
    createdAt:          now,
    updatedAt:          now,
    description,
  }
}

// ── Hero Split starters ────────────────────────────────────────────────────────

export const STARTER_HERO_PREMIUM_DARK: TemplateVariant = makeStarter(
  'hero_premium_dark',
  'Hero — Premium Dark',
  'walz_hero_split',
  {
    subjectPosition:    'right',
    subjectScale:       'large',
    imageCrop:          'focus_center',
    backgroundIntensity:'dramatic',
    overlayStrength:    58,
    textAlignment:      'left',
    contentDensity:     'balanced',
    footer:             'full',
    typographyPreset:   'campaign_heavy',
    showGuides:         false,
    accentColor:        '#d4af37',
  },
  'campaign_heavy',
  ['aircraft'],
  'Bold payment or feature campaign. Dark navy, premium feel. Human subject right, headline left.',
)

export const STARTER_HERO_LIFESTYLE: TemplateVariant = makeStarter(
  'hero_lifestyle',
  'Hero — Lifestyle Offer',
  'walz_hero_split',
  {
    subjectPosition:    'right',
    subjectScale:       'large',
    imageCrop:          'focus_top',
    backgroundIntensity:'normal',
    overlayStrength:    50,
    textAlignment:      'left',
    contentDensity:     'balanced',
    footer:             'compact',
    typographyPreset:   'editorial_bold',
    showGuides:         false,
    accentColor:        '#00d4ff',
  },
  'editorial_bold',
  [],
  'Lifestyle-forward travel offer. Confident traveller subject, editorial bold headline.',
)

export const STARTER_HERO_PRICE_LED: TemplateVariant = makeStarter(
  'hero_price_led',
  'Hero — Price Led',
  'walz_hero_split',
  {
    subjectPosition:    'right',
    subjectScale:       'medium',
    imageCrop:          'focus_center',
    backgroundIntensity:'dramatic',
    overlayStrength:    62,
    textAlignment:      'left',
    contentDensity:     'information_heavy',
    footer:             'full',
    typographyPreset:   'campaign_heavy',
    showGuides:         false,
    accentColor:        '#d4af37',
  },
  'campaign_heavy',
  [],
  'Price-led flight offer with route, currency, and price block visible. Dense information layout.',
)

// ── Seasonal Campaign starters ────────────────────────────────────────────────

export const STARTER_SEASONAL_DECEMBER: TemplateVariant = makeStarter(
  'seasonal_december',
  'Seasonal — December Warmth',
  'walz_seasonal_campaign',
  {
    subjectPosition:    'center',
    subjectScale:       'large',
    imageCrop:          'focus_center',
    backgroundIntensity:'dramatic',
    overlayStrength:    62,
    textAlignment:      'center',
    contentDensity:     'balanced',
    footer:             'full',
    typographyPreset:   'editorial_bold',
    showGuides:         false,
    accentColor:        '#ffd580',
  },
  'editorial_bold',
  ['seasonal_lights'],
  'Warm December / homecoming campaign. Emotional centred headline, amber/gold palette.',
)

export const STARTER_SEASONAL_EID: TemplateVariant = makeStarter(
  'seasonal_eid',
  'Seasonal — Eid / Festive',
  'walz_seasonal_campaign',
  {
    subjectPosition:    'center',
    subjectScale:       'large',
    imageCrop:          'focus_center',
    backgroundIntensity:'dramatic',
    overlayStrength:    55,
    textAlignment:      'center',
    contentDensity:     'minimal',
    footer:             'compact',
    typographyPreset:   'luxury_modern',
    showGuides:         false,
    accentColor:        '#e8c873',
  },
  'luxury_modern',
  [],
  'Festive Eid or cultural moment campaign. Minimal text, luxury modern type, full-bleed image.',
)

// ── Information Poster starters ───────────────────────────────────────────────

export const STARTER_INFORMATION_WORK_PERMIT: TemplateVariant = makeStarter(
  'information_work_permit',
  'Information — Work Permit',
  'walz_information_poster',
  {
    subjectPosition:    'center',
    subjectScale:       'small',
    imageCrop:          'contain',
    backgroundIntensity:'soft',
    overlayStrength:    22,
    textAlignment:      'center',
    contentDensity:     'information_heavy',
    footer:             'compact',
    typographyPreset:   'information_clean',
    showGuides:         false,
    accentColor:        '#0a7eb4',
  },
  'information_clean',
  [],
  'Work permit / visa campaign. Dense scannable hierarchy, clean white card aesthetic, no decoratives.',
)

export const STARTER_INFORMATION_VISA: TemplateVariant = makeStarter(
  'information_visa',
  'Information — Visa Campaign',
  'walz_information_poster',
  {
    subjectPosition:    'center',
    subjectScale:       'small',
    imageCrop:          'contain',
    backgroundIntensity:'soft',
    overlayStrength:    20,
    textAlignment:      'center',
    contentDensity:     'information_heavy',
    footer:             'minimal',
    typographyPreset:   'premium_minimal',
    showGuides:         false,
    accentColor:        '#0a1f3c',
  },
  'premium_minimal',
  [],
  'Visa eligibility or immigration services campaign. Authoritative, minimal, trustworthy aesthetic.',
)

// ── Destination Editorial starters ────────────────────────────────────────────

export const STARTER_EDITORIAL_DESTINATION: TemplateVariant = makeStarter(
  'editorial_destination',
  'Editorial — New Destination',
  'walz_destination_editorial',
  {
    subjectPosition:    'center',
    subjectScale:       'large',
    imageCrop:          'focus_center',
    backgroundIntensity:'normal',
    overlayStrength:    30,
    textAlignment:      'center',
    contentDensity:     'minimal',
    footer:             'minimal',
    typographyPreset:   'editorial_bold',
    showGuides:         false,
    accentColor:        '#0a7eb4',
  },
  'editorial_bold',
  ['landmark_accent'],
  'Bright editorial for new destination or route announcements. Airy, minimal, aspirational.',
)

// ── Travel Collage starters ───────────────────────────────────────────────────

export const STARTER_COLLAGE_MULTI_DESTINATION: TemplateVariant = makeStarter(
  'collage_multi_destination',
  'Collage — Multi-Destination',
  'walz_travel_collage',
  {
    subjectPosition:    'right',
    subjectScale:       'large',
    imageCrop:          'cover',
    backgroundIntensity:'dramatic',
    overlayStrength:    45,
    textAlignment:      'left',
    contentDensity:     'minimal',
    footer:             'compact',
    typographyPreset:   'campaign_heavy',
    showGuides:         false,
    accentColor:        '#d4af37',
  },
  'campaign_heavy',
  ['aircraft'],
  'Multi-destination banner for brand awareness. Dark left column, rich destination collage right.',
)

// ── All starters ──────────────────────────────────────────────────────────────

export const ALL_STARTERS: TemplateVariant[] = [
  STARTER_HERO_PREMIUM_DARK,
  STARTER_HERO_LIFESTYLE,
  STARTER_HERO_PRICE_LED,
  STARTER_SEASONAL_DECEMBER,
  STARTER_SEASONAL_EID,
  STARTER_INFORMATION_WORK_PERMIT,
  STARTER_INFORMATION_VISA,
  STARTER_EDITORIAL_DESTINATION,
  STARTER_COLLAGE_MULTI_DESTINATION,
]

export const STARTERS_BY_TEMPLATE: Record<string, TemplateVariant[]> = ALL_STARTERS.reduce(
  (acc, s) => {
    if (!acc[s.baseTemplateKey]) acc[s.baseTemplateKey] = []
    acc[s.baseTemplateKey].push(s)
    return acc
  },
  {} as Record<string, TemplateVariant[]>,
)

export const STARTER_MAP: Record<string, TemplateVariant> = Object.fromEntries(
  ALL_STARTERS.map(s => [s.key, s])
)
