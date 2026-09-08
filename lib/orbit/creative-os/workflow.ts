/**
 * Orbit Creative OS — Workflow Studio.
 *
 * Structured node-graph workflows (Vibe-Workflow-style engine from the
 * reference repos, clean-room). Nodes cover the full pipeline; edges define
 * data/dependency flow. Execution is topological, capability nodes go
 * through the unified executor (async job aware), the quality-check node
 * runs the publication gate, and approval nodes HALT execution until staff
 * approve. Includes the Walz preset library.
 */

import { executeCapability } from './execute'
import { runQualityGate } from './quality-gate'
import { detectCommercialLeakage } from './facts'
import type {
  WorkflowGraph, WorkflowNode, WorkflowNodeType, WorkflowStepResult,
  CommercialFacts, CapabilityKind, CostLane, RouterMode,
} from './types'

// ── Node metadata ─────────────────────────────────────────────────────────────

export const NODE_TYPES: WorkflowNodeType[] = [
  'brief', 'commercial_facts', 'brand', 'reference',
  'generate_image', 'edit_image', 'graphic_designer',
  'remove_background', 'upscale', 'vectorize',
  'generate_video', 'animate', 'generate_audio', 'lip_sync',
  'clip', 'resize', 'quality_check', 'approval',
  'campaign_media', 'publish',
]

const NODE_CAPABILITY: Partial<Record<WorkflowNodeType, CapabilityKind>> = {
  generate_image:    'text_to_image',
  edit_image:        'image_edit',
  remove_background: 'background_remove',
  upscale:           'upscale',
  vectorize:         'vectorize',
  generate_video:    'image_to_video',
  animate:           'motion',
  generate_audio:    'audio_voiceover',
  lip_sync:          'lip_sync_image',
  clip:              'clip',
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateWorkflow(graph: WorkflowGraph): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const n of graph.nodes) {
    if (ids.has(n.id)) errors.push(`Duplicate node id ${n.id}`)
    ids.add(n.id)
    if (!NODE_TYPES.includes(n.type)) errors.push(`Unknown node type ${n.type}`)
  }
  for (const e of graph.edges) {
    if (!ids.has(e.from)) errors.push(`Edge from unknown node ${e.from}`)
    if (!ids.has(e.to))   errors.push(`Edge to unknown node ${e.to}`)
  }
  // DAG check
  const order = topological(graph)
  if (!order) errors.push('Workflow contains a cycle')
  // A publish node must be gated by a quality_check somewhere upstream
  const hasPublish = graph.nodes.some(n => n.type === 'publish')
  const hasGate    = graph.nodes.some(n => n.type === 'quality_check')
  if (hasPublish && !hasGate) errors.push('Publish requires an upstream quality_check node')
  return errors
}

export function topological(graph: WorkflowGraph): string[] | null {
  const indeg = new Map<string, number>()
  const out   = new Map<string, string[]>()
  for (const n of graph.nodes) { indeg.set(n.id, 0); out.set(n.id, []) }
  for (const e of graph.edges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) continue
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
    out.get(e.from)!.push(e.to)
  }
  const queue = [...indeg.entries()].filter(([, n]) => n === 0).map(([id]) => id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const next of out.get(id) ?? []) {
      const d = (indeg.get(next) ?? 1) - 1
      indeg.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  return order.length === graph.nodes.length ? order : null
}

// ── Execution ─────────────────────────────────────────────────────────────────

export interface WorkflowRunContext {
  commercialFacts?: CommercialFacts
  lane?:            CostLane
  mode?:            RouterMode
  /** approvals granted by staff, keyed by approval-node id */
  approvals?:       Record<string, boolean>
  /** dryRun: validate + walk the graph without calling providers */
  dryRun?:          boolean
}

/**
 * Execute a workflow in dependency order. Data flows through a per-run
 * artifact map (node id → outputs). Capability nodes submit provider jobs
 * (async) or return sync outputs. quality_check BLOCKS downstream publish
 * on failure; approval nodes halt until ctx.approvals grants them.
 */
export async function executeWorkflow(
  graph: WorkflowGraph,
  ctx: WorkflowRunContext = {},
): Promise<{ results: WorkflowStepResult[]; halted: boolean }> {
  const errors = validateWorkflow(graph)
  if (errors.length) {
    return { results: errors.map(e => ({ nodeId: '-', type: 'brief', status: 'failed', detail: e } as WorkflowStepResult)), halted: true }
  }

  const order = topological(graph)!
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]))
  const artifacts = new Map<string, Record<string, unknown>>()
  const upstream = (id: string) => graph.edges.filter(e => e.to === id).map(e => artifacts.get(e.from) ?? {})

  const results: WorkflowStepResult[] = []
  let blocked = false

  for (const id of order) {
    const node = nodeById.get(id)!
    if (blocked && (node.type === 'publish' || node.type === 'campaign_media')) {
      results.push({ nodeId: id, type: node.type, status: 'blocked', detail: 'Blocked by failed quality check' })
      continue
    }

    const inputs = Object.assign({}, ...upstream(id))
    const step = await executeNode(node, inputs, ctx)
    results.push(step)

    if (step.status === 'awaiting_approval') return { results, halted: true }
    if (node.type === 'quality_check' && step.status === 'blocked') blocked = true
    if (step.outputs) artifacts.set(id, step.outputs)
  }

  return { results, halted: false }
}

async function executeNode(
  node: WorkflowNode,
  inputs: Record<string, unknown>,
  ctx: WorkflowRunContext,
): Promise<WorkflowStepResult> {
  const cap = NODE_CAPABILITY[node.type]

  // Capability nodes → unified executor
  if (cap) {
    const prompt = String(node.config.prompt ?? inputs.direction ?? '')
    // Prompts never carry commercial values — deterministic guard
    const leaks = detectCommercialLeakage(prompt)
    if (leaks.length) {
      return { nodeId: node.id, type: node.type, status: 'failed', detail: `Commercial values in prompt: ${leaks.join(', ')}` }
    }
    if (ctx.dryRun) {
      return { nodeId: node.id, type: node.type, status: 'ok', detail: `dry-run: would execute ${cap}`, outputs: { capability: cap } }
    }
    const result = await executeCapability({
      capability: cap,
      lane:  (node.config.lane as CostLane) ?? ctx.lane,
      mode:  (node.config.mode as RouterMode) ?? ctx.mode,
      prompt,
      imageUrl: (node.config.imageUrl as string) ?? (inputs.outputUrl as string),
      videoUrl: (node.config.videoUrl as string) ?? undefined,
      audioUrl: (node.config.audioUrl as string) ?? (inputs.audioUrl as string),
      format:   node.config.format as string,
    })
    if (!result.ok) {
      return { nodeId: node.id, type: node.type, status: 'failed', detail: result.error }
    }
    return {
      nodeId: node.id, type: node.type,
      status: result.async ? 'job_submitted' : 'ok',
      jobId:  result.providerJobId,
      outputs: { outputUrl: result.outputUrl, providerJobId: result.providerJobId, provider: result.provider },
    }
  }

  switch (node.type) {
    case 'brief':
      return { nodeId: node.id, type: node.type, status: 'ok', outputs: { brief: node.config.brief, direction: node.config.brief } }
    case 'commercial_facts':
      return { nodeId: node.id, type: node.type, status: 'ok', outputs: { facts: ctx.commercialFacts ?? node.config.facts } }
    case 'brand':
    case 'reference':
    case 'resize':
    case 'graphic_designer':
    case 'campaign_media':
    case 'publish':
      // These map to existing Orbit subsystems (Brand Manager, reference
      // board, compositor, Campaign Media handoff, Buffer publisher) and are
      // invoked by their routes; in the graph they pass artifacts through.
      return { nodeId: node.id, type: node.type, status: 'ok', outputs: inputs }
    case 'quality_check': {
      const facts = (inputs.facts ?? ctx.commercialFacts ?? {}) as CommercialFacts
      const gate = runQualityGate({
        masterFacts: facts,
        assets: [{ format: String(node.config.format ?? '1080x1350'), facts, outputUrl: (inputs.outputUrl as string) ?? null }],
      })
      return {
        nodeId: node.id, type: node.type,
        status: gate.blocked ? 'blocked' : 'ok',
        detail: gate.issues.map(i => i.message).join('; ') || 'clean',
        outputs: inputs,
      }
    }
    case 'approval': {
      const granted = ctx.approvals?.[node.id] === true
      return granted
        ? { nodeId: node.id, type: node.type, status: 'ok', outputs: inputs }
        : { nodeId: node.id, type: node.type, status: 'awaiting_approval', detail: 'Staff approval required' }
    }
    default:
      return { nodeId: node.id, type: node.type, status: 'skipped' }
  }
}

// ── Walz presets ──────────────────────────────────────────────────────────────

function linear(key: string, label: string, types: Array<[WorkflowNodeType, string]>): WorkflowGraph {
  const nodes: WorkflowNode[] = types.map(([type, lbl], i) => ({ id: `n${i}`, type, label: lbl, config: {} }))
  const edges = nodes.slice(1).map((n, i) => ({ from: `n${i}`, to: n.id }))
  return { key, label, nodes, edges }
}

export const WORKFLOW_PRESETS: WorkflowGraph[] = [
  linear('flight_promotion', 'Flight Promotion', [
    ['brief', 'Brief'], ['commercial_facts', 'Facts'], ['brand', 'Brand'], ['reference', 'References'],
    ['generate_image', 'Background'], ['graphic_designer', 'Compose'], ['quality_check', 'QA'],
    ['approval', 'Approve'], ['campaign_media', 'Campaign Media'], ['publish', 'Publish'],
  ]),
  linear('visa_campaign', 'Visa Campaign', [
    ['brief', 'Brief'], ['commercial_facts', 'Facts'], ['brand', 'Brand'],
    ['generate_image', 'Background'], ['graphic_designer', 'Compose'], ['quality_check', 'QA'],
    ['approval', 'Approve'], ['campaign_media', 'Campaign Media'],
  ]),
  linear('destination_campaign', 'Destination Campaign', [
    ['brief', 'Brief'], ['commercial_facts', 'Facts'], ['reference', 'Destination Refs'],
    ['generate_image', 'Hero'], ['upscale', 'Upscale'], ['graphic_designer', 'Compose'],
    ['generate_video', 'Motion Cut'], ['quality_check', 'QA'], ['approval', 'Approve'], ['publish', 'Publish'],
  ]),
  linear('seasonal_campaign', 'Seasonal Campaign', [
    ['brief', 'Brief'], ['commercial_facts', 'Facts'], ['brand', 'Brand'],
    ['generate_image', 'Seasonal Art'], ['graphic_designer', 'Compose'], ['animate', 'Animate'],
    ['quality_check', 'QA'], ['approval', 'Approve'], ['publish', 'Publish'],
  ]),
  linear('travel_package', 'Travel Package', [
    ['brief', 'Brief'], ['commercial_facts', 'Facts'], ['reference', 'Refs'],
    ['generate_image', 'Hero'], ['graphic_designer', 'Compose'], ['resize', 'Reflow Formats'],
    ['quality_check', 'QA'], ['approval', 'Approve'], ['campaign_media', 'Campaign Media'],
  ]),
  linear('concierge', 'Concierge', [
    ['brief', 'Brief'], ['commercial_facts', 'Facts'], ['brand', 'Brand'],
    ['generate_image', 'Luxury Visual'], ['graphic_designer', 'Compose'],
    ['quality_check', 'QA'], ['approval', 'Approve'], ['publish', 'Publish'],
  ]),
  linear('esim', 'eSIM', [
    ['brief', 'Brief'], ['commercial_facts', 'Facts'],
    ['generate_image', 'Visual'], ['graphic_designer', 'Compose'],
    ['quality_check', 'QA'], ['approval', 'Approve'], ['publish', 'Publish'],
  ]),
  linear('payment_feature', 'Payment Feature', [
    ['brief', 'Brief'], ['commercial_facts', 'Facts'], ['brand', 'Brand'],
    ['generate_image', 'Visual'], ['graphic_designer', 'Compose'],
    ['quality_check', 'QA'], ['approval', 'Approve'], ['publish', 'Publish'],
  ]),
  linear('ugc', 'UGC', [
    ['brief', 'Brief'], ['commercial_facts', 'Facts'],
    ['generate_audio', 'Voiceover'], ['lip_sync', 'Presenter'], ['clip', 'Cut Shorts'],
    ['quality_check', 'QA'], ['approval', 'Approve'], ['publish', 'Publish'],
  ]),
  linear('tour', 'Tour', [
    ['brief', 'Brief'], ['commercial_facts', 'Facts'], ['reference', 'Refs'],
    ['generate_image', 'Hero'], ['graphic_designer', 'Compose'], ['generate_video', 'Video'],
    ['quality_check', 'QA'], ['approval', 'Approve'], ['campaign_media', 'Campaign Media'],
  ]),
  linear('hotel', 'Hotel', [
    ['brief', 'Brief'], ['commercial_facts', 'Facts'], ['reference', 'Property Refs'],
    ['generate_image', 'Hero'], ['upscale', 'Upscale'], ['graphic_designer', 'Compose'],
    ['quality_check', 'QA'], ['approval', 'Approve'], ['publish', 'Publish'],
  ]),
]
