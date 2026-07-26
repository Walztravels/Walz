// lib/concierge/router/supplier-router.ts
// SupplierRouter — selects the right supplier for a request category,
// resolves the matching adapter, dispatches, and records the fulfilment.
// Called by ConciergeCore — Jade never touches this directly.

import { getSupabaseAdmin }    from '@/lib/supabase'
import { ManualAdapter }       from '../adapters/manual'
import { ComfortPassAdapter }  from '../suppliers/comfortpass/adapter'
import { isEnabled as cpEnabled } from '../suppliers/comfortpass/config'
import type { SupplierAdapter } from '../adapters/base'
import type {
  ConciergeCategory, ConciergeSupplier,
  ConciergeRequest,  DispatchPayload, DispatchResult,
} from '../types'

// ── Adapter registry ──────────────────────────────────────────────────────────
// Add new adapters here when supplier API integrations are built (Phase 7+).
// The router resolves adapters by supplier.adapterType — no code changes elsewhere.

const ADAPTER_REGISTRY: Record<string, () => SupplierAdapter> = {
  manual:       () => new ManualAdapter(),
  comfortpass:  () => {
    if (!cpEnabled()) {
      console.warn('[SupplierRouter] ComfortPass adapter selected but COMFORTPASS_ENABLED=false — falling back to manual')
      return new ManualAdapter()
    }
    return new ComfortPassAdapter()
  },
  // api: () => new ApiAdapter(),   // reserved
  // gds: () => new GdsAdapter(),   // reserved
}

// ── Fallback supplier (used when no supplier is configured for a category) ────

const WALZ_OPS_FALLBACK: ConciergeSupplier = {
  id:            'walz-operations',
  slug:          'walz-operations',
  name:          'Walz Operations',
  adapterType:   'manual',
  contactEmail:  'contact@walztravels.com',
  contactPhone:  undefined,
  categorySlugs: [],
  isActive:      true,
  metadata:      {},
}

// ── Row type from Supabase ─────────────────────────────────────────────────────

interface SupplierRow {
  id:             string
  slug:           string
  name:           string
  adapter_type:   string
  contact_email:  string | null
  contact_phone:  string | null
  category_slugs: string[]
  metadata:       Record<string, unknown> | null
}

// ── SupplierRouter ────────────────────────────────────────────────────────────

export class SupplierRouter {
  async route(
    request:  Pick<ConciergeRequest, 'id' | 'reference' | 'intentFields' | 'fulfilmentMode' | 'clientName' | 'clientEmail' | 'clientPhone' | 'chatwootConvId'>,
    category: ConciergeCategory,
  ): Promise<DispatchResult> {
    // 1. Find the best active supplier for this category
    const supplier = await this.selectSupplier(category.slug)

    // 2. Resolve adapter — fall back to manual if type is unknown
    const makeAdapter = ADAPTER_REGISTRY[supplier.adapterType] ?? ADAPTER_REGISTRY.manual
    const adapter = makeAdapter()

    // 3. Build dispatch payload
    const payload: DispatchPayload = {
      requestId:        request.id,
      requestReference: request.reference,
      category,
      supplier,
      fulfilmentMode:   request.fulfilmentMode,
      fields:           request.intentFields,
      clientName:       request.clientName ?? undefined,
      clientEmail:      request.clientEmail ?? undefined,
      clientPhone:      request.clientPhone ?? undefined,
      chatwootConvId:   request.chatwootConvId ?? undefined,
    }

    // 4. Dispatch
    const result = await adapter.dispatch(payload)

    // 5. Record fulfilment (non-blocking — errors logged, don't surface to Jade)
    this.recordFulfilment(request.id, supplier, adapter.type, payload, result).catch(
      err => console.error('[SupplierRouter] Fulfilment record failed:', err),
    )

    return result
  }

  private async selectSupplier(categorySlug: string): Promise<ConciergeSupplier> {
    try {
      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase
        .from('concierge_suppliers')
        .select('id, slug, name, adapter_type, contact_email, contact_phone, category_slugs, metadata')
        .eq('is_active', true)
        .contains('category_slugs', [categorySlug])
        .order('id')
        .limit(1)
        .single()

      if (error || !data) return WALZ_OPS_FALLBACK

      const row = data as SupplierRow
      return {
        id:            row.id,
        slug:          row.slug,
        name:          row.name,
        adapterType:   (row.adapter_type ?? 'manual') as ConciergeSupplier['adapterType'],
        contactEmail:  row.contact_email ?? undefined,
        contactPhone:  row.contact_phone ?? undefined,
        categorySlugs: row.category_slugs ?? [],
        isActive:      true,
        metadata:      row.metadata ?? {},
      }
    } catch {
      return WALZ_OPS_FALLBACK
    }
  }

  private async recordFulfilment(
    requestId:        string,
    supplier:         ConciergeSupplier,
    adapterType:      string,
    payload:          DispatchPayload,
    result:           DispatchResult,
  ): Promise<void> {
    const supabase = getSupabaseAdmin()

    // Strip client contact from payload before persisting to avoid duplication
    const safePayload = { ...payload, clientEmail: undefined, clientPhone: undefined }

    await supabase.from('concierge_fulfilment').insert({
      request_id:        requestId,
      supplier_id:       supplier.slug,
      adapter_type:      adapterType,
      dispatch_status:   result.success ? 'dispatched' : 'failed',
      supplier_ref:      result.supplierRef ?? null,
      dispatch_payload:  safePayload,
      dispatch_response: result,
      dispatched_at:     result.success ? new Date().toISOString() : null,
    })
  }
}
