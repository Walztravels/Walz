// lib/concierge/core/index.ts
// ConciergeCore — the single business orchestration entry point.
// Jade never reads DB tables or calls adapters directly.
// All Concierge business logic flows through this class.

import { getSupabaseAdmin }   from '@/lib/supabase'
import { getCategoryBySlug }  from '../catalogue'
import { SupplierRouter }     from '../router/supplier-router'
import type {
  ConciergeCategory,
  CreateRequestResult,
  ValidationResult,
  FulfilmentMode,
} from '../types'

// ── SLA windows by fulfilment mode ────────────────────────────────────────────

const SLA_BY_MODE: Record<FulfilmentMode, { label: string; ms: number }> = {
  instant:         { label: '2 hours',  ms: 2  * 3600 * 1000 },
  request_to_book: { label: '4 hours',  ms: 4  * 3600 * 1000 },
  bespoke:         { label: '24 hours', ms: 24 * 3600 * 1000 },
}

// ── Create request options ────────────────────────────────────────────────────

export interface CreateRequestOpts {
  jadeSessionId:  string
  categorySlug:   string
  intentFields:   Record<string, unknown>
  clientName?:    string
  clientEmail?:   string
  clientPhone?:   string
  chatwootConvId?: number
}

// ── ConciergeCore ─────────────────────────────────────────────────────────────

export class ConciergeCore {
  private router = new SupplierRouter()

  /**
   * Validate that all required fields for a category are present.
   * Called by the route handler BEFORE executing the tool — missing fields
   * are returned as an error string to Jade so it can re-ask the client.
   */
  validateFields(
    category: ConciergeCategory,
    fields:   Record<string, unknown>,
  ): ValidationResult {
    const missing = category.requiredFields
      .filter(f => f.required && !fields[f.key])
      .map(f => f.label)

    return { valid: missing.length === 0, missing }
  }

  /**
   * Create a concierge request and dispatch it to the supplier.
   * Returns { reference, sla, status } — safe to return to Jade.
   * Returns null on unrecoverable failure (DB down, unknown category).
   */
  async createRequest(opts: CreateRequestOpts): Promise<CreateRequestResult | null> {
    // 1. Load category from DB (validates that the slug is real and active)
    const category = await getCategoryBySlug(opts.categorySlug)
    if (!category) {
      console.error('[ConciergeCore] Unknown category slug:', opts.categorySlug)
      return null
    }

    // 2. Pick fulfilment mode and compute SLA
    const fulfilmentMode = category.fulfilmentModes[0] ?? 'request_to_book'
    const sla = SLA_BY_MODE[fulfilmentMode] ?? SLA_BY_MODE.request_to_book

    // 3. Generate unique reference
    const reference = await this.generateReference()
    if (!reference) {
      console.error('[ConciergeCore] Failed to generate reference')
      return null
    }

    // 4. Write request record to Supabase
    const requestId = await this.insertRequest({
      reference,
      category,
      fulfilmentMode,
      slaMs:          sla.ms,
      ...opts,
    })
    if (!requestId) return null

    // 5. Dispatch to supplier — fire and don't await to keep Jade's response fast.
    // Errors are logged inside the router; they do not surface to Jade.
    this.router.route(
      {
        id:             requestId,
        reference,
        intentFields:   opts.intentFields,
        fulfilmentMode,
        clientName:     opts.clientName,
        clientEmail:    opts.clientEmail,
        clientPhone:    opts.clientPhone,
        chatwootConvId: opts.chatwootConvId,
      },
      category,
    ).catch(err => console.error('[ConciergeCore] Dispatch error:', err))

    return { reference, sla: sla.label, status: 'pending' }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async generateReference(): Promise<string | null> {
    try {
      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase.rpc('next_concierge_reference')
      if (error) throw error
      return data as string
    } catch (err) {
      console.error('[ConciergeCore] next_concierge_reference RPC failed:', err)
      // Fallback: timestamp-based reference if RPC is unavailable
      return `WC-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`
    }
  }

  private async insertRequest(opts: {
    reference:      string
    category:       ConciergeCategory
    fulfilmentMode: FulfilmentMode
    slaMs:          number
    jadeSessionId:  string
    intentFields:   Record<string, unknown>
    clientName?:    string
    clientEmail?:   string
    clientPhone?:   string
    chatwootConvId?: number
  }): Promise<string | null> {
    try {
      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase
        .from('concierge_requests')
        .insert({
          reference:       opts.reference,
          jade_session_id: opts.jadeSessionId,
          chatwoot_conv_id: opts.chatwootConvId ?? null,
          category_id:     opts.category.id,
          fulfilment_mode: opts.fulfilmentMode,
          status:          'pending',
          intent_fields:   opts.intentFields,
          client_name:     opts.clientName ?? null,
          client_email:    opts.clientEmail ?? null,
          client_phone:    opts.clientPhone ?? null,
          sla_deadline:    new Date(Date.now() + opts.slaMs).toISOString(),
        })
        .select('id')
        .single()

      if (error) throw error
      return (data as { id: string }).id
    } catch (err) {
      console.error('[ConciergeCore] Failed to insert request:', err)
      return null
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
// Import this instance in tool executors — don't new ConciergeCore() elsewhere.

export const conciergeCore = new ConciergeCore()
