/**
 * Walz Orbit Composer — design quality checks.
 *
 * Pure functions — no JSX, safe to import in tests.
 */

import type { DesignComposition } from './layer-model'

export interface QualityWarning {
  field:    string
  message:  string
  blocking: boolean
}

export function checkCompositionQuality(composition: DesignComposition): QualityWarning[] {
  const warnings: QualityWarning[] = []
  const fields = composition.commercialFields ?? {}
  const layers = composition.layers

  const hasLogo = layers.some(l => l.id === 'logo' && l.visible)
  if (!hasLogo) warnings.push({ field: 'logo', message: 'Logo layer is hidden.', blocking: false })

  if (!fields['headline']) warnings.push({ field: 'headline', message: 'Headline is empty.', blocking: true })
  if (!fields['cta'])      warnings.push({ field: 'cta',      message: 'CTA is empty.',      blocking: false })

  if (!composition.visualAssetId) {
    warnings.push({ field: 'visual', message: 'No background visual selected.', blocking: false })
  }

  return warnings
}
