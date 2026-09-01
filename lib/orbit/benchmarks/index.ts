/**
 * Walz Orbit — Production benchmark definitions.
 *
 * Each benchmark is a calibration reference for a specific template.
 * Reviewers compare Orbit output against the expected design profile
 * and record a publishability verdict.
 *
 * Commercial values (prices, routes, salaries) are NEVER stored here.
 * sampleFieldStructure contains only label descriptions and placeholder hints.
 */

import type { DesignControls } from '../composer/design-controls'

// ── Publishability verdict ─────────────────────────────────────────────────────

export type PublishabilityVerdict =
  | 'PUBLISHABLE'
  | 'NEEDS_MINOR_EDIT'
  | 'NEEDS_MAJOR_EDIT'
  | 'REJECT'

export interface VerdictDescriptor {
  verdict:   PublishabilityVerdict
  label:     string
  color:     string   // tailwind text class
  bg:        string   // tailwind bg class
  border:    string   // tailwind border class
  hint:      string
}

export const VERDICT_DESCRIPTORS: VerdictDescriptor[] = [
  {
    verdict: 'PUBLISHABLE',
    label:   'Publishable',
    color:   'text-green-400',
    bg:      'bg-green-950',
    border:  'border-green-800',
    hint:    'Ready to publish with no edits required.',
  },
  {
    verdict: 'NEEDS_MINOR_EDIT',
    label:   'Needs Minor Edit',
    color:   'text-yellow-400',
    bg:      'bg-yellow-950',
    border:  'border-yellow-800',
    hint:    'Almost there — small text, spacing or contrast tweak required.',
  },
  {
    verdict: 'NEEDS_MAJOR_EDIT',
    label:   'Needs Major Edit',
    color:   'text-orange-400',
    bg:      'bg-orange-950',
    border:  'border-orange-800',
    hint:    'Fundamental layout or readability issue. Regenerate or redesign.',
  },
  {
    verdict: 'REJECT',
    label:   'Reject',
    color:   'text-red-400',
    bg:      'bg-red-950',
    border:  'border-red-800',
    hint:    'Fails basic quality bar. Do not publish under any circumstances.',
  },
]

export function getVerdictDescriptor(v: PublishabilityVerdict): VerdictDescriptor {
  return VERDICT_DESCRIPTORS.find(d => d.verdict === v) ?? VERDICT_DESCRIPTORS[3]
}

// ── Review issue markers ───────────────────────────────────────────────────────

export type ReviewIssueType =
  | 'headline_too_small'
  | 'headline_unreadable'
  | 'subject_too_small'
  | 'subject_cropped_badly'
  | 'subject_overlaps_text'
  | 'cta_not_visible'
  | 'overlay_too_weak'
  | 'overlay_too_strong'
  | 'footer_cluttered'
  | 'footer_missing'
  | 'wrong_palette'
  | 'too_much_decoration'
  | 'not_enough_contrast'
  | 'text_hierarchy_flat'
  | 'composition_unbalanced'
  | 'feels_amateur'

export interface ReviewIssueDescriptor {
  key:         ReviewIssueType
  label:       string
  category:    'typography' | 'subject' | 'layout' | 'colour' | 'overall'
  remediation: string
}

export const REVIEW_ISSUE_DESCRIPTORS: ReviewIssueDescriptor[] = [
  { key: 'headline_too_small',     label: 'Headline too small',       category: 'typography', remediation: 'Increase headline fontSize or use campaign_heavy preset.' },
  { key: 'headline_unreadable',    label: 'Headline unreadable',      category: 'typography', remediation: 'Increase overlay strength or choose a higher-contrast font colour.' },
  { key: 'subject_too_small',      label: 'Subject too small',        category: 'subject',    remediation: 'Set subjectScale to "large" in controls.' },
  { key: 'subject_cropped_badly',  label: 'Subject cropped awkwardly',category: 'subject',    remediation: 'Use imageCrop focus_top or focus_center. Regenerate image.' },
  { key: 'subject_overlaps_text',  label: 'Subject overlaps headline',category: 'subject',    remediation: 'Switch to focus_right placement or reduce subject scale.' },
  { key: 'cta_not_visible',        label: 'CTA not visible',          category: 'layout',     remediation: 'Increase CTA contrast. Ensure CTA layer is not hidden.' },
  { key: 'overlay_too_weak',       label: 'Overlay too weak',         category: 'colour',     remediation: 'Increase overlayStrength to 50+.' },
  { key: 'overlay_too_strong',     label: 'Overlay too strong',       category: 'colour',     remediation: 'Reduce overlayStrength — image is being lost.' },
  { key: 'footer_cluttered',       label: 'Footer too cluttered',     category: 'layout',     remediation: 'Switch footer to "compact" mode.' },
  { key: 'footer_missing',         label: 'Footer missing',           category: 'layout',     remediation: 'Ensure footer is set to at least "minimal".' },
  { key: 'wrong_palette',          label: 'Wrong colour palette',     category: 'colour',     remediation: 'Check template background and accent colour selection.' },
  { key: 'too_much_decoration',    label: 'Too many decoratives',     category: 'layout',     remediation: 'Remove decorative elements until max 1–2 remain.' },
  { key: 'not_enough_contrast',    label: 'Insufficient contrast',    category: 'colour',     remediation: 'Increase overlay or darken background intensity.' },
  { key: 'text_hierarchy_flat',    label: 'Text hierarchy is flat',   category: 'typography', remediation: 'Increase headline/body size ratio. Use editorial_bold preset.' },
  { key: 'composition_unbalanced', label: 'Composition unbalanced',   category: 'layout',     remediation: 'Adjust subject position. Apply "improve_spacing" polish action.' },
  { key: 'feels_amateur',          label: 'Feels unprofessional',     category: 'overall',    remediation: 'Apply "make_more_premium" polish, increase overlay, reduce clutter.' },
]

// ── Benchmark definition ───────────────────────────────────────────────────────

export interface BenchmarkSampleField {
  label:       string
  example:     string    // descriptive placeholder — NOT a real commercial value
  required:    boolean
}

export interface BenchmarkExpectedVisual {
  palette:           string
  mood:              string
  subjectPlacement:  'left' | 'right' | 'center' | 'fill' | 'background'
  subjectScale:      'small' | 'medium' | 'large'
  subjectFocus:      string   // e.g. "face and upper body, looking left"
  headroom:          boolean  // should there be headroom above subject?
}

export interface BenchmarkExpectedLayout {
  contentDensity:    'minimal' | 'balanced' | 'information_heavy'
  footer:            'full' | 'compact' | 'minimal'
  overlayStrength:   number    // recommended 0–100
  typographyPreset:  string
  priceVisible:      boolean
  routeVisible:      boolean
}

export interface BenchmarkDefinition {
  key:          string
  label:        string
  description:  string
  templateKey:  string
  canvas:       string

  // Control starting point for this benchmark
  recommendedControls: Partial<DesignControls>

  // Visual style profile
  expectedVisual:  BenchmarkExpectedVisual

  // Layout profile
  expectedLayout:  BenchmarkExpectedLayout

  // Example field structure — descriptive only, no real commercial values
  sampleFields:    BenchmarkSampleField[]

  // Decorative guidance
  expectedDecoratives:  string[]   // element keys
  decorativeNotes:      string

  // Subject placement notes for AI image generation
  subjectPlacementNotes: string

  // Reviewer guidance
  reviewerNotes:         string
  minimumPublishableScore: number

  // Reference visual prompt seed — used to generate a reference AI image for comparison
  referencePromptSeed: string
}

// ── BENCHMARK A: Walz Hero Split — Crypto Payment ─────────────────────────────

export const BENCHMARK_HERO_CRYPTO: BenchmarkDefinition = {
  key:         'benchmark_hero_crypto',
  label:       'Hero Split — Crypto Payment',
  description: 'Premium dark navy campaign for crypto/fintech payment features. Bold left headline, confident traveller subject right.',
  templateKey: 'walz_hero_split',
  canvas:      '1080x1350',

  recommendedControls: {
    subjectPosition:    'right',
    subjectScale:       'large',
    imageCrop:          'focus_center',
    backgroundIntensity:'dramatic',
    overlayStrength:    55,
    textAlignment:      'left',
    contentDensity:     'balanced',
    footer:             'full',
    typographyPreset:   'campaign_heavy',
    accentColor:        '#d4af37',
  },

  expectedVisual: {
    palette:          'premium_dark_navy_cyan',
    mood:             'premium commercial, tech-forward, confident, aspirational',
    subjectPlacement: 'right',
    subjectScale:     'large',
    subjectFocus:     'confident traveller or professional, upper body visible, facing left (toward headline)',
    headroom:         true,
  },

  expectedLayout: {
    contentDensity:  'balanced',
    footer:          'full',
    overlayStrength: 55,
    typographyPreset:'campaign_heavy',
    priceVisible:    false,
    routeVisible:    false,
  },

  sampleFields: [
    { label: 'Headline',    example: 'Campaign theme (e.g. payment feature headline)',   required: true },
    { label: 'Subheadline', example: 'Secondary message (e.g. supported currencies)',    required: false },
    { label: 'Route',       example: 'Featured route label (e.g. departure → destination)', required: false },
    { label: 'CTA',         example: 'Action verb phrase (e.g. "Book Now")',              required: true },
    { label: 'Contact',     example: 'Phone / social handle',                            required: false },
  ],

  expectedDecoratives: ['aircraft'],
  decorativeNotes:
    'One aircraft silhouette maximum, positioned upper right, small scale (0.12–0.18), high opacity. ' +
    'No crypto_coin or financial symbols — keep it aspirational, not transactional.',

  subjectPlacementNotes:
    'Right half of frame. Face should be in upper 55% of image. ' +
    'Clear headroom (5–10% above face). ' +
    'Body visible from head to at least hip level. ' +
    'Left 50% must be dark enough for white headline text. ' +
    'Subject should NOT overlap left half of frame.',

  reviewerNotes:
    'Key pass criteria: (1) Headline is readable in 2 seconds. (2) Subject is clearly a confident traveller/professional. ' +
    '(3) The navy/cyan palette reads premium. (4) CTA button is clearly visible. ' +
    '(5) Footer contact details are present and legible.',

  minimumPublishableScore: 78,

  referencePromptSeed:
    'Confident professional traveller or business person, upper body, looking slightly left toward camera. ' +
    'Premium cinematic lighting. Deep navy blues and teals. Slight vignette. ' +
    'Subject on right half of frame. Left half dark navy for headline text. ' +
    'Commercial travel advertising quality. Aspirational, sophisticated.',
}

// ── BENCHMARK B: Walz Seasonal — December Flights Home ───────────────────────

export const BENCHMARK_SEASONAL_DECEMBER: BenchmarkDefinition = {
  key:         'benchmark_seasonal_december',
  label:       'Seasonal — December Flights Home',
  description: 'Warm emotional campaign for December holiday travel. Centred emotional headline, urgency subheadline.',
  templateKey: 'walz_seasonal_campaign',
  canvas:      '1080x1350',

  recommendedControls: {
    subjectPosition:    'center',
    subjectScale:       'large',
    imageCrop:          'focus_center',
    backgroundIntensity:'dramatic',
    overlayStrength:    60,
    textAlignment:      'center',
    contentDensity:     'balanced',
    footer:             'full',
    typographyPreset:   'editorial_bold',
    accentColor:        '#ffd580',
  },

  expectedVisual: {
    palette:          'warm_amber_gold',
    mood:             'emotional, festive, homecoming, family reunion, warm and joyful',
    subjectPlacement: 'fill',
    subjectScale:     'large',
    subjectFocus:     'family reunion or homecoming scene: airport arrivals, family embrace, joyful travellers',
    headroom:         false,
  },

  expectedLayout: {
    contentDensity:  'balanced',
    footer:          'full',
    overlayStrength: 60,
    typographyPreset:'editorial_bold',
    priceVisible:    false,
    routeVisible:    true,
  },

  sampleFields: [
    { label: 'Headline',          example: 'Emotional seasonal theme (e.g. homecoming message)', required: true },
    { label: 'Subheadline / Urgency', example: 'Urgency or emotional hook',                    required: false },
    { label: 'Route',             example: 'Route label (e.g. departure cities)',               required: false },
    { label: 'CTA',               example: 'Action phrase (e.g. "Book Now")',                   required: true },
    { label: 'Urgency / Terms',   example: 'Limited seats note or booking deadline',            required: false },
  ],

  expectedDecoratives: ['seasonal_lights'],
  decorativeNotes:
    'Seasonal_lights is acceptable at top corners, very small (scale 0.08–0.12), 60% opacity. ' +
    'Christmas_ornaments if Xmas-specific only. ' +
    'Maximum 1 decorative element. ' +
    'No aircraft for seasonal campaigns — the emotion is the hero.',

  subjectPlacementNotes:
    'Image fills entire canvas. Subject (family/travellers) should be centre frame. ' +
    'Upper 20% and lower 20% must be slightly darker for logo and CTA/footer legibility. ' +
    'Warm amber/gold tones throughout. Slight soft focus on background. ' +
    'Emotional peak moment: arrival gate, embrace, festive setting.',

  reviewerNotes:
    'Key pass criteria: (1) Emotional headline reads immediately — text must be white and clear. ' +
    '(2) Warm palette is unmistakably festive. (3) Urgency subheadline adds energy. ' +
    '(4) CTA button is visible against warm background. ' +
    '(5) The image feels genuinely emotional — not generic stock photography.',

  minimumPublishableScore: 76,

  referencePromptSeed:
    'Warm, emotionally resonant airport arrivals scene: family embrace, joyful homecoming. ' +
    'Rich amber, gold, and candlelit tones. Soft focus background depth. ' +
    'Upper and lower portions slightly darker for text legibility. ' +
    'Cinematic quality. Emotional, festive, homecoming travel photograph.',
}

// ── BENCHMARK C: Walz Information — Work Permit ───────────────────────────────

export const BENCHMARK_INFORMATION_WORK_PERMIT: BenchmarkDefinition = {
  key:         'benchmark_information_work_permit',
  label:       'Information Poster — Work Permit',
  description: 'Clean document-style information poster for immigration/visa campaigns. Dense but scannable hierarchy.',
  templateKey: 'walz_information_poster',
  canvas:      '1080x1350',

  recommendedControls: {
    subjectPosition:    'center',
    subjectScale:       'small',
    imageCrop:          'contain',
    backgroundIntensity:'soft',
    overlayStrength:    25,
    textAlignment:      'center',
    contentDensity:     'information_heavy',
    footer:             'compact',
    typographyPreset:   'information_clean',
    accentColor:        '#0a7eb4',
  },

  expectedVisual: {
    palette:          'clean_navy_white',
    mood:             'professional, trustworthy, official, government-adjacent, authoritative',
    subjectPlacement: 'background',
    subjectScale:     'small',
    subjectFocus:     'subtle professional background: skyline, official building, or desaturated cityscape',
    headroom:         false,
  },

  expectedLayout: {
    contentDensity:  'information_heavy',
    footer:          'compact',
    overlayStrength: 25,
    typographyPreset:'information_clean',
    priceVisible:    false,
    routeVisible:    false,
  },

  sampleFields: [
    { label: 'Headline',          example: 'Country + programme name (e.g. work permit type)', required: true },
    { label: 'Key Information',   example: 'Main benefit/service description (multi-line)',     required: true },
    { label: 'CTA',               example: '"Apply Now" or "Get Started"',                      required: false },
    { label: 'Small Print',       example: 'Eligibility note or disclaimer',                    required: false },
    { label: 'Contact',           example: 'Phone number and social handle',                    required: false },
  ],

  expectedDecoratives: [],
  decorativeNotes:
    'Zero decorative elements. The information_poster template demands a clean, document-like aesthetic. ' +
    'Any decorative elements undermine credibility for official/immigration content.',

  subjectPlacementNotes:
    'Very subtle background: highly desaturated landscape, professional building exterior, or pure gradient. ' +
    'The image must NOT compete with information hierarchy. ' +
    'Soft, light background preferred. If no image is available, the template should still work. ' +
    'Never use lifestyle imagery for this template.',

  reviewerNotes:
    'Key pass criteria: (1) Information hierarchy is immediately scannable — headline → key info → CTA. ' +
    '(2) The design feels official and trustworthy, not flashy. ' +
    '(3) White space is used effectively — not overcrowded. ' +
    '(4) The template works even without a background image (text-first layout). ' +
    '(5) Contact details are clear and easy to act on.',

  minimumPublishableScore: 72,

  referencePromptSeed:
    'Professional document aesthetic. Clean, desaturated background: modern city skyline or civic architecture. ' +
    'Very low contrast, airy, light tones. ' +
    'Authoritative and trustworthy — no lifestyle, no crowds, no action. ' +
    'The background should feel like a formal document header, not a travel advertisement.',
}

// ── All benchmarks ─────────────────────────────────────────────────────────────

export const ALL_BENCHMARKS: BenchmarkDefinition[] = [
  BENCHMARK_HERO_CRYPTO,
  BENCHMARK_SEASONAL_DECEMBER,
  BENCHMARK_INFORMATION_WORK_PERMIT,
]

export const BENCHMARK_MAP: Record<string, BenchmarkDefinition> = Object.fromEntries(
  ALL_BENCHMARKS.map(b => [b.key, b])
)

// ── Review record (persisted by staff) ────────────────────────────────────────

export interface BenchmarkReviewRecord {
  benchmarkKey:  string
  campaignId?:   string
  verdict:       PublishabilityVerdict
  issues:        ReviewIssueType[]
  notes:         string
  qualityScore?: number
  reviewedBy:    string
  reviewedAt:    string   // ISO date string
}
