/**
 * Walz Orbit — Reference Design Analyzer.
 *
 * SERVER-SIDE ONLY. Never import from client components.
 * Uses GPT-4o Vision to extract a ReferenceDesignProfile from a poster image.
 *
 * COMMERCIAL FIREWALL:
 *   The system prompt explicitly forbids extraction of any commercial text.
 *   The returned profile describes ONLY visual structure — positions,
 *   proportions, palette, density — never prices, routes, numbers, or names.
 *
 * INVARIANT:
 *   This function NEVER asks the model to read, copy, or reproduce any text
 *   visible in the reference image. It asks only about visual geometry.
 */

import OpenAI from 'openai'
import type { ReferenceDesignProfile } from './types'

// ── System prompt ─────────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM_PROMPT = `
You are a visual layout analyst specialising in travel poster design.

HARD RULES — violation is not permitted under any circumstances:
1. Do NOT transcribe, extract, or reference any text visible in the image
2. Do NOT extract prices, currencies, phone numbers, email addresses
3. Do NOT extract route names, city names used commercially, or destination text
4. Do NOT extract company names, program names, or any branded text
5. Do NOT copy any readable text of any kind from the poster
6. Analyse ONLY visual geometry: positions (0-1 fractions), proportions, palette, layout family

You will return a single JSON object with no markdown wrapper, no explanations.
Coordinates are fractions of the canvas: 0.0 = top/left edge, 1.0 = bottom/right edge.

Schema:
{
  "layoutFamily": one of "split_horizontal"|"split_vertical"|"overlay_centered"|"overlay_bottom"|"full_bleed"|"grid"|"asymmetric",
  "backgroundMode": one of "photography"|"illustration"|"gradient"|"solid"|"pattern",
  "subjectPosition": one of "left"|"right"|"center"|"top"|"bottom"|"full",
  "subjectScale": one of "small"|"medium"|"large"|"full",
  "imageCoverage": number 0.0–1.0,
  "logoPosition": one of "top_left"|"top_center"|"top_right"|"bottom_left"|"bottom_center"|"bottom_right"|"none",
  "logoScale": one of "small"|"standard"|"prominent",
  "headline": {
    "relativeY": number 0.0–1.0 (vertical centre of headline zone),
    "alignment": one of "left"|"center"|"right",
    "width": one of "narrow"|"medium"|"wide"|"full",
    "relativeSize": one of "small"|"medium"|"large"|"display",
    "lineCount": integer 1–4,
    "accentPattern": one of "none"|"underline"|"highlight"|"color_split"|"weight_split"
  },
  "subheadline": {
    "relativeY": number 0.0–1.0,
    "alignment": one of "left"|"center"|"right",
    "relativeSize": one of "small"|"medium"|"large",
    "visible": boolean
  },
  "routeLayout": {
    "count": integer 0–4 (number of separate destination/route pills or cards visible),
    "orientation": one of "horizontal"|"vertical"|"grid",
    "cardStyle": one of "pill"|"card"|"text"|"badge",
    "relativeY": number 0.0–1.0,
    "spacing": one of "tight"|"balanced"|"loose"
  },
  "cta": {
    "relativeY": number 0.0–1.0,
    "width": one of "narrow"|"medium"|"wide"|"full",
    "prominence": one of "subtle"|"normal"|"prominent",
    "style": one of "text"|"button"|"badge"
  },
  "footer": {
    "height": one of "minimal"|"compact"|"full",
    "columns": integer 1–3,
    "style": one of "dark"|"light"|"transparent"
  },
  "palette": array of up to 5 hex color strings (e.g. "#1a3060"),
  "typographyCharacter": one of "editorial"|"bold"|"elegant"|"technical"|"playful",
  "borderRadiusStyle": one of "sharp"|"soft"|"rounded",
  "spacingDensity": one of "tight"|"balanced"|"airy",
  "decorativeDensity": one of "none"|"minimal"|"moderate"|"rich",
  "confidence": number 0.0–1.0,
  "analysisNotes": "one sentence about the structural layout — no commercial data, no text from the poster"
}
`.trim()

// ── Defaults ──────────────────────────────────────────────────────────────────

export function defaultReferenceProfile(): ReferenceDesignProfile {
  return {
    layoutFamily:        'overlay_centered',
    backgroundMode:      'photography',
    subjectPosition:     'center',
    subjectScale:        'large',
    imageCoverage:       0.75,
    logoPosition:        'top_center',
    logoScale:           'standard',
    headline: {
      relativeY:     0.35,
      alignment:     'center',
      width:         'wide',
      relativeSize:  'display',
      lineCount:     2,
      accentPattern: 'none',
    },
    subheadline: {
      relativeY:    0.52,
      alignment:    'center',
      relativeSize: 'medium',
      visible:      true,
    },
    routeLayout: {
      count:       3,
      orientation: 'horizontal',
      cardStyle:   'pill',
      relativeY:   0.63,
      spacing:     'balanced',
    },
    cta: {
      relativeY:  0.76,
      width:      'wide',
      prominence: 'prominent',
      style:      'button',
    },
    footer: {
      height:  'compact',
      columns: 2,
      style:   'dark',
    },
    palette:             ['#1a3060', '#d4af37', '#ffffff', '#0f1f40', '#f5f0e8'],
    typographyCharacter: 'bold',
    borderRadiusStyle:   'soft',
    spacingDensity:      'balanced',
    decorativeDensity:   'minimal',
    confidence:          0.5,
    analysisNotes:       'Default layout — no reference image analyzed',
  }
}

// ── Validator — ensure GPT output is a well-formed profile ────────────────────

function validateProfile(raw: unknown): ReferenceDesignProfile {
  const defaults = defaultReferenceProfile()
  if (!raw || typeof raw !== 'object') return defaults

  const r = raw as Record<string, unknown>

  const LAYOUT_FAMILIES  = ['split_horizontal', 'split_vertical', 'overlay_centered', 'overlay_bottom', 'full_bleed', 'grid', 'asymmetric'] as const
  const BG_MODES         = ['photography', 'illustration', 'gradient', 'solid', 'pattern'] as const
  const SUBJECT_POS      = ['left', 'right', 'center', 'top', 'bottom', 'full'] as const
  const SCALE_VALS       = ['small', 'medium', 'large', 'full'] as const
  const LOGO_POS_VALS    = ['top_left', 'top_center', 'top_right', 'bottom_left', 'bottom_center', 'bottom_right', 'none'] as const
  const ALIGN_VALS       = ['left', 'center', 'right'] as const
  const WIDTH_VALS       = ['narrow', 'medium', 'wide', 'full'] as const
  const SIZE_VALS        = ['small', 'medium', 'large', 'display'] as const
  const ACCENT_VALS      = ['none', 'underline', 'highlight', 'color_split', 'weight_split'] as const
  const ORIENTATION_VALS = ['horizontal', 'vertical', 'grid'] as const
  const CARD_STYLES      = ['pill', 'card', 'text', 'badge'] as const
  const SPACING_VALS        = ['tight', 'balanced', 'loose'] as const
  const SPACING_DENSITY_VALS = ['tight', 'balanced', 'airy'] as const
  const PROM_VALS        = ['subtle', 'normal', 'prominent'] as const
  const STYLE_VALS       = ['text', 'button', 'badge'] as const
  const HEIGHT_VALS      = ['minimal', 'compact', 'full'] as const
  const DARK_STYLES      = ['dark', 'light', 'transparent'] as const
  const TYPO_VALS        = ['editorial', 'bold', 'elegant', 'technical', 'playful'] as const
  const RADIUS_VALS      = ['sharp', 'soft', 'rounded'] as const
  const DENSITY_VALS     = ['none', 'minimal', 'moderate', 'rich'] as const

  function pick<T extends string>(val: unknown, allowed: readonly T[], fallback: T): T {
    return allowed.includes(val as T) ? (val as T) : fallback
  }

  function clamp01(val: unknown, fallback: number): number {
    const n = typeof val === 'number' ? val : parseFloat(String(val))
    return isNaN(n) ? fallback : Math.min(1, Math.max(0, n))
  }

  function clampInt(val: unknown, lo: number, hi: number, fallback: number): number {
    const n = typeof val === 'number' ? Math.round(val) : parseInt(String(val))
    return isNaN(n) ? fallback : Math.min(hi, Math.max(lo, n))
  }

  function pickPalette(val: unknown): string[] {
    if (!Array.isArray(val)) return defaults.palette
    return val
      .filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
      .slice(0, 5)
  }

  const hl  = (r['headline']    ?? {}) as Record<string, unknown>
  const sub = (r['subheadline'] ?? {}) as Record<string, unknown>
  const rl  = (r['routeLayout'] ?? {}) as Record<string, unknown>
  const cta = (r['cta']         ?? {}) as Record<string, unknown>
  const ftr = (r['footer']      ?? {}) as Record<string, unknown>

  return {
    layoutFamily:        pick(r['layoutFamily'],    LAYOUT_FAMILIES,  defaults.layoutFamily),
    backgroundMode:      pick(r['backgroundMode'],  BG_MODES,         defaults.backgroundMode),
    subjectPosition:     pick(r['subjectPosition'], SUBJECT_POS,      defaults.subjectPosition),
    subjectScale:        pick(r['subjectScale'],    SCALE_VALS,       defaults.subjectScale),
    imageCoverage:       clamp01(r['imageCoverage'],                  defaults.imageCoverage),
    logoPosition:        pick(r['logoPosition'],    LOGO_POS_VALS,    defaults.logoPosition),
    logoScale:           pick(r['logoScale'],       ['small', 'standard', 'prominent'] as const, defaults.logoScale),
    headline: {
      relativeY:     clamp01(hl['relativeY'],              defaults.headline.relativeY),
      alignment:     pick(hl['alignment'],   ALIGN_VALS,  defaults.headline.alignment),
      width:         pick(hl['width'],       WIDTH_VALS,  defaults.headline.width),
      relativeSize:  pick(hl['relativeSize'],SIZE_VALS,   defaults.headline.relativeSize),
      lineCount:     clampInt(hl['lineCount'], 1, 4,      defaults.headline.lineCount),
      accentPattern: pick(hl['accentPattern'], ACCENT_VALS, defaults.headline.accentPattern),
    },
    subheadline: {
      relativeY:    clamp01(sub['relativeY'],                  defaults.subheadline.relativeY),
      alignment:    pick(sub['alignment'],   ALIGN_VALS,       defaults.subheadline.alignment),
      relativeSize: pick(sub['relativeSize'],['small','medium','large'] as const, defaults.subheadline.relativeSize),
      visible:      typeof sub['visible'] === 'boolean' ? sub['visible'] : defaults.subheadline.visible,
    },
    routeLayout: {
      count:       clampInt(rl['count'],       0, 4,             defaults.routeLayout.count),
      orientation: pick(rl['orientation'],   ORIENTATION_VALS,   defaults.routeLayout.orientation),
      cardStyle:   pick(rl['cardStyle'],     CARD_STYLES,        defaults.routeLayout.cardStyle),
      relativeY:   clamp01(rl['relativeY'],                      defaults.routeLayout.relativeY),
      spacing:     pick(rl['spacing'],       SPACING_VALS,       defaults.routeLayout.spacing),
    },
    cta: {
      relativeY:  clamp01(cta['relativeY'],                    defaults.cta.relativeY),
      width:      pick(cta['width'],     WIDTH_VALS,            defaults.cta.width),
      prominence: pick(cta['prominence'],PROM_VALS,             defaults.cta.prominence),
      style:      pick(cta['style'],     STYLE_VALS,            defaults.cta.style),
    },
    footer: {
      height:  pick(ftr['height'],  HEIGHT_VALS,               defaults.footer.height),
      columns: clampInt(ftr['columns'], 1, 3,                   defaults.footer.columns),
      style:   pick(ftr['style'],   DARK_STYLES,               defaults.footer.style),
    },
    palette:             pickPalette(r['palette']),
    typographyCharacter: pick(r['typographyCharacter'], TYPO_VALS,    defaults.typographyCharacter),
    borderRadiusStyle:   pick(r['borderRadiusStyle'],   RADIUS_VALS,  defaults.borderRadiusStyle),
    spacingDensity:      pick(r['spacingDensity'],      SPACING_DENSITY_VALS, defaults.spacingDensity),
    decorativeDensity:   pick(r['decorativeDensity'],   DENSITY_VALS, defaults.decorativeDensity),
    confidence:          clamp01(r['confidence'],                     defaults.confidence),
    analysisNotes:       typeof r['analysisNotes'] === 'string'
      ? r['analysisNotes'].slice(0, 300).replace(/[<>]/g, '')
      : defaults.analysisNotes,
  }
}

// ── Main analyzer ─────────────────────────────────────────────────────────────

/**
 * Analyze a reference poster image and extract its structural layout profile.
 *
 * @param imageUrl  Public URL of the reference image (Supabase storage)
 * @returns         Validated ReferenceDesignProfile (never contains commercial data)
 */
export async function analyzeReferenceDesign(imageUrl: string): Promise<ReferenceDesignProfile> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const client = new OpenAI({ apiKey })

  const response = await client.chat.completions.create({
    model:       'gpt-4o',
    max_tokens:  1200,
    temperature: 0,
    messages: [
      {
        role:    'system',
        content: ANALYSIS_SYSTEM_PROMPT,
      },
      {
        role:    'user',
        content: [
          {
            type:      'image_url',
            image_url: { url: imageUrl, detail: 'high' },
          },
          {
            type: 'text',
            text: 'Analyze this poster\'s visual layout structure. Return ONLY the JSON object. Do not transcribe any text from the poster.',
          },
        ],
      },
    ],
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  let parsed: unknown
  try {
    // Strip potential markdown code fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    parsed = {}
  }

  return validateProfile(parsed)
}
