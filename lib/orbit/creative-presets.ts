// Orbit Creative Studio — brand presets and format presets.
// Presets affect prompt composition only. They never invent prices or commercial claims.

export interface BrandPreset {
  label: string
  promptSuffix: string
  colourNote: string
}

export const BRAND_PRESETS: Record<string, BrandPreset> = {
  premium_travel: {
    label:        'Premium Travel',
    promptSuffix: 'luxury travel aesthetic, sophisticated lighting, premium atmosphere, elegant warm tones',
    colourNote:   'deep navy, champagne gold',
  },
  december_flights_home: {
    label:        'December Flights Home',
    promptSuffix: 'festive homecoming, warm arrivals hall, Christmas season travel, family reunion energy',
    colourNote:   'warm amber, deep red accents',
  },
  luxury_escape: {
    label:        'Luxury Escape',
    promptSuffix: 'resort lifestyle, infinity pool, turquoise water, sun-drenched, five-star opulence',
    colourNote:   'turquoise, white, gold',
  },
  visa_campaign: {
    label:        'Visa Campaign',
    promptSuffix: 'professional travel document feel, clean modern government-adjacent aesthetic, trustworthy',
    colourNote:   'clean white, official blue',
  },
  family_holiday: {
    label:        'Family Holiday',
    promptSuffix: 'family travel scene, joyful, bright sunny destination, children at beach or landmark',
    colourNote:   'bright citrus, sky blue',
  },
  dubai: {
    label:        'Dubai',
    promptSuffix: 'Dubai skyline, Burj Khalifa, desert luxury, golden hour, futuristic cityscape',
    colourNote:   'gold, sand, night-sky navy',
  },
  europe: {
    label:        'Europe',
    promptSuffix: 'European travel scene, cobblestone streets, historic architecture, autumn or spring light',
    colourNote:   'muted earth tones, vintage warmth',
  },
  africa: {
    label:        'Africa',
    promptSuffix: 'vibrant African destination, rich cultural colours, sunsets, wildlife or urban energy',
    colourNote:   'terracotta, green savannah, sunset orange',
  },
  student_travel: {
    label:        'Student Travel',
    promptSuffix: 'young travellers, adventure, backpacker energy, exciting new city, dynamic composition',
    colourNote:   'bold primaries, energetic palette',
  },
  group_travel: {
    label:        'Group Travel',
    promptSuffix: 'group of friends or colleagues at a destination, shared experience, social travel',
    colourNote:   'warm social tones, bright',
  },
  concierge: {
    label:        'Concierge',
    promptSuffix: 'white-glove service, bespoke travel, private jet or VIP lounge aesthetic',
    colourNote:   'platinum, charcoal, cream',
  },
}

// ── Format presets ───────────────────────────────────────────────────────────

export interface FormatPreset {
  label:        string
  width:        number
  height:       number
  openaiSize:   '1024x1024' | '1024x1536' | '1536x1024' | 'auto'
  aspectRatio:  string   // for video (Runway / FAL.ai)
  videoRatio:   string   // Runway ratio string
  orbitFormat:  string   // value stored in OrbitMedia.format
}

export const FORMAT_PRESETS: Record<string, FormatPreset> = {
  '1080x1920': {
    label:       'Instagram / TikTok / Reel',
    width:       1080,
    height:      1920,
    openaiSize:  '1024x1536',
    aspectRatio: '9:16',
    videoRatio:  '720:1280',
    orbitFormat: '1080x1920',
  },
  '1080x1350': {
    label:       'Instagram Portrait',
    width:       1080,
    height:      1350,
    openaiSize:  '1024x1536',
    aspectRatio: '4:5',
    videoRatio:  '720:1280',
    orbitFormat: '1080x1350',
  },
  '1080x1080': {
    label:       'Square (Facebook / Instagram)',
    width:       1080,
    height:      1080,
    openaiSize:  '1024x1024',
    aspectRatio: '1:1',
    videoRatio:  '768:768',
    orbitFormat: '1024x1024',
  },
  '1024x1024': {
    label:       'Square',
    width:       1024,
    height:      1024,
    openaiSize:  '1024x1024',
    aspectRatio: '1:1',
    videoRatio:  '768:768',
    orbitFormat: '1024x1024',
  },
  '1200x628': {
    label:       'Facebook / LinkedIn Landscape',
    width:       1200,
    height:      628,
    openaiSize:  '1536x1024',
    aspectRatio: '16:9',
    videoRatio:  '1280:720',
    orbitFormat: '1200x628',
  },
}

export function getFormatPreset(formatKey: string): FormatPreset {
  return FORMAT_PRESETS[formatKey] ?? FORMAT_PRESETS['1080x1920']
}

// ── Prompt builder ────────────────────────────────────────────────────────────

const NO_TEXT_SUFFIX =
  'photographic background only, no text, no words, no lettering, ' +
  'no typography, no watermarks, no logos, no overlays, no captions, ' +
  'no numbers, no signs with readable text'

export function buildCreativePrompt(opts: {
  destination:  string
  objective:    string
  promptHint?:  string
  brandPreset?: string
}): string {
  const dest    = opts.destination.trim() || 'a travel destination'
  const preset  = opts.brandPreset ? BRAND_PRESETS[opts.brandPreset] : null
  const hint    = opts.promptHint?.trim() || `${opts.objective.replace(/_/g, ' ')} campaign visual`

  const parts: string[] = [
    `Photographic travel scene of ${dest}`,
    hint,
    'professional travel photography, high quality, vibrant colours',
    'navy blue and gold accent tones in the composition',
  ]

  if (preset) parts.push(preset.promptSuffix)

  return `${parts.join(', ')}. ${NO_TEXT_SUFFIX}.`
}
