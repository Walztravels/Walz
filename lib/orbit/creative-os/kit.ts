/**
 * Orbit Creative OS — Campaign Kit generation.
 *
 * One approved CreativePlan → responsive format reflow across the full
 * format set. Statics reuse the EXISTING deterministic compositor
 * (buildTemplateComposition) per canvas, so commercial facts are rendered
 * identically on every variant by construction; videos/audio become
 * capability job specs executed in dependency order.
 */

import { buildTemplateComposition } from '@/lib/orbit/composer/composition'
import { TEMPLATE_MAP, ALL_TEMPLATES } from '@/lib/orbit/templates'
import { TEMPLATE_CANVASES } from '@/lib/orbit/templates/schema'
import type { DesignComposition } from '@/lib/orbit/composer/layer-model'
import type { CreativePlan, PlanDeliverable, CommercialFacts } from './types'

export interface KitStaticItem {
  deliverableId: string
  format:        string
  composition:   DesignComposition
  facts:         CommercialFacts
}

export interface KitJobItem {
  deliverableId: string
  format:        string
  capability:    NonNullable<PlanDeliverable['capability']>
  dependsOn:     string[]
  direction:     string
}

export interface CampaignKit {
  planId:  string
  statics: KitStaticItem[]
  jobs:    KitJobItem[]
  /** Deliverable ids in executable dependency order. */
  order:   string[]
}

/** Map Creative OS formats to compositor canvases (whatsapp/print reuse squares/portrait). */
const FORMAT_TO_CANVAS: Record<string, string> = {
  '1080x1350': '1080x1350', '1080x1080': '1080x1080', '1080x1920': '1080x1920',
  '1200x628': '1200x628', whatsapp: '1080x1080', print_a3: '1080x1350',
}

/** Topological order over plan deliverables (dependency planning). */
export function dependencyOrder(deliverables: PlanDeliverable[]): string[] | { error: string } {
  const ids = new Set(deliverables.map(d => d.id))
  const indeg = new Map<string, number>()
  const out   = new Map<string, string[]>()
  for (const d of deliverables) {
    indeg.set(d.id, 0)
    out.set(d.id, [])
  }
  for (const d of deliverables) {
    for (const dep of d.dependsOn) {
      if (!ids.has(dep)) return { error: `Deliverable ${d.id} depends on unknown ${dep}` }
      indeg.set(d.id, (indeg.get(d.id) ?? 0) + 1)
      out.get(dep)!.push(d.id)
    }
  }
  const queue = [...indeg.entries()].filter(([, n]) => n === 0).map(([id]) => id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const next of out.get(id) ?? []) {
      const n = (indeg.get(next) ?? 1) - 1
      indeg.set(next, n)
      if (n === 0) queue.push(next)
    }
  }
  if (order.length !== deliverables.length) return { error: 'Deliverable dependency cycle detected' }
  return order
}

export function buildCampaignKit(plan: CreativePlan, opts?: {
  visualAsset?: { url: string; id?: string }
}): CampaignKit | { error: string } {
  if (!plan.approved) return { error: 'Plan is not approved — staff approval is required before generation.' }

  const order = dependencyOrder(plan.deliverables)
  if (!Array.isArray(order)) return order

  const statics: KitStaticItem[] = []
  const jobs:    KitJobItem[]    = []

  for (const d of plan.deliverables) {
    if (d.kind === 'static') {
      const canvasKey = FORMAT_TO_CANVAS[d.format]
      const canvas    = canvasKey ? TEMPLATE_CANVASES[canvasKey] : undefined
      const template  = (d.templateKey && TEMPLATE_MAP[d.templateKey]) || ALL_TEMPLATES[0]
      if (!canvas) return { error: `No canvas for format ${d.format}` }
      // The SAME commercialFacts object renders every static — identical facts
      // across variants by construction, then re-asserted by the quality gate.
      const composition = buildTemplateComposition({
        template,
        commercialFields: plan.commercialFacts as Record<string, string>,
        visualAsset:      opts?.visualAsset,
        canvas,
      })
      statics.push({ deliverableId: d.id, format: d.format, composition, facts: plan.commercialFacts })
    } else if (d.capability) {
      jobs.push({
        deliverableId: d.id, format: d.format, capability: d.capability,
        dependsOn: d.dependsOn, direction: d.direction,
      })
    }
  }

  return { planId: plan.id, statics, jobs, order }
}
