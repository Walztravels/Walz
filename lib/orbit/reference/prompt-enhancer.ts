/**
 * Walz Orbit — Reference-aware visual prompt enhancer.
 *
 * Adds composition guidance to the AI visual generation prompt
 * based on a ReferenceDesignProfile.
 *
 * INVARIANT:
 *   Output describes ONLY photographic composition — subject placement,
 *   frame distribution, negative space, lighting character.
 *   NEVER includes commercial values, brand names, text to render,
 *   or any content that violates the Orbit commercial firewall.
 *
 * Pure function — no AI, no network, no JSX.
 */

import type { ReferenceDesignProfile } from './types'

const SUBJECT_POSITION_GUIDANCE: Record<ReferenceDesignProfile['subjectPosition'], string> = {
  left:   'positioned on the left 40–55% of the frame, with clear negative space on the right for text',
  right:  'positioned on the right 40–55% of the frame, with clear negative space on the left for text',
  center: 'centered in the frame with strong vertical composition and clear negative space above and below',
  top:    'positioned in the upper half of the frame, leaving space in the lower portion',
  bottom: 'positioned in the lower half of the frame, leaving space in the upper portion',
  full:   'filling the full frame as a rich atmospheric backdrop',
}

const FOOTER_CLEARANCE: Record<ReferenceDesignProfile['footer']['height'], number> = {
  minimal: 6,
  compact: 12,
  full:    20,
}

/**
 * Build composition hints from a reference profile for insertion into the
 * visual generation prompt.
 *
 * @param profile   Structural reference profile (no commercial data)
 * @returns         Composition guidance string ready to append to buildVisualPrompt()
 */
export function buildReferenceCompositionHints(profile: ReferenceDesignProfile): string {
  const parts: string[] = []

  // Subject placement
  const posGuidance = SUBJECT_POSITION_GUIDANCE[profile.subjectPosition]
  parts.push(`Subject: ${posGuidance}.`)

  // Subject scale
  if (profile.subjectScale === 'large' || profile.subjectScale === 'full') {
    parts.push('Subject fills a prominent portion of the frame and draws immediate attention.')
  } else if (profile.subjectScale === 'small') {
    parts.push('Subject is a supporting element within a wider environmental scene.')
  }

  // Negative space guidance from image coverage
  const textSpacePercent = Math.round((1 - profile.imageCoverage) * 100)
  if (textSpacePercent >= 25) {
    const side = profile.subjectPosition === 'left' ? 'right'
               : profile.subjectPosition === 'right' ? 'left'
               : 'centre'
    parts.push(
      `Reserve approximately ${textSpacePercent}% of the frame as low-detail, ` +
      `dark or out-of-focus area on the ${side} to allow text overlay.`
    )
  }

  // Footer clearance
  const clearance = FOOTER_CLEARANCE[profile.footer.height]
  if (clearance > 6) {
    parts.push(`Keep the bottom ${clearance}% of the frame clear — it will be covered by a contact footer.`)
  }

  // Background mode influence
  if (profile.backgroundMode === 'gradient') {
    parts.push('Painterly or gradient treatment — smooth tonal transitions.')
  } else if (profile.backgroundMode === 'pattern') {
    parts.push('Clean background with subtle geometric or textural patterning.')
  }

  // Headline zone clearance — avoid placing distracting elements near headline
  const hlY = profile.headline.relativeY
  if (hlY < 0.4) {
    parts.push('Keep the upper third of the frame relatively uncluttered — headline text will overlay this zone.')
  } else if (hlY > 0.6) {
    parts.push('Keep the lower-middle area of the frame clean — headline text will overlay this region.')
  }

  // Typography character influence on atmosphere
  const atmoHints: Partial<Record<ReferenceDesignProfile['typographyCharacter'], string>> = {
    bold:       'Bold, high-contrast atmosphere.',
    editorial:  'Clean, journalistic — sharp lines, minimal distraction.',
    elegant:    'Luxury tone — refined, premium, low-key.',
    playful:    'Dynamic energy, vivid scene.',
    technical:  'Precise, structured — crisp environment.',
  }
  const atmo = atmoHints[profile.typographyCharacter]
  if (atmo) parts.push(atmo)

  // Hard invariant — always last
  parts.push('No text, no logos, no lettering, no typography, no watermarks, no signs with readable text.')

  return parts.join(' ')
}
