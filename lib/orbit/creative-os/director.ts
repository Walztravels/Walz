/**
 * Orbit Creative OS — Creative Director agent.
 *
 * Brief → editable CreativePlan (planner stage of the Open-AI-Design-Agent
 * loop, clean-room). The LLM proposes deliverables and creative direction;
 * everything commercial and everything executable is validated and priced
 * DETERMINISTICALLY server-side:
 *   - commercial facts come only from staff input (never the model)
 *   - formats are constrained to the known deliverable set
 *   - lanes/costs come from the model registry, not the LLM
 *   - staff must approve the plan before any generation runs
 */

import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { estimateCost } from './registry'
import { detectCommercialLeakage } from './facts'
import type {
  CreativePlan, PlanDeliverable, CommercialFacts, DeliverableFormat,
  RouterMode, CostLane, CapabilityKind, ReferencePurpose,
} from './types'

const VALID_FORMATS: DeliverableFormat[] = [
  '1080x1350', '1080x1080', '1080x1920', '1200x628',
  'video_16x9', 'video_9x16', 'whatsapp', 'print_a3',
]

const FORMAT_CAPABILITY: Record<DeliverableFormat, CapabilityKind | undefined> = {
  '1080x1350': 'text_to_image', '1080x1080': 'text_to_image',
  '1080x1920': 'text_to_image', '1200x628': 'text_to_image',
  video_16x9: 'image_to_video', video_9x16: 'image_to_video',
  whatsapp: 'text_to_image', print_a3: 'text_to_image',
}

const SYSTEM_PROMPT = `You are the Creative Director for Walz Travels' Orbit Creative OS.
Given a campaign brief, plan the deliverable kit.

HARD RULES:
- You NEVER author commercial values (prices, routes, dates, deposits, contact
  details, discounts, visa outcomes). Direction fields describe ONLY visual and
  narrative creative approach.
- Formats must come from this exact list: 1080x1350, 1080x1080, 1080x1920,
  1200x628, video_16x9, video_9x16, whatsapp, print_a3.
- Reference purposes must come from: LAYOUT, STYLE, COLOR, SUBJECT, DESTINATION,
  BRAND, TYPOGRAPHY, MOTION.
- Videos should depend on a static image deliverable (image-to-video pipeline).

Return ONLY a JSON object:
{
  "creativeDirection": "<2-3 sentence overall direction, no commercial values>",
  "deliverables": [
    {
      "format": "<one of the allowed formats>",
      "kind": "static" | "video",
      "title": "<short name>",
      "direction": "<visual direction for this piece, no commercial values>",
      "templateKey": "<walz_hero_split|walz_seasonal_campaign|walz_information_poster|walz_destination_editorial|walz_travel_collage|null>",
      "dependsOnIndex": <index of deliverable this depends on, or null>,
      "references": ["STYLE", ...],
      "needsMotion": boolean,
      "needsAudio": boolean
    }
  ]
}`

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function buildCreativePlan(opts: {
  brief:           string
  commercialFacts: CommercialFacts
  campaignId?:     string | null
  routerMode?:     RouterMode
  defaultLane?:    CostLane
}): Promise<CreativePlan> {
  const routerMode = opts.routerMode ?? 'AUTO'
  const lane: CostLane = opts.defaultLane ?? 'AUTO'

  let creativeDirection = 'Clean, premium Walz Travels campaign kit.'
  let rawDeliverables: Array<{
    format?: string; kind?: string; title?: string; direction?: string
    templateKey?: string | null; dependsOnIndex?: number | null
    references?: string[]; needsMotion?: boolean; needsAudio?: boolean
  }> = []

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: `Campaign brief:\n${opts.brief}\n\nPlan the kit.` }],
    })
    const text = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { creativeDirection?: string; deliverables?: typeof rawDeliverables }
      if (typeof parsed.creativeDirection === 'string' && detectCommercialLeakage(parsed.creativeDirection).length === 0) {
        creativeDirection = parsed.creativeDirection
      }
      rawDeliverables = Array.isArray(parsed.deliverables) ? parsed.deliverables : []
    }
  } catch (e) {
    console.error('[creative-director] LLM planning failed, using default kit:', e)
  }

  // Fallback default kit when the model returns nothing usable
  if (rawDeliverables.length === 0) {
    rawDeliverables = [
      { format: '1080x1350', kind: 'static', title: 'Instagram Feed', direction: creativeDirection, templateKey: 'walz_hero_split', references: ['STYLE', 'BRAND'] },
      { format: '1080x1080', kind: 'static', title: 'Square',         direction: creativeDirection, templateKey: 'walz_hero_split', references: ['STYLE', 'BRAND'] },
      { format: '1080x1920', kind: 'static', title: 'Story',          direction: creativeDirection, templateKey: 'walz_hero_split', references: ['STYLE', 'BRAND'] },
      { format: '1200x628',  kind: 'static', title: 'Facebook Ad',    direction: creativeDirection, templateKey: 'walz_hero_split', references: ['STYLE', 'BRAND'] },
      { format: 'video_9x16', kind: 'video', title: 'Reel',           direction: creativeDirection, dependsOnIndex: 2, references: ['MOTION'], needsMotion: true },
    ]
  }

  // Deterministic validation + enrichment — the LLM's structure is a proposal,
  // the server decides what is executable and what it costs.
  const VALID_PURPOSES: ReferencePurpose[] = ['LAYOUT', 'STYLE', 'COLOR', 'SUBJECT', 'DESTINATION', 'BRAND', 'TYPOGRAPHY', 'MOTION']
  const ids: string[] = rawDeliverables.map(() => randomUUID().slice(0, 8))

  const deliverables: PlanDeliverable[] = rawDeliverables
    .filter(d => VALID_FORMATS.includes(d.format as DeliverableFormat))
    .map((d, i) => {
      const format = d.format as DeliverableFormat
      const kind: PlanDeliverable['kind'] = d.kind === 'video' ? 'video' : 'static'
      const capability = kind === 'video' ? 'image_to_video' : FORMAT_CAPABILITY[format]
      const cleanDirection = detectCommercialLeakage(d.direction ?? '').length === 0
        ? (d.direction ?? creativeDirection) : creativeDirection
      const dependsOn = typeof d.dependsOnIndex === 'number' && ids[d.dependsOnIndex] && d.dependsOnIndex !== i
        ? [ids[d.dependsOnIndex]] : []
      return {
        id:          ids[i],
        format, kind,
        title:       (d.title ?? format).slice(0, 60),
        direction:   cleanDirection,
        templateKey: d.templateKey ?? undefined,
        capability,
        dependsOn,
        references:  (d.references ?? []).filter((r): r is ReferencePurpose => VALID_PURPOSES.includes(r as ReferencePurpose)),
        needsMotion: !!d.needsMotion || kind === 'video',
        needsAudio:  !!d.needsAudio,
        lane,
        estCostUsd:  capability ? estimateCost(capability, lane) : null,
      }
    })

  return {
    id:               randomUUID(),
    campaignId:       opts.campaignId ?? null,
    brief:            opts.brief,
    creativeDirection,
    commercialFacts:  opts.commercialFacts,   // staff-authored, verbatim — never the model's
    deliverables,
    routerMode,
    approved:         false,                  // staff approval gates all generation
    createdAt:        new Date().toISOString(),
  }
}
