// lib/jade/search-ref.ts
// Release 4B — Jade Search Result Reference layer
//
// Opaque, ownership-scoped, TTL-bound result refs that separate customer-safe
// search results from private supplier data (rateKey, offerId, packageCode…).
//
// Storage: Redis primary (fast TTL), Postgres fallback (always durable).
// When Redis is unavailable (REDIS_URL not set), Postgres is the sole store.
//
// Ref format:  jr_{16-char base64url}    e.g. jr_Kx8mN2pQvLsT4wYz
// Redis key:   jade:ref:{id}

import crypto   from 'crypto'
import prisma   from '@/lib/db'
import redis, { cacheSet, cacheGet } from '@/lib/redis'

// ── TTL constants (seconds) ───────────────────────────────────────────────────

export const REF_TTL: Record<string, number> = {
  FLIGHT:   15 * 60,   // 15 min (Duffel offer expiry)
  HOTEL:    15 * 60,   // 15 min (Hotelbeds rate expiry)
  ACTIVITY: 20 * 60,   // 20 min
  TRANSFER: 15 * 60,   // 15 min
  ESIM:     60 * 60,   // 60 min (stable pricing)
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SearchProductType = 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'TRANSFER' | 'ESIM'

export interface SearchResultDetails {
  [key: string]: unknown
}

export interface CreateRefInput {
  userId:          string | null
  sessionId:       string | null
  tripId?:         string | null
  productType:     SearchProductType
  title:           string
  description?:    string
  imageUrl?:       string
  sellingPrice:    number
  currency:        string
  details:         SearchResultDetails   // customer-safe: shown to Jade
  supplierPayload: Record<string, unknown>  // private: rateKey, offerId, etc. — never to Jade
  offerExpiresAt?: string  // supplier-provided expiry (ISO string) — overrides TTL if earlier
}

export interface SearchRef {
  id:          string
  userId:      string | null
  sessionId:   string | null
  tripId:      string | null
  productType: SearchProductType
  title:       string
  description: string | null
  imageUrl:    string | null
  sellingPrice: number
  currency:    string
  details:     SearchResultDetails
  supplierPayload: Record<string, unknown>
  expiresAt:   string  // ISO
}

export type ResolveRefResult =
  | { ok: true;  ref: SearchRef }
  | { ok: false; reason: 'INVALID_RESULT_REFERENCE' | 'SEARCH_RESULT_EXPIRED' | 'ACCESS_DENIED' }

// ── Generate opaque ref ID ────────────────────────────────────────────────────

function generateRefId(): string {
  return 'jr_' + crypto.randomBytes(12).toString('base64url')
}

// ── Write ref ─────────────────────────────────────────────────────────────────

export async function createSearchRef(input: CreateRefInput): Promise<string> {
  const id  = generateRefId()
  const ttl = input.offerExpiresAt
    ? Math.max(60, Math.min(
        REF_TTL[input.productType] ?? 900,
        Math.floor((new Date(input.offerExpiresAt).getTime() - Date.now()) / 1000),
      ))
    : (REF_TTL[input.productType] ?? 900)

  const expiresAt = new Date(Date.now() + ttl * 1000)

  const stored: SearchRef = {
    id,
    userId:      input.userId,
    sessionId:   input.sessionId,
    tripId:      input.tripId ?? null,
    productType: input.productType,
    title:       input.title,
    description: input.description ?? null,
    imageUrl:    input.imageUrl    ?? null,
    sellingPrice: input.sellingPrice,
    currency:    input.currency,
    details:     input.details,
    supplierPayload: input.supplierPayload,
    expiresAt:   expiresAt.toISOString(),
  }

  // ── Write to Redis (primary, fast TTL) ──────────────────────────────────
  await cacheSet(`jade:ref:${id}`, stored, ttl)

  // ── Write to Postgres (durable fallback) ────────────────────────────────
  try {
    await prisma.jadeSearchRef.create({
      data: {
        id,
        userId:          input.userId,
        sessionId:       input.sessionId,
        tripId:          input.tripId ?? null,
        productType:     input.productType,
        title:           input.title,
        description:     input.description ?? null,
        imageUrl:        input.imageUrl    ?? null,
        sellingPrice:    input.sellingPrice,
        currency:        input.currency,
        details:         input.details as never,
        supplierPayload: input.supplierPayload as never,
        expiresAt,
      },
    })
  } catch (err) {
    // Non-fatal — Redis is the primary store; Postgres is backup
    console.warn('[search-ref] Postgres write failed (non-fatal):', (err as Error).message)
  }

  return id
}

// ── Resolve ref ───────────────────────────────────────────────────────────────

export async function resolveSearchRef(
  id:        string,
  viewer:    { userId: string | null; sessionId: string | null },
): Promise<ResolveRefResult> {
  // Basic format check
  if (!id || !id.startsWith('jr_') || id.length < 10) {
    return { ok: false, reason: 'INVALID_RESULT_REFERENCE' }
  }

  // ── Try Redis first ────────────────────────────────────────────────────
  let ref = await cacheGet<SearchRef>(`jade:ref:${id}`)

  // ── Fall back to Postgres ──────────────────────────────────────────────
  if (!ref) {
    try {
      const row = await prisma.jadeSearchRef.findUnique({ where: { id } })
      if (!row) return { ok: false, reason: 'INVALID_RESULT_REFERENCE' }

      ref = {
        id:              row.id,
        userId:          row.userId,
        sessionId:       row.sessionId,
        tripId:          row.tripId,
        productType:     row.productType as SearchProductType,
        title:           row.title,
        description:     row.description,
        imageUrl:        row.imageUrl,
        sellingPrice:    row.sellingPrice,
        currency:        row.currency,
        details:         row.details as SearchResultDetails,
        supplierPayload: row.supplierPayload as Record<string, unknown>,
        expiresAt:       row.expiresAt.toISOString(),
      }
    } catch (err) {
      console.error('[search-ref] Postgres resolve error:', (err as Error).message)
      return { ok: false, reason: 'INVALID_RESULT_REFERENCE' }
    }
  }

  // ── Expiry check ───────────────────────────────────────────────────────
  if (new Date(ref.expiresAt) < new Date()) {
    return { ok: false, reason: 'SEARCH_RESULT_EXPIRED' }
  }

  // ── Ownership check ────────────────────────────────────────────────────
  const ownerMatch =
    (ref.userId    && viewer.userId    && ref.userId    === viewer.userId)    ||
    (ref.sessionId && viewer.sessionId && ref.sessionId === viewer.sessionId)

  if (!ownerMatch) {
    return { ok: false, reason: 'ACCESS_DENIED' }
  }

  return { ok: true, ref }
}

// ── Stale ref cleanup (background, called from cron if desired) ───────────────

export async function deleteExpiredRefs(): Promise<number> {
  const result = await prisma.jadeSearchRef.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  return result.count
}
