// Server-side Walz pricing engine.
// Applies markup rules from concierge_pricing_rules to a supplier base price.
// Raw supplier amounts must NEVER leave this module — only call-site receives walzAmount.

import { getSupabaseAdmin } from '@/lib/supabase'

interface DBPricingRule {
  modifier:    { type: 'percent' | 'fixed'; value: number }
  applies_to:  string
  target_id:   string | null
  priority:    number
  valid_from:  string | null
  valid_until: string | null
}

const DEFAULT_MARKUP_PERCENT = 20  // fallback when no rules are configured

export async function applyWalzMarkup(
  baseAmount:  number,
  currency:    string,
  categorySlug = 'airport-services',
): Promise<{ walzAmount: number; currency: string }> {
  try {
    const supabase = getSupabaseAdmin()

    // Find category ID so we can match category-specific rules
    const { data: cat } = await supabase
      .from('concierge_categories')
      .select('id')
      .eq('slug', categorySlug)
      .maybeSingle()

    const { data: allRules } = await supabase
      .from('concierge_pricing_rules')
      .select('modifier, applies_to, target_id, priority, valid_from, valid_until')
      .eq('is_active', true)
      .order('priority', { ascending: false })

    const now = new Date()
    const applicable = ((allRules ?? []) as DBPricingRule[]).filter(r => {
      const isGlobal   = r.applies_to === 'global'
      const isCategory = r.applies_to === 'category' && r.target_id === (cat?.id ?? '__none__')
      if (!isGlobal && !isCategory) return false
      if (r.valid_from  && new Date(r.valid_from)  > now) return false
      if (r.valid_until && new Date(r.valid_until) < now) return false
      return true
    })

    if (!applicable.length) {
      return { walzAmount: round2(baseAmount * (1 + DEFAULT_MARKUP_PERCENT / 100)), currency }
    }

    let amount = baseAmount
    for (const rule of applicable) {
      if (rule.modifier.type === 'percent') {
        amount = amount * (1 + rule.modifier.value / 100)
      } else {
        amount = amount + rule.modifier.value
      }
    }

    return { walzAmount: round2(amount), currency }
  } catch (err) {
    console.error('[Pricing] Failed to load pricing rules — using default markup:', (err as Error).message)
    return { walzAmount: round2(baseAmount * (1 + DEFAULT_MARKUP_PERCENT / 100)), currency }
  }
}

export function formatDisplayPrice(amount: number, currency: string, perPerson: boolean): string {
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  return perPerson ? `${formatted} / person` : formatted
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
