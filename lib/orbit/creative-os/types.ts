/**
 * Orbit Creative OS — shared types.
 *
 * Architectural reference (clean-room adaptation, both MIT):
 *   https://github.com/anil-matcha/open-generative-ai   (model registry, dual
 *     local/cloud lanes, async job polling, studio organization)
 *   https://github.com/Anil-matcha/Open-AI-Design-Agent (planner → router →
 *     dependency-ordered execution, brand/reference conditioning, node workflows)
 *
 * No upstream source is copied; patterns are re-implemented against Walz
 * Orbit's existing architecture (OrbitMedia, deterministic compositor,
 * Commercial Fact Lock, FAL/GPT-Image/Replicate adapters, Buffer publishing).
 */

// ── Capabilities ──────────────────────────────────────────────────────────────

export type CapabilityKind =
  | 'text_to_image'
  | 'image_edit'          // inpaint / restyle / natural-language edit
  | 'image_to_image'
  | 'text_to_video'
  | 'image_to_video'
  | 'motion'              // animate a still (motion presets)
  | 'upscale'
  | 'background_remove'
  | 'vectorize'           // raster → SVG
  | 'audio_voiceover'
  | 'audio_narration'
  | 'audio_music'
  | 'audio_sfx'
  | 'lip_sync_image'      // image + audio → talking presenter
  | 'lip_sync_video'      // video + audio → lip-synced presenter
  | 'clip'                // long video → shorts/reels with transcript

export const ALL_CAPABILITIES: CapabilityKind[] = [
  'text_to_image', 'image_edit', 'image_to_image', 'text_to_video',
  'image_to_video', 'motion', 'upscale', 'background_remove', 'vectorize',
  'audio_voiceover', 'audio_narration', 'audio_music', 'audio_sfx',
  'lip_sync_image', 'lip_sync_video', 'clip',
]

// ── Cost lanes & router modes ─────────────────────────────────────────────────

export type CostLane = 'LOCAL' | 'STANDARD' | 'PREMIUM' | 'AUTO'

export type RouterMode =
  | 'AUTO' | 'BEST_VALUE' | 'BEST_QUALITY' | 'BEST_TYPOGRAPHY'
  | 'CINEMATIC' | 'FAST' | 'LOCAL_ONLY'

export type ProviderId = 'local' | 'fal' | 'openai' | 'replicate'

export interface ModelEntry {
  /** Stable internal key — staff never see raw provider model IDs. */
  key:         string
  provider:    ProviderId
  capability:  CapabilityKind
  lane:        Exclude<CostLane, 'AUTO'>
  /** Provider-side endpoint or model id (server-side only). */
  endpoint:    string
  label:       string
  /** USD, authoritative where the provider publishes pricing; null = unknown. */
  costUsd:     number | null
  /** 0–100 relative quality within capability. */
  quality:     number
  latency:     'fast' | 'medium' | 'slow'
  /** Strengths used by specialised router modes. */
  tags:        Array<'typography' | 'cinematic' | 'photoreal' | 'vector' | 'fast'>
  /** Env var that gates this entry (feature flag / credential presence). */
  requires:    string[]
  async:       boolean
}

export interface RouteDecision {
  entry:      ModelEntry
  lane:       Exclude<CostLane, 'AUTO'>
  /** Ordered failover chain (excluding the chosen entry). */
  failover:   ModelEntry[]
  reason:     string
}

// ── References ────────────────────────────────────────────────────────────────

export type ReferencePurpose =
  | 'LAYOUT' | 'STYLE' | 'COLOR' | 'SUBJECT'
  | 'DESTINATION' | 'BRAND' | 'TYPOGRAPHY' | 'MOTION'

export const REFERENCE_PURPOSES: ReferencePurpose[] = [
  'LAYOUT', 'STYLE', 'COLOR', 'SUBJECT', 'DESTINATION', 'BRAND', 'TYPOGRAPHY', 'MOTION',
]

export interface ReferenceInput {
  mediaId:  string
  url:      string
  purpose:  ReferencePurpose
  note?:    string
}

// ── Commercial facts (deterministic — AI can never author these) ──────────────

export interface CommercialFacts {
  headline?:    string
  subheadline?: string
  price?:       string
  currency?:    string
  route?:       string
  date?:        string
  deposit?:     string
  cta?:         string
  terms?:       string
  contact?:     string
  [key: string]: string | undefined
}

/** Fields the AI may NEVER author — always sourced from staff/Walz data. */
export const AI_MUST_NOT_AUTHOR = [
  'price', 'route', 'date', 'deposit', 'salary', 'visa outcome',
  'processing time', 'booking confirmation', 'supplier confirmation',
  'discount', 'contact',
] as const

// ── Creative plan ─────────────────────────────────────────────────────────────

export type DeliverableFormat =
  | '1080x1350' | '1080x1080' | '1080x1920' | '1200x628'
  | 'video_16x9' | 'video_9x16' | 'whatsapp' | 'print_a3'

export interface PlanDeliverable {
  id:            string
  format:        DeliverableFormat
  kind:          'static' | 'video' | 'audio' | 'document'
  title:         string
  direction:     string           // creative direction (non-commercial)
  templateKey?:  string           // Graphic Designer template for statics
  capability?:   CapabilityKind
  dependsOn:     string[]         // deliverable ids (dependency planning)
  references:    ReferencePurpose[]
  needsMotion:   boolean
  needsAudio:    boolean
  lane:          CostLane
  estCostUsd:    number | null
}

export interface CreativePlan {
  id:            string
  campaignId:    string | null
  brief:         string
  creativeDirection: string
  commercialFacts: CommercialFacts
  deliverables:  PlanDeliverable[]
  routerMode:    RouterMode
  approved:      boolean
  approvedBy?:   string | null
  createdAt:     string
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export type CreativeJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface CreativeJobRecord {
  id:            string
  campaignId:    string | null
  capability:    CapabilityKind
  lane:          string
  provider:      string
  modelKey:      string
  status:        CreativeJobStatus
  providerJobId: string | null
  inputRefs:     ReferenceInput[]
  outputMediaId: string | null
  outputUrl:     string | null
  costUsd:       number | null
  error:         string | null
  retryCount:    number
  staffEmail:    string | null
  createdAt:     string
}

// ── Workflow graph ────────────────────────────────────────────────────────────

export type WorkflowNodeType =
  | 'brief' | 'commercial_facts' | 'brand' | 'reference'
  | 'generate_image' | 'edit_image' | 'graphic_designer'
  | 'remove_background' | 'upscale' | 'vectorize'
  | 'generate_video' | 'animate' | 'generate_audio' | 'lip_sync'
  | 'clip' | 'resize' | 'quality_check' | 'approval'
  | 'campaign_media' | 'publish'

export interface WorkflowNode {
  id:      string
  type:    WorkflowNodeType
  label:   string
  config:  Record<string, unknown>
}

export interface WorkflowEdge { from: string; to: string }

export interface WorkflowGraph {
  key:    string
  label:  string
  nodes:  WorkflowNode[]
  edges:  WorkflowEdge[]
}

export interface WorkflowStepResult {
  nodeId:   string
  type:     WorkflowNodeType
  status:   'ok' | 'blocked' | 'failed' | 'skipped' | 'awaiting_approval' | 'job_submitted'
  detail?:  string
  jobId?:   string
  outputs?: Record<string, unknown>
}

// ── Quality gate ──────────────────────────────────────────────────────────────

export interface QualityGateIssue {
  code:     string
  message:  string
  blocking: boolean
}

export interface QualityGateResult {
  passed:   boolean
  blocked:  boolean
  issues:   QualityGateIssue[]
}
