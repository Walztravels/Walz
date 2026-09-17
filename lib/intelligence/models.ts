/**
 * Central model routing for the Intelligence modules (INT-9).
 *
 * Tasks select a model here instead of scattering provider ids through
 * routes. Scope is deliberately the intelligence surface only — working
 * systems elsewhere (Jade, Orbit, recruitment) keep their own pinned
 * models and are not destabilized by this indirection.
 *
 * Staff-facing UI says "Jade Intelligence"; these ids belong to code,
 * logs and diagnostics only.
 */

export const INTEL_MODELS = {
  /** Vision/document forensic analysis + structured field extraction. */
  documentAnalysis: 'claude-sonnet-4-6',
  /** Form field extraction from uploaded embassy forms. */
  formExtraction: 'claude-sonnet-4-6',
  /** Explaining deterministic cross-check findings to staff. */
  findingsSummary: 'claude-sonnet-4-6',
  /** Case-aware review simulation. */
  reviewSimulation: 'claude-sonnet-4-6',
  /** Conversation analysis + structured event extraction. */
  conversationAnalysis: 'claude-sonnet-4-6',
  /** Cheap summarization of detected embassy-source diffs. */
  changeSummary: 'claude-haiku-4-5-20251001',
} as const

export type IntelTask = keyof typeof INTEL_MODELS
export const modelFor = (task: IntelTask): string => INTEL_MODELS[task]
