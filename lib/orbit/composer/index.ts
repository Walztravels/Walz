export { buildTemplateComposition, buildContactString } from './composition'
export { checkCompositionQuality }                     from './quality-checks'
export type { QualityWarning }                         from './quality-checks'
export { buildContactBarLayer, buildContactBarItems }  from './contact-footer'
export type { FooterVariant }                         from './contact-footer'
export { autoFitText, estimateMeasure }               from './auto-fit'
export type {
  DesignLayer, DesignComposition, DesignCanvas,
  ImageLayer, TextLayer, TextSegmentsLayer, TextSegment,
  ShapeLayer, LogoLayer, ContactBarLayer, ContactBarItem,
  RouteCardLayer, PriceBlockLayer, CTAButtonLayer,
  LayerType,
} from './layer-model'
export type { AutoFitInput, AutoFitResult, MeasureFn } from './auto-fit'
export type { CompositionInput } from './composition'
export {
  DESIGN_COMPOSITION_TAG,
  isPersistedComposition,
} from './layer-model'
export type { PersistedDesignComposition } from './layer-model'
