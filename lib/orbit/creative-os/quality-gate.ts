/**
 * Orbit Creative OS — publication Quality Gate.
 *
 * Runs before Campaign Media handoff / Buffer publishing. Aggregates the
 * existing deterministic checks (compositor bounds, quality score) with
 * kit-level checks. COMMERCIAL MISMATCHES ALWAYS BLOCK.
 */

import { detectLayerOverflow } from '@/lib/orbit/composer/bounds'
import { scoreComposition } from '@/lib/orbit/composer/quality-score'
import { assertFactsConsistent, officialContactFacts } from './facts'
import type { DesignComposition, LogoLayer, ContactBarLayer } from '@/lib/orbit/composer/layer-model'
import type { CommercialFacts, QualityGateIssue, QualityGateResult, DeliverableFormat } from './types'

export const FORMAT_DIMENSIONS: Record<string, { w: number; h: number } | null> = {
  '1080x1350': { w: 1080, h: 1350 },
  '1080x1080': { w: 1080, h: 1080 },
  '1080x1920': { w: 1080, h: 1920 },
  '1200x628':  { w: 1200, h: 628 },
  video_16x9:  { w: 1920, h: 1080 },
  video_9x16:  { w: 1080, h: 1920 },
  whatsapp:    { w: 1080, h: 1080 },
  print_a3:    { w: 3508, h: 4961 },
}

export interface GateAsset {
  format:       DeliverableFormat | string
  facts:        CommercialFacts
  composition?: DesignComposition
  outputUrl?:   string | null
  width?:       number | null
  height?:      number | null
  providerError?: string | null
}

export function runQualityGate(opts: {
  masterFacts: CommercialFacts
  assets:      GateAsset[]
}): QualityGateResult {
  const issues: QualityGateIssue[] = []
  const official = officialContactFacts()

  // Commercial fact consistency — ALWAYS blocking
  const mismatches = assertFactsConsistent(opts.masterFacts, opts.assets)
  for (const m of mismatches) {
    issues.push({
      code: 'COMMERCIAL_FACT_MISMATCH', blocking: true,
      message: `Asset ${m.assetIndex + 1}: "${m.field}" differs — expected "${m.expected}", got "${m.actual || '(missing)'}"`,
    })
  }

  opts.assets.forEach((asset, i) => {
    const label = `Asset ${i + 1} (${asset.format})`

    // Provider errors
    if (asset.providerError) {
      issues.push({ code: 'PROVIDER_ERROR', blocking: true, message: `${label}: provider error — ${asset.providerError}` })
    }

    // Broken asset
    if (asset.outputUrl != null && !/^https?:\/\//.test(asset.outputUrl)) {
      issues.push({ code: 'BROKEN_ASSET', blocking: true, message: `${label}: output URL is not a valid asset URL` })
    }

    // Format dimensions
    const expected = FORMAT_DIMENSIONS[asset.format]
    if (expected && asset.width && asset.height) {
      const ratioOk = Math.abs(asset.width / asset.height - expected.w / expected.h) < 0.02
      if (!ratioOk) {
        issues.push({ code: 'FORMAT_DIMENSIONS', blocking: true, message: `${label}: ${asset.width}x${asset.height} does not match ${asset.format}` })
      }
    }

    // Composition checks (statics through the deterministic compositor)
    if (asset.composition) {
      const overflow = detectLayerOverflow(asset.composition)
      for (const w of overflow.filter(o => o.critical)) {
        issues.push({ code: w.code, blocking: true, message: `${label}: ${w.message}` })
      }

      const score = scoreComposition(asset.composition, asset.composition.controls)
      if (score.total < 60) {
        issues.push({ code: 'QUALITY_SCORE_LOW', blocking: true, message: `${label}: quality score ${score.total}/100 — below the publishable floor` })
      }
      // CTA readability + contrast come from the composition score warnings
      for (const w of score.warnings.filter(w => w.blocking)) {
        issues.push({ code: `COMPOSITION_${w.field.toUpperCase()}`, blocking: true, message: `${label}: ${w.message}` })
      }

      // Logo presence
      const logo = asset.composition.layers.find(l => l.id === 'logo') as LogoLayer | undefined
      if (!logo?.visible || !logo.logoUrl) {
        issues.push({ code: 'LOGO_MISSING', blocking: false, message: `${label}: brand logo absent (upload in Orbit → Brand)` })
      }

      // Contact correctness — the highlighted contact must be the official one
      const contact = asset.composition.layers.find(l => l.type === 'contact_bar') as ContactBarLayer | undefined
      if (contact?.visible) {
        const highlighted = contact.items?.find(it => it.highlight)?.text ?? ''
        if (highlighted && highlighted !== official.globalWhatsapp) {
          issues.push({ code: 'CONTACT_INCORRECT', blocking: true, message: `${label}: highlighted contact "${highlighted}" is not the official ${official.globalWhatsapp}` })
        }
      }
    }
  })

  const blocked = issues.some(i => i.blocking)
  return { passed: !blocked, blocked, issues }
}
