// lib/concierge/catalogue/index.ts
// Database-driven category catalogue with a 60-second module-level cache.
// Categories are live DB data — no hardcoded slugs in application code.
// Admin updates a category row → next cache refresh picks it up automatically.

import { getSupabaseAdmin } from '@/lib/supabase'
import type { ConciergeCategory, FulfilmentMode, RequiredField } from '../types'

// ── Module-level cache ────────────────────────────────────────────────────────

let _cache:   ConciergeCategory[] | null = null
let _cacheAt: number = 0
const CACHE_TTL_MS = 60_000  // 60 seconds

// ── Public API ────────────────────────────────────────────────────────────────

export async function getActiveCategories(): Promise<ConciergeCategory[]> {
  const now = Date.now()
  if (_cache && now - _cacheAt < CACHE_TTL_MS) return _cache

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('concierge_categories')
      .select('id, slug, name, description, icon, fulfilment_modes, required_fields, is_active, display_order, metadata')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) throw error

    _cache   = (data ?? []).map(rowToCategory)
    _cacheAt = now
    return _cache
  } catch (err) {
    console.error('[catalogue] Failed to load categories:', err)
    // Return stale cache if available — better than an empty list on a transient DB error
    return _cache ?? []
  }
}

export async function getCategoryBySlug(slug: string): Promise<ConciergeCategory | null> {
  const categories = await getActiveCategories()
  return categories.find(c => c.slug === slug) ?? null
}

/** Force a cache refresh (e.g. after an admin updates a category). */
export function invalidateCategoryCache(): void {
  _cache   = null
  _cacheAt = 0
}

// ── Row mapping ───────────────────────────────────────────────────────────────

interface CategoryRow {
  id:               string
  slug:             string
  name:             string
  description:      string | null
  icon:             string | null
  fulfilment_modes: string[]
  required_fields:  unknown
  is_active:        boolean
  display_order:    number
  metadata:         unknown
}

function rowToCategory(row: CategoryRow): ConciergeCategory {
  return {
    id:              row.id,
    slug:            row.slug,
    name:            row.name,
    description:     row.description ?? '',
    icon:            row.icon ?? undefined,
    fulfilmentModes: (row.fulfilment_modes ?? []) as FulfilmentMode[],
    requiredFields:  Array.isArray(row.required_fields)
                       ? (row.required_fields as RequiredField[])
                       : [],
    isActive:        row.is_active,
    displayOrder:    row.display_order ?? 0,
    metadata:        (row.metadata ?? {}) as Record<string, unknown>,
  }
}
