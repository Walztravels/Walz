// lib/concierge/adapters/base.ts
// SupplierAdapter interface — the contract every adapter must implement.
// Adding a new supplier type = writing a new class that satisfies this interface.
// The SupplierRouter selects adapters; the ConciergeCore calls the router.
// Jade never touches adapters directly.

import type { DispatchPayload, DispatchResult, AvailabilityQuery, AvailabilityResult } from '../types'

export interface SupplierAdapter {
  readonly type: 'manual' | 'api' | 'gds' | 'comfortpass' | 'aviapages'

  /**
   * Dispatch a concierge request to the supplier.
   * Must never throw — return { success: false, error } instead.
   */
  dispatch(payload: DispatchPayload): Promise<DispatchResult>

  /**
   * Optional: check real-time availability before dispatching.
   * Manual adapters return a static SLA string (no real-time check).
   */
  checkAvailability?(query: AvailabilityQuery): Promise<AvailabilityResult>
}
