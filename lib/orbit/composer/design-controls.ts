/**
 * Walz Orbit — Designer Controls.
 *
 * Structured control state that drives composition adjustments.
 * These are layout/visual preferences — never commercial values.
 */

// ── Global designer controls ──────────────────────────────────────────────────

export interface DesignControls {
  subjectPosition:     'left' | 'center' | 'right'
  subjectScale:        'small' | 'medium' | 'large'
  imageCrop:           'cover' | 'contain' | 'focus_top' | 'focus_center' | 'focus_bottom'
  backgroundIntensity: 'soft' | 'normal' | 'dramatic'
  overlayStrength:     number   // 0–100
  textAlignment:       'left' | 'center' | 'right'
  contentDensity:      'minimal' | 'balanced' | 'information_heavy'
  footer:              'full' | 'compact' | 'minimal'
  typographyPreset:    string   // key into TYPOGRAPHY_PRESETS
  showGuides:          boolean
  accentColor:         string   // hex — default '#d4af37'
}

export function defaultDesignControls(): DesignControls {
  return {
    subjectPosition:     'center',
    subjectScale:        'medium',
    imageCrop:           'cover',
    backgroundIntensity: 'normal',
    overlayStrength:     55,
    textAlignment:       'center',
    contentDensity:      'balanced',
    footer:              'compact',
    typographyPreset:    'campaign_heavy',
    showGuides:          false,
    accentColor:         '#d4af37',
  }
}

// ── Template-specific controls ────────────────────────────────────────────────

export interface HeroSplitControls {
  subjectSide:     'left' | 'right'
  headlineWidth:   'narrow' | 'medium' | 'wide'
  accentPhrase:    string
  featureChips:    boolean
  worldMapTexture: boolean
}

export interface DestinationEditorialControls {
  roundedFrame:    boolean
  floatingLabels:  boolean
  borderRadius:    number      // 0–40 px
  variation:       'light' | 'dark'
}

export interface InformationPosterControls {
  infoCardCount:     number    // 1–6
  pricingRows:       boolean
  salaryBlock:       boolean
  requirementsBlock: boolean
  positionBlock:     boolean
  layout:            'compact' | 'full'
}

export interface SeasonalCampaignControls {
  routeCardCount:  number     // 1–4
  decorativeMode:  'festive' | 'minimal' | 'vibrant'
  familyEmphasis:  boolean
  ctaBannerStyle:  'pill' | 'bar' | 'minimal'
}

export interface TravelCollageControls {
  collageDensity:        'sparse' | 'medium' | 'dense'
  travellerProminence:   'low' | 'medium' | 'high'
  landmarkProminence:    'low' | 'medium' | 'high'
  showAircraft:          boolean
}

export type TemplateControls =
  | HeroSplitControls
  | DestinationEditorialControls
  | InformationPosterControls
  | SeasonalCampaignControls
  | TravelCollageControls

export function defaultHeroSplitControls(): HeroSplitControls {
  return { subjectSide: 'right', headlineWidth: 'medium', accentPhrase: '', featureChips: false, worldMapTexture: false }
}

export function defaultDestinationEditorialControls(): DestinationEditorialControls {
  return { roundedFrame: false, floatingLabels: false, borderRadius: 12, variation: 'dark' }
}

export function defaultInformationPosterControls(): InformationPosterControls {
  return { infoCardCount: 3, pricingRows: false, salaryBlock: false, requirementsBlock: true, positionBlock: true, layout: 'full' }
}

export function defaultSeasonalCampaignControls(): SeasonalCampaignControls {
  return { routeCardCount: 3, decorativeMode: 'vibrant', familyEmphasis: false, ctaBannerStyle: 'pill' }
}

export function defaultTravelCollageControls(): TravelCollageControls {
  return { collageDensity: 'medium', travellerProminence: 'high', landmarkProminence: 'medium', showAircraft: false }
}

// ── Overlay strength → gradient stops ────────────────────────────────────────

export function overlayAlpha(strength: number): number {
  // Maps 0–100 to 0.05–0.85
  return 0.05 + (strength / 100) * 0.80
}

export function intensityMultiplier(intensity: 'soft' | 'normal' | 'dramatic'): number {
  return intensity === 'soft' ? 0.65 : intensity === 'dramatic' ? 1.35 : 1.0
}
