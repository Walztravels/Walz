/**
 * Walz Orbit — Decorative Element catalog.
 *
 * Reusable non-commercial decorative elements for campaign artwork.
 * These are purely visual — no text, prices, routes, or legal content.
 *
 * INVARIANT: Decorative elements never contain commercial values.
 */

export type DecorativeCategory = 'travel' | 'seasonal' | 'financial' | 'map' | 'texture'

export interface DecorativeElementDef {
  key:          string
  label:        string
  icon:         string            // emoji for UI display
  category:     DecorativeCategory
  /** When true, this element should come from Media Library or Orbit asset pack */
  requiresAsset: boolean
  /** When requiresAsset is false, rendered procedurally on canvas */
  procedural:   boolean
}

export const DECORATIVE_ELEMENTS: Record<string, DecorativeElementDef> = {
  aircraft: {
    key: 'aircraft', label: 'Aircraft silhouette', icon: '✈️',
    category: 'travel', requiresAsset: false, procedural: true,
  },
  travel_ticket: {
    key: 'travel_ticket', label: 'Travel ticket', icon: '🎫',
    category: 'travel', requiresAsset: false, procedural: true,
  },
  luggage: {
    key: 'luggage', label: 'Luggage', icon: '🧳',
    category: 'travel', requiresAsset: true, procedural: false,
  },
  passport: {
    key: 'passport', label: 'Passport', icon: '📗',
    category: 'travel', requiresAsset: true, procedural: false,
  },
  crypto_coin: {
    key: 'crypto_coin', label: 'Crypto coin', icon: '🪙',
    category: 'financial', requiresAsset: false, procedural: true,
  },
  world_map: {
    key: 'world_map', label: 'World map texture', icon: '🗺️',
    category: 'map', requiresAsset: false, procedural: true,
  },
  route_line: {
    key: 'route_line', label: 'Route arc line', icon: '📍',
    category: 'map', requiresAsset: false, procedural: true,
  },
  clouds: {
    key: 'clouds', label: 'Clouds', icon: '☁️',
    category: 'texture', requiresAsset: false, procedural: true,
  },
  seasonal_lights: {
    key: 'seasonal_lights', label: 'Seasonal lights', icon: '✨',
    category: 'seasonal', requiresAsset: false, procedural: true,
  },
  christmas_ornaments: {
    key: 'christmas_ornaments', label: 'Christmas ornaments', icon: '🎄',
    category: 'seasonal', requiresAsset: true, procedural: false,
  },
  landmark_accent: {
    key: 'landmark_accent', label: 'Destination landmark accent', icon: '🏛️',
    category: 'travel', requiresAsset: true, procedural: false,
  },
}

export const ALL_DECORATIVE_ELEMENTS = Object.values(DECORATIVE_ELEMENTS)

export function getElementsByCategory(category: DecorativeCategory): DecorativeElementDef[] {
  return ALL_DECORATIVE_ELEMENTS.filter(e => e.category === category)
}

// ── Per-template recommended decoratives ─────────────────────────────────────

export const TEMPLATE_DECORATIVE_DEFAULTS: Record<string, string[]> = {
  walz_hero_split:            ['route_line'],
  walz_destination_editorial: ['landmark_accent'],
  walz_seasonal_campaign:     ['seasonal_lights'],
  walz_information_poster:    [],
  walz_travel_collage:        ['world_map', 'clouds'],
}

/**
 * State for an active decorative element instance in a composition.
 * Note: no text/commercial content allowed.
 */
export interface DecorativeElementInstance {
  elementKey: string
  x:          number   // 0–1 fractional
  y:          number   // 0–1 fractional
  scale:      number   // 1.0 = default
  opacity:    number   // 0–1
  visible:    boolean
  /** Asset URL from Media Library, when requiresAsset=true */
  assetUrl?:  string
}
