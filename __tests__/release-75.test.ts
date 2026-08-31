/**
 * @jest-environment node
 *
 * Release 7.5 — Jade Funnel Visibility & Experiment Infrastructure
 *
 * Tests (source-level — no DB/network calls):
 *  1.  assignVariant is deterministic (same userId+experimentId → same variant)
 *  2.  assignVariant always returns a value from the variants array
 *  3.  assignVariant distributes across all variants (not stuck on one)
 *  4.  isInExperiment rollout 0% → always false
 *  5.  isInExperiment rollout 100% → always true
 *  6.  isInExperiment is stable (same input → same boolean across calls)
 *  7.  EXPERIMENT_ENABLED=false → assignVariant returns variants[0] (control)
 *  8.  EXPERIMENT_ENABLED=false → isInExperiment returns false
 *  9.  FUNNEL_STEPS source contains 'jade_checkout_converted' (regression)
 * 10.  FUNNEL_STEPS source contains 'jade_trip_build_started' (regression)
 * 11.  FUNNEL_STEPS source contains 'jade_proposal_requested' (regression)
 * 12.  TrackOptions source contains experimentId optional field
 * 13.  TrackOptions source contains variantId optional field
 * 14.  experimentId/variantId land in metadata, not as top-level CommercialEvent fields
 * 15.  assignVariant throws on empty variants array
 */

import fs   from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

const revenueSrc = readSource('app/api/admin/revenue/route.ts')
const trackSrc   = readSource('lib/commercial/track.ts')

// ---------------------------------------------------------------------------
// Helper — load experiment module with a specific EXPERIMENT_ENABLED value
// ---------------------------------------------------------------------------
function loadExperiment(enabled: string) {
  // Reset module registry so the env gate re-evaluates.
  jest.resetModules()
  process.env.EXPERIMENT_ENABLED = enabled
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../lib/automation/experiment') as typeof import('../lib/automation/experiment')
}

// ---------------------------------------------------------------------------
// 1. assignVariant is deterministic
// ---------------------------------------------------------------------------
test('assignVariant returns the same variant every call for the same userId+experimentId', () => {
  const exp = loadExperiment('true')
  const variants = ['control', 'variant_a', 'variant_b']
  const userId = 'user-abc-123'
  const experimentId = 'cta-color-v1'

  const first  = exp.assignVariant(userId, experimentId, variants)
  const second = exp.assignVariant(userId, experimentId, variants)
  const third  = exp.assignVariant(userId, experimentId, variants)

  expect(first).toBe(second)
  expect(second).toBe(third)
})

// ---------------------------------------------------------------------------
// 2. assignVariant always returns a value that is in the variants array
// ---------------------------------------------------------------------------
test('assignVariant always returns a value from the variants array', () => {
  const exp = loadExperiment('true')
  const variants = ['control', 'variant_a', 'variant_b']

  for (let i = 0; i < 50; i++) {
    const result = exp.assignVariant(`user-${i}`, 'test-exp', variants)
    expect(variants).toContain(result)
  }
})

// ---------------------------------------------------------------------------
// 3. assignVariant distributes across all variants (not stuck on one)
// ---------------------------------------------------------------------------
test('assignVariant produces more than one distinct variant across a population', () => {
  const exp = loadExperiment('true')
  const variants = ['control', 'variant_a', 'variant_b']
  const seen = new Set<string>()

  for (let i = 0; i < 100; i++) {
    seen.add(exp.assignVariant(`user-${i}`, 'distribution-test', variants))
  }

  // With 100 users and 3 variants the hash should hit at least 2 buckets.
  expect(seen.size).toBeGreaterThan(1)
})

// ---------------------------------------------------------------------------
// 4. isInExperiment rollout 0% → always false
// ---------------------------------------------------------------------------
test('isInExperiment with rolloutPercent=0 returns false for all users', () => {
  const exp = loadExperiment('true')

  for (let i = 0; i < 50; i++) {
    expect(exp.isInExperiment(`user-${i}`, 'rollout-test', 0)).toBe(false)
  }
})

// ---------------------------------------------------------------------------
// 5. isInExperiment rollout 100% → always true
// ---------------------------------------------------------------------------
test('isInExperiment with rolloutPercent=100 returns true for all users', () => {
  const exp = loadExperiment('true')

  for (let i = 0; i < 50; i++) {
    expect(exp.isInExperiment(`user-${i}`, 'rollout-test', 100)).toBe(true)
  }
})

// ---------------------------------------------------------------------------
// 6. isInExperiment is stable (same input → same boolean across calls)
// ---------------------------------------------------------------------------
test('isInExperiment returns the same result on repeated calls with identical inputs', () => {
  const exp = loadExperiment('true')
  const userId = 'stable-user-xyz'
  const experimentId = 'stability-check'

  const a = exp.isInExperiment(userId, experimentId, 50)
  const b = exp.isInExperiment(userId, experimentId, 50)
  const c = exp.isInExperiment(userId, experimentId, 50)

  expect(a).toBe(b)
  expect(b).toBe(c)
})

// ---------------------------------------------------------------------------
// 7. EXPERIMENT_ENABLED=false → assignVariant returns variants[0] (control)
// ---------------------------------------------------------------------------
test('assignVariant returns variants[0] when EXPERIMENT_ENABLED is not "true"', () => {
  const exp = loadExperiment('false')
  const variants = ['control', 'variant_a', 'variant_b']

  for (let i = 0; i < 20; i++) {
    expect(exp.assignVariant(`user-${i}`, 'gated-exp', variants)).toBe('control')
  }
})

// ---------------------------------------------------------------------------
// 8. EXPERIMENT_ENABLED=false → isInExperiment returns false
// ---------------------------------------------------------------------------
test('isInExperiment returns false when EXPERIMENT_ENABLED is not "true"', () => {
  const exp = loadExperiment('false')

  for (let i = 0; i < 20; i++) {
    expect(exp.isInExperiment(`user-${i}`, 'gated-exp', 100)).toBe(false)
  }
})

// ---------------------------------------------------------------------------
// 9. FUNNEL_STEPS contains jade_checkout_converted (regression)
// ---------------------------------------------------------------------------
test("revenue route source contains 'jade_checkout_converted' in FUNNEL_STEPS block", () => {
  expect(revenueSrc).toContain('jade_checkout_converted')
})

// ---------------------------------------------------------------------------
// 10. FUNNEL_STEPS contains jade_trip_build_started (regression)
// ---------------------------------------------------------------------------
test("revenue route source contains 'jade_trip_build_started' in FUNNEL_STEPS block", () => {
  expect(revenueSrc).toContain('jade_trip_build_started')
})

// ---------------------------------------------------------------------------
// 11. FUNNEL_STEPS contains jade_proposal_requested (regression)
// ---------------------------------------------------------------------------
test("revenue route source contains 'jade_proposal_requested' in FUNNEL_STEPS block", () => {
  expect(revenueSrc).toContain('jade_proposal_requested')
})

// ---------------------------------------------------------------------------
// 12. TrackOptions declares experimentId as an optional field
// ---------------------------------------------------------------------------
test('TrackOptions in track.ts declares experimentId as an optional field', () => {
  // Matches "experimentId?" or "experimentId ?" with optional whitespace
  expect(trackSrc).toMatch(/experimentId\s*\?/)
})

// ---------------------------------------------------------------------------
// 13. TrackOptions declares variantId as an optional field
// ---------------------------------------------------------------------------
test('TrackOptions in track.ts declares variantId as an optional field', () => {
  expect(trackSrc).toMatch(/variantId\s*\?/)
})

// ---------------------------------------------------------------------------
// 14. experimentId/variantId land in metadata, NOT as top-level columns
// ---------------------------------------------------------------------------
test('experimentId and variantId are stored in metadata, not as top-level CommercialEvent fields', () => {
  // They should appear inside the metadata-building logic, not as direct prisma fields.
  // Confirm there is no 'experimentId:' or 'variantId:' key directly in the returned object
  // of buildData (i.e., not at the same level as 'id', 'event', 'sessionId' etc.).
  // We check that the source merges them into 'experimentMeta' (the metadata object).
  expect(trackSrc).toContain('experimentMeta.experimentId')
  expect(trackSrc).toContain('experimentMeta.variantId')

  // Confirm they are NOT returned as top-level columns next to 'event:' in buildData.
  // A top-level column would look like: `    experimentId: opts.experimentId,`
  // Check the buildData return block does not directly expose them as columns.
  const buildDataBlock = trackSrc.slice(
    trackSrc.indexOf('function buildData'),
    trackSrc.indexOf('function buildData') + 1500,
  )
  // The return statement should not have a direct `experimentId:` or `variantId:` key.
  expect(buildDataBlock).not.toMatch(/^\s+experimentId:\s+opts\.experimentId/m)
  expect(buildDataBlock).not.toMatch(/^\s+variantId:\s+opts\.variantId/m)
})

// ---------------------------------------------------------------------------
// 15. assignVariant throws on empty variants array
// ---------------------------------------------------------------------------
test('assignVariant throws when variants array is empty', () => {
  const exp = loadExperiment('true')
  expect(() => exp.assignVariant('user-1', 'test-exp', [])).toThrow()
})
