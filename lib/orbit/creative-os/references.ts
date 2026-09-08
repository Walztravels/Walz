/**
 * Orbit Creative OS — Reference Board.
 *
 * Multiple references with EXPLICIT purposes. References are never blindly
 * mixed: each purpose feeds exactly one part of the pipeline, adapted from
 * Open-AI-Design-Agent's brand/reference threading (MIT, clean-room):
 *
 *   LAYOUT      → existing applyReferenceDesignProfile (Graphic Designer)
 *   STYLE       → visual generation prompt conditioning
 *   COLOR       → palette conditioning (prompt + accentColor)
 *   SUBJECT     → image-to-image / multi-image reference input
 *   DESTINATION → scene conditioning in the prompt
 *   BRAND       → Brand Kit (logo variants, colors) via existing Brand Manager
 *   TYPOGRAPHY  → typography-capable model preference (router hint)
 *   MOTION      → video/motion prompt conditioning only
 */

import type { ReferenceInput, ReferencePurpose, RouterMode } from './types'

export interface ReferenceConditioning {
  /** Image URLs passed as generation references (SUBJECT + STYLE only, ordered). */
  referenceImageUrls: string[]
  /** Prompt fragments contributed by STYLE / COLOR / DESTINATION refs. */
  promptFragments:    string[]
  /** Motion prompt fragments (MOTION refs — video nodes only). */
  motionFragments:    string[]
  /** LAYOUT refs to run through the existing reference-design profile. */
  layoutRefs:         ReferenceInput[]
  /** BRAND refs to hand to the Brand Manager conditioning. */
  brandRefs:          ReferenceInput[]
  /** Router hint when TYPOGRAPHY references are present. */
  routerModeHint:     RouterMode | null
}

const MAX_IMAGE_REFS = 6   // order-aware; generation models degrade beyond this

export function composeReferenceConditioning(refs: ReferenceInput[]): ReferenceConditioning {
  const byPurpose = (p: ReferencePurpose) => refs.filter(r => r.purpose === p)

  const subject = byPurpose('SUBJECT')
  const style   = byPurpose('STYLE')

  const promptFragments: string[] = []
  if (style.length)                    promptFragments.push('match the visual style of the provided style reference')
  if (byPurpose('COLOR').length)       promptFragments.push('use the color palette of the provided color reference')
  if (byPurpose('DESTINATION').length) promptFragments.push('depict the destination shown in the provided location reference')

  const motionFragments = byPurpose('MOTION').length
    ? ['follow the camera movement and pacing of the provided motion reference']
    : []

  return {
    referenceImageUrls: [...subject, ...style].slice(0, MAX_IMAGE_REFS).map(r => r.url),
    promptFragments,
    motionFragments,
    layoutRefs:     byPurpose('LAYOUT'),
    brandRefs:      byPurpose('BRAND'),
    routerModeHint: byPurpose('TYPOGRAPHY').length ? 'BEST_TYPOGRAPHY' : null,
  }
}

/** Validate a board: known purposes, no duplicate media per purpose. */
export function validateReferenceBoard(refs: ReferenceInput[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const r of refs) {
    const k = `${r.purpose}:${r.mediaId}`
    if (seen.has(k)) errors.push(`Duplicate ${r.purpose} reference ${r.mediaId}`)
    seen.add(k)
    if (!r.url?.startsWith('http')) errors.push(`Reference ${r.mediaId} has no valid URL`)
  }
  return errors
}
