/**
 * Walz Orbit — Typography presets.
 *
 * Five approved preset families for campaign artwork.
 * Only these font families are permitted to keep brand consistency.
 */

export interface TypographyPreset {
  key:              string
  label:            string
  headlineFamily:   string
  headlineWeight:   '700' | '800'
  headlineTracking: number    // em units (negative = tighter)
  lineHeight:       number    // multiplier
  bodyWeight:       '400' | '600'
  labelStyle:       'uppercase' | 'normal'
  priceStyle:       'large' | 'compact'
  ctaStyle:         'bold' | 'regular'
  /** Headline size scalar — 1.0 = base template default */
  sizeScale:        number
}

export const TYPOGRAPHY_PRESETS: Record<string, TypographyPreset> = {
  editorial_bold: {
    key:              'editorial_bold',
    label:            'Editorial Bold',
    headlineFamily:   "'Helvetica Neue', Arial, sans-serif",
    headlineWeight:   '800',
    headlineTracking: -0.02,
    lineHeight:       1.10,
    bodyWeight:       '600',
    labelStyle:       'uppercase',
    priceStyle:       'large',
    ctaStyle:         'bold',
    sizeScale:        1.10,
  },

  premium_minimal: {
    key:              'premium_minimal',
    label:            'Premium Minimal',
    headlineFamily:   "'Helvetica Neue', Arial, sans-serif",
    headlineWeight:   '700',
    headlineTracking: 0.01,
    lineHeight:       1.30,
    bodyWeight:       '400',
    labelStyle:       'uppercase',
    priceStyle:       'compact',
    ctaStyle:         'regular',
    sizeScale:        0.90,
  },

  campaign_heavy: {
    key:              'campaign_heavy',
    label:            'Campaign Heavy',
    headlineFamily:   "'Helvetica Neue', Arial, sans-serif",
    headlineWeight:   '800',
    headlineTracking: -0.03,
    lineHeight:       1.15,
    bodyWeight:       '600',
    labelStyle:       'normal',
    priceStyle:       'large',
    ctaStyle:         'bold',
    sizeScale:        1.15,
  },

  information_clean: {
    key:              'information_clean',
    label:            'Information Clean',
    headlineFamily:   "'Helvetica Neue', Arial, sans-serif",
    headlineWeight:   '700',
    headlineTracking: 0.00,
    lineHeight:       1.40,
    bodyWeight:       '400',
    labelStyle:       'normal',
    priceStyle:       'compact',
    ctaStyle:         'regular',
    sizeScale:        0.85,
  },

  luxury_modern: {
    key:              'luxury_modern',
    label:            'Luxury Modern',
    headlineFamily:   "'Helvetica Neue', Arial, sans-serif",
    headlineWeight:   '800',
    headlineTracking: 0.04,
    lineHeight:       1.20,
    bodyWeight:       '600',
    labelStyle:       'uppercase',
    priceStyle:       'large',
    ctaStyle:         'bold',
    sizeScale:        1.05,
  },
}

export const ALL_TYPOGRAPHY_PRESETS = Object.values(TYPOGRAPHY_PRESETS)

export function getTypographyPreset(key: string): TypographyPreset {
  return TYPOGRAPHY_PRESETS[key] ?? TYPOGRAPHY_PRESETS['campaign_heavy']
}
