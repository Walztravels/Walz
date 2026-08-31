/**
 * Stable hash-based experiment assignment utility.
 *
 * SAFE FOR: UX variant assignments only (e.g. UI copy, layout, feature order).
 * NEVER USE FOR: security decisions, payment logic, ownership checks, or any
 * context where a wrong assignment causes financial or privacy harm.
 *
 * Assignments are deterministic — the same userId + experimentId always
 * produces the same result. Math.random() is never used.
 *
 * When EXPERIMENT_ENABLED !== 'true' (the default), assignVariant always
 * returns variants[0] (the control) so all users see the baseline until
 * experiments are deliberately activated.
 */

/**
 * Produce a stable 32-bit unsigned integer for a string using a simple
 * polynomial rolling hash (djb2-style with Math.imul for overflow safety).
 * Pure function — no side effects, no I/O.
 */
function hashString(s: string): number {
  let h = 0
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) >>> 0
  return h
}

/**
 * Assign a user to one of the provided variants for the given experiment.
 *
 * The assignment is:
 *  - Deterministic: same userId + experimentId → same variant every call.
 *  - Stable across sessions, deploys, and server restarts.
 *  - Uniform: users are spread evenly across variants.
 *
 * When EXPERIMENT_ENABLED !== 'true', always returns variants[0] (control).
 *
 * @param userId       Stable user identifier (e.g. Prisma User.id).
 * @param experimentId Short, unique experiment slug (e.g. "cta-color-v1").
 * @param variants     Non-empty array of variant names. variants[0] is control.
 * @returns The assigned variant name — always a member of the variants array.
 */
export function assignVariant(
  userId: string,
  experimentId: string,
  variants: string[],
): string {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error('assignVariant: variants must be a non-empty array')
  }
  // Control gate — experiments are off by default.
  if (process.env.EXPERIMENT_ENABLED !== 'true') {
    return variants[0]
  }
  const h = hashString(userId + ':' + experimentId)
  return variants[h % variants.length]
}

/**
 * Determine whether a user is in the experiment's active rollout population.
 *
 * The result is:
 *  - Deterministic: same userId + experimentId + rolloutPercent → same boolean.
 *  - Monotonic: a user in a 10% rollout is also in any ≥10% rollout for the
 *    same experiment (bucket boundaries shift consistently).
 *
 * When EXPERIMENT_ENABLED !== 'true', always returns false.
 *
 * @param userId         Stable user identifier.
 * @param experimentId   Experiment slug.
 * @param rolloutPercent Integer 0–100. 0 → nobody; 100 → everybody.
 * @returns true if the user falls within the rollout bucket.
 */
export function isInExperiment(
  userId: string,
  experimentId: string,
  rolloutPercent: number,
): boolean {
  if (process.env.EXPERIMENT_ENABLED !== 'true') {
    return false
  }
  const h = hashString(userId + ':' + experimentId)
  return (h % 100) < rolloutPercent
}
