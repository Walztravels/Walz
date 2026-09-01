// Core composition
export { buildTemplateComposition, buildContactString, overlayAlpha } from './composition'
export type { CompositionInput }                                        from './composition'

// Quality
export { checkCompositionQuality }     from './quality-checks'
export type { QualityWarning }         from './quality-checks'

// Quality scoring (Phase 3 + Phase 4 calibration)
export { scoreComposition, scoreColor, scoreToVerdict } from './quality-score'
export type { QualityScoreResult, QualityScores } from './quality-score'

// Contact footer
export { buildContactBarLayer, buildContactBarItems }  from './contact-footer'
export type { FooterVariant }                         from './contact-footer'

// Auto-fit typography
export { autoFitText, estimateMeasure } from './auto-fit'
export type { AutoFitInput, AutoFitResult, MeasureFn } from './auto-fit'

// Layer model
export type {
  DesignLayer, DesignComposition, DesignCanvas,
  ImageLayer, TextLayer, TextSegmentsLayer, TextSegment,
  ShapeLayer, LogoLayer, ContactBarLayer, ContactBarItem,
  RouteCardLayer, PriceBlockLayer, CTAButtonLayer,
  LayerType,
} from './layer-model'
export {
  DESIGN_COMPOSITION_TAG,
  isPersistedComposition,
} from './layer-model'
export type { PersistedDesignComposition } from './layer-model'

// Design controls (Phase 3)
export {
  defaultDesignControls,
  defaultHeroSplitControls,
  defaultDestinationEditorialControls,
  defaultInformationPosterControls,
  defaultSeasonalCampaignControls,
  defaultTravelCollageControls,
  overlayAlpha as controlOverlayAlpha,
  intensityMultiplier,
} from './design-controls'
export type {
  DesignControls,
  HeroSplitControls,
  DestinationEditorialControls,
  InformationPosterControls,
  SeasonalCampaignControls,
  TravelCollageControls,
  TemplateControls,
} from './design-controls'

// Typography presets (Phase 3)
export { TYPOGRAPHY_PRESETS, ALL_TYPOGRAPHY_PRESETS, getTypographyPreset } from './typography-presets'
export type { TypographyPreset } from './typography-presets'

// Safe zones (Phase 3)
export {
  TEMPLATE_SAFE_ZONES,
  buildSafeZonePrompt,
  layerOverlapsFooter,
} from './safe-zones'
export type { SafeZone, TemplateSafeZones } from './safe-zones'

// Decorative elements (Phase 3)
export {
  DECORATIVE_ELEMENTS,
  ALL_DECORATIVE_ELEMENTS,
  getElementsByCategory,
  TEMPLATE_DECORATIVE_DEFAULTS,
} from './decorative-elements'
export type { DecorativeElementDef, DecorativeElementInstance, DecorativeCategory } from './decorative-elements'

// Design variations (Phase 3)
export {
  DESIGN_VARIATIONS,
  buildVariationPromptModifier,
  applyVariationControls,
  variationPreservesCommercialFields,
} from './design-variations'
export type { DesignVariation, VariantFocus } from './design-variations'

// One-click polish (Phase 3)
export { POLISH_ACTIONS, applyPolishAction } from './one-click-polish'
export type { PolishAction, PolishActionDef } from './one-click-polish'

// Template variants (Phase 3)
export { extractTemplateVariant, validateVariantIsCommercialFree } from './template-variants'
export type { TemplateVariant } from './template-variants'

// Decorative restraint (Phase 4)
export {
  TEMPLATE_DECORATIVE_RESTRAINTS,
  checkDecorativeRestraints,
  sanitiseDecoratives,
} from './decorative-restraint'
export type { TemplateDecorativeRestraint, DecorativeViolation } from './decorative-restraint'
