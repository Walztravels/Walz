/**
 * Walz Orbit Visual Prompt Builder.
 *
 * Converts a CreativeBrief + WalzTemplate into a complete, detailed
 * image generation prompt for gpt-image-2 / DALL-E.
 *
 * INVARIANT: The prompt NEVER contains commercial values (prices, routes,
 * salaries, legal terms). It describes ONLY visual/photographic direction.
 *
 * The "no text" suffix is appended here AND by buildCreativePrompt() in
 * creative-presets.ts (which wraps this for the main generation flow).
 * When called directly, the suffix is always included.
 */

import type { CreativeBrief, WalzTemplate } from './templates/schema'

const NO_TEXT_SUFFIX =
  'No text, no words, no lettering, no typography, no watermarks, no signs with readable text.'

/**
 * Build a full image generation prompt from a structured brief and template.
 */
export function buildVisualPrompt(
  brief:    CreativeBrief,
  template: WalzTemplate,
  options?: {
    brandPreset?: string
    skipNoTextSuffix?: boolean
  },
): string {
  const parts: string[] = []

  // 1. Art direction from the template
  parts.push(template.artDirection.promptGuidance)

  // 2. Visual mood
  if (brief.visualMood) {
    parts.push(`Visual mood: ${brief.visualMood}.`)
  }

  // 3. Subject
  if (brief.subject) {
    parts.push(`Primary subject: ${brief.subject}.`)
  }

  // 4. Environment
  if (brief.environment) {
    parts.push(`Environment: ${brief.environment}.`)
  }

  // 5. Lighting
  if (brief.lighting) {
    parts.push(`Lighting: ${brief.lighting}.`)
  }

  // 6. Composition
  if (brief.composition) {
    parts.push(`Composition: ${brief.composition}.`)
  }

  // 7. Decorative elements (visual only)
  if (brief.decorativeElements?.length > 0) {
    parts.push(`Visual details: ${brief.decorativeElements.join(', ')}.`)
  }

  // 8. Safe area guidance from template
  if (template.artDirection.safeAreas) {
    parts.push(`Safe areas: ${template.artDirection.safeAreas}`)
  }

  // 9. Brand preset if provided (add mood from the preset name)
  if (options?.brandPreset) {
    parts.push(`Brand aesthetic style: ${humaniseBrandPreset(options.brandPreset)}.`)
  }

  // 10. Commercial guard
  parts.push(
    'IMPORTANT: Do NOT include any numbers, prices, currency symbols, routes, ' +
    'text labels, signs with readable words, or any commercial information in the image.',
  )

  // 11. No-text suffix (always last)
  if (!options?.skipNoTextSuffix) {
    parts.push(NO_TEXT_SUFFIX)
  }

  return parts.filter(Boolean).join(' ')
}

/**
 * Build a minimal prompt when no brief is available —
 * falls back to the template art direction and safe area guidance alone.
 */
export function buildFallbackVisualPrompt(template: WalzTemplate): string {
  return [
    template.artDirection.promptGuidance,
    template.artDirection.safeAreas ? `Safe areas: ${template.artDirection.safeAreas}` : '',
    'Do NOT include any text, numbers, prices, routes, or readable words in the image.',
    NO_TEXT_SUFFIX,
  ]
    .filter(Boolean)
    .join(' ')
}

function humaniseBrandPreset(key: string): string {
  return key.replace(/_/g, ' ')
}
