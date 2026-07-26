// ComfortPassAdapter — implements SupplierAdapter + extended CP-specific methods.
// All communication with ComfortPass happens here. Jade never reaches this layer.

import { randomUUID }         from 'crypto'
import { getSupabaseAdmin }   from '@/lib/supabase'
import { getConfig }          from './config'
import { ComfortPassClient }  from './client'
import {
  ComfortPassTimeoutError,
  ComfortPassBookingConflictError,
} from './errors'
import {
  toWalzAirport, toWalzService, toWalzServicePrice,
  toWalzBookingRecord, toWalzVoucher, buildFingerprint,
} from './mapper'
import { cpStatusToWalzRequestStatus, cpStatusHasVoucher } from './status-mapper'
import { coerceIntentToBooking, validateBookingRequest }   from './schemas'

import type { SupplierAdapter }             from '../../adapters/base'
import type { DispatchPayload, DispatchResult } from '../../types'
import type {
  CPBookingRequest, CPPassenger,
  WalzAirport, WalzService, WalzServicePrice,
  WalzBookingRecord, WalzVoucher,
} from './types'

// Row type for comfortpass_bookings table
interface CPBookingRow {
  id:               string
  request_id:       string
  fingerprint:      string
  submission_state: string
  cp_booking_id:    string | null
  cp_booking_number: number | null
  service_code:     string | null
  airport_code:     string | null
  service_date:     string | null
  service_time:     string | null
  flight_number:    string | null
  passenger_count:  number | null
  supplier_amount:  number | null
  supplier_currency: string | null
  cp_status:        string | null
  checkout_url:     string | null
  voucher_url:      string | null
  voucher_status:   string | null
  error_code:       string | null
  error_message:    string | null
  correlation_id:   string | null
  submitted_at:     string | null
}

export class ComfortPassAdapter implements SupplierAdapter {
  readonly type = 'comfortpass' as const

  private getClient(): ComfortPassClient {
    const config = getConfig()
    if (!config) throw new Error('[ComfortPass] Adapter is disabled or misconfigured')
    return new ComfortPassClient(config)
  }

  // ── SupplierAdapter.dispatch ────────────────────────────────────────────────
  // Called by SupplierRouter. Builds a booking from Jade intent fields.

  async dispatch(payload: DispatchPayload): Promise<DispatchResult> {
    const fields = payload.fields
    const ref    = payload.requestReference

    // 1. Coerce Jade intent fields into CP booking shape
    const partial = coerceIntentToBooking(fields)

    // 2. Build full booking request
    const passengers: CPPassenger[] = partial.passengers ?? [{
      type:      'adult',
      firstName: payload.clientName?.split(' ')[0] ?? 'Guest',
      lastName:  payload.clientName?.split(' ').slice(1).join(' ') || 'Traveller',
    }]

    const bookingReq: CPBookingRequest = {
      serviceCode:   partial.serviceCode  ?? (fields.service_code  as string) ?? '',
      airportCode:   partial.airportCode  ?? (fields.airport_code  as string) ?? '',
      date:          partial.date         ?? (fields.date           as string) ?? '',
      time:          partial.time         ?? (fields.time           as string) ?? '00:00',
      flightNumber:  partial.flightNumber ?? (fields.flight_number  as string) ?? '',
      passengers,
      paymentMethod: 'balance',
      reference:     ref,
    }

    // 3. Validate
    const validation = validateBookingRequest(bookingReq)
    if (!validation.valid) {
      return {
        success: false,
        error:   `Missing booking fields: ${validation.errors.join('; ')}`,
        metadata: { validationErrors: validation.errors },
      }
    }

    // 4. Fingerprint + duplicate prevention
    const fingerprint = buildFingerprint({
      requestId:    payload.requestId,
      serviceCode:  bookingReq.serviceCode,
      airportCode:  bookingReq.airportCode,
      date:         bookingReq.date,
      flightNumber: bookingReq.flightNumber,
      passengers:   passengers.length,
    })

    const lockId = await this.acquireSubmissionLock(payload.requestId, fingerprint, bookingReq)
    if (!lockId) {
      // Duplicate detected — return existing supplierRef
      return {
        success:     true,
        supplierRef: fingerprint,
        error:       undefined,
        metadata:    { duplicate: true },
      }
    }

    // 5. Submit to ComfortPass — no retry
    const client = this.getClient()
    try {
      const cp = await client.createBooking(bookingReq)

      // cp.checkoutUrl will be null for balance payments — this is expected
      await this.recordBookingSuccess(lockId, cp, bookingReq)

      // Update concierge_requests status to match CP response
      void this.syncRequestStatus(payload.requestId, cpStatusToWalzRequestStatus(cp.status))

      return {
        success:     true,
        supplierRef: String(cp.bookingNumber),
        metadata: {
          cpBookingId:    cp.id,
          bookingNumber:  cp.bookingNumber,
          cpStatus:       cp.status,
          serviceCode:    cp.serviceCode,
          airportCode:    cp.airportCode,
        },
      }
    } catch (err) {
      const isTimeout = err instanceof ComfortPassTimeoutError
      const state     = isTimeout ? 'manual_review' : 'failed'
      const code      = (err as { code?: string }).code ?? 'CP_UNKNOWN'
      const message   = (err as Error).message ?? 'Unknown error'

      console.error(`[ComfortPass] Booking failed state=${state}:`, code)

      await this.recordBookingFailure(lockId, code, message, state)

      if (isTimeout) {
        // Alert ops via console — monitoring should pick this up
        console.error(`[ComfortPass] MANUAL REVIEW REQUIRED for request ${payload.requestId} — booking timed out`)
      }

      return {
        success: false,
        error:   isTimeout
          ? 'Booking is pending manual review — our team will confirm shortly'
          : message,
        metadata: { cpErrorCode: code, manualReview: isTimeout },
      }
    }
  }

  // ── Extended CP operations (used by API routes, not by SupplierRouter) ──────

  async searchAirports(query: string): Promise<WalzAirport[]> {
    const airports = await this.getClient().searchAirports(query)
    return airports.map(toWalzAirport)
  }

  async searchServices(params: {
    q?:          string
    airport?:    string
    date?:       string
    passengers?: number
  }): Promise<WalzService[]> {
    const services = await this.getClient().searchServices(params)
    return services.map(toWalzService)
  }

  async getServicePrice(serviceCode: string): Promise<WalzServicePrice> {
    const price = await this.getClient().getPrice(serviceCode)
    return toWalzServicePrice(price)
  }

  async getBookingStatus(cpBookingId: string, walzRef: string): Promise<WalzBookingRecord> {
    const booking = await this.getClient().getBooking(cpBookingId)
    return toWalzBookingRecord(booking, walzRef)
  }

  async fetchVoucher(cpBookingId: string, walzRef: string): Promise<WalzVoucher> {
    const voucher = await this.getClient().getVoucher(cpBookingId)
    return toWalzVoucher(voucher, walzRef)
  }

  async getAccountBalance(): Promise<{ amount: number; currency: string; low: boolean }> {
    const config  = getConfig()
    const balance = await this.getClient().getBalance()
    return {
      amount:   balance.amount,
      currency: balance.currency,
      low:      config ? balance.amount < config.lowBalanceThreshold : false,
    }
  }

  // Poll booking and update DB — called by status-check cron or admin
  async pollAndUpdateBooking(cpBookingId: string, requestId: string): Promise<void> {
    try {
      const cp      = await this.getClient().getBooking(cpBookingId)
      const supabase = getSupabaseAdmin()

      const updates: Record<string, unknown> = {
        cp_status:        cp.status,
        last_status_check: new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      }

      if (cpStatusHasVoucher(cp.status)) {
        try {
          const voucher = await this.getClient().getVoucher(cpBookingId)
          updates.voucher_url    = voucher.voucherUrl
          updates.voucher_status = 'ready'
        } catch {
          // Voucher not yet available — try again next poll
        }
      }

      await supabase
        .from('comfortpass_bookings')
        .update(updates)
        .eq('cp_booking_id', cpBookingId)

      void this.syncRequestStatus(requestId, cpStatusToWalzRequestStatus(cp.status))
    } catch (err) {
      console.error('[ComfortPass] pollAndUpdateBooking failed:', (err as Error).message)
    }
  }

  // ── Submission lock helpers ─────────────────────────────────────────────────

  private async acquireSubmissionLock(
    requestId:   string,
    fingerprint: string,
    req:         CPBookingRequest,
  ): Promise<string | null> {
    const supabase = getSupabaseAdmin()
    const id       = randomUUID()

    // Attempt insert — fails on UNIQUE(fingerprint) if duplicate
    const { error } = await supabase.from('comfortpass_bookings').insert({
      id,
      request_id:       requestId,
      fingerprint,
      submission_state: 'pending',
      service_code:     req.serviceCode,
      airport_code:     req.airportCode,
      service_date:     req.date,
      service_time:     req.time,
      flight_number:    req.flightNumber,
      passenger_count:  req.passengers.length,
    })

    if (error) {
      // Duplicate — log and signal caller
      if (error.code === '23505') {
        console.warn(`[ComfortPass] Duplicate submission blocked for request ${requestId}`)
        return null
      }
      throw new Error(`[ComfortPass] Could not acquire submission lock: ${error.message}`)
    }

    return id
  }

  private async recordBookingSuccess(
    lockId: string,
    cp:     Awaited<ReturnType<ComfortPassClient['createBooking']>>,
    req:    CPBookingRequest,
  ): Promise<void> {
    const supabase = getSupabaseAdmin()
    await supabase.from('comfortpass_bookings').update({
      submission_state:  'submitted',
      cp_booking_id:     cp.id,
      cp_booking_number: cp.bookingNumber,
      supplier_amount:   cp.totalAmount,
      supplier_currency: cp.currency,
      cp_status:         cp.status,
      checkout_url:      cp.checkoutUrl,  // null for balance bookings — expected
      submitted_at:      new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }).eq('id', lockId)
  }

  private async recordBookingFailure(
    lockId:  string,
    code:    string,
    message: string,
    state:   'failed' | 'manual_review',
  ): Promise<void> {
    const supabase = getSupabaseAdmin()
    await supabase.from('comfortpass_bookings').update({
      submission_state: state,
      error_code:       code,
      error_message:    message,
      updated_at:       new Date().toISOString(),
    }).eq('id', lockId)
  }

  private async syncRequestStatus(requestId: string, status: string): Promise<void> {
    try {
      const supabase = getSupabaseAdmin()
      await supabase
        .from('concierge_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', requestId)
    } catch (err) {
      console.error('[ComfortPass] syncRequestStatus failed:', (err as Error).message)
    }
  }
}
