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

/**
 * Minimum readable font size (pt at the 1080px baseline) for small print.
 * Below this, terms/contact text becomes unreadable on a phone screen.
 */
export const MIN_READABLE_FONT_PT = 13

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

  // Footer readability: terms / contact below the minimum readable size
  // will be illegible on phones — warn before export.
  for (const layer of layers) {
    if (!layer.visible) continue
    if ((layer.id === 'terms' || layer.id === 'contact' || layer.type === 'contact_bar')
        && 'fontSize' in layer && typeof layer.fontSize === 'number'
        && layer.fontSize < MIN_READABLE_FONT_PT) {
      warnings.push({
        field:    layer.id,
        message:  `${layer.id === 'contact_bar' ? 'Contact bar' : layer.id === 'terms' ? 'Terms' : 'Contact'} text is ${layer.fontSize}pt — below the ${MIN_READABLE_FONT_PT}pt readable minimum for phones.`,
        blocking: false,
      })
    }
  }

  return warnings
}
