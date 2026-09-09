import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import {
  FX_SETTINGS_ID,
  NGN_BASE_CURRENCIES,
  getFxSettings,
  invalidateFxSettingsCache,
  getMonierateNgnRate,
  isStaleMonierateRate,
  isNgnFxEngineEnabled,
} from '@/lib/fx'

export const dynamic = 'force-dynamic'

// Company FX pricing is a commercial control — super_admin only, both to
// read the provider detail and to change anything.
async function requireSuperAdmin() {
  const session = await getAdminSession()
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (session.staffRole !== 'super_admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session }
}

interface LiveRateView {
  currency:  string
  rate:      number | null
  source:    string | null
  provider:  string | null
  fetchedAt: string | null
  sourceTimestamp: string | null
  status:    'Ready' | 'Stale' | 'Unavailable'
}

// ── GET: current settings + live Monierate view ──────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return auth.error

  const settings = await getFxSettings()
  const refresh  = req.nextUrl.searchParams.get('refresh') === '1'

  const live: LiveRateView[] = await Promise.all(
    NGN_BASE_CURRENCIES.map(async (cur): Promise<LiveRateView> => {
      try {
        const rate = await getMonierateNgnRate(cur, refresh ? 0 : settings.cacheMinutes * 60 * 1000)
        if (!rate) {
          return { currency: cur, rate: null, source: null, provider: null, fetchedAt: null, sourceTimestamp: null, status: 'Unavailable' }
        }
        return {
          currency:  cur,
          rate:      rate.rawRate.toNumber(),
          source:    rate.rateSource,
          provider:  rate.provider ?? null,
          fetchedAt: rate.fetchedAt.toISOString(),
          sourceTimestamp: rate.sourceTimestamp?.toISOString() ?? null,
          status:    isStaleMonierateRate(rate) ? 'Stale' : 'Ready',
        }
      } catch {
        return { currency: cur, rate: null, source: null, provider: null, fetchedAt: null, sourceTimestamp: null, status: 'Unavailable' }
      }
    }),
  )

  return NextResponse.json({
    settings: {
      rateMode:      settings.rateMode,
      manualRates:   settings.manualRates,
      adjustmentUsd: settings.adjustmentUsd.toFixed(2),
      cacheMinutes:  settings.cacheMinutes,
      lockMinutes:   settings.lockMinutes,
      isEnabled:     settings.isEnabled,
      updatedBy:     settings.updatedBy,
      updatedAt:     settings.updatedAt?.toISOString() ?? null,
    },
    liveRates:        live,
    engineEnabled:    isNgnFxEngineEnabled(),
    monierateConfigured: Boolean(process.env.MONIERATE_API_KEY),
    currencies:       NGN_BASE_CURRENCIES,
  })
}

// ── PUT: update settings (validated + audited) ───────────────────────────────
export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return auth.error
  const { session } = auth

  const body = await req.json().catch(() => null) as {
    rateMode?:      string
    manualRates?:   Record<string, string | number>
    adjustmentUsd?: string | number
    cacheMinutes?:  number
    lockMinutes?:   number
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  // ── Validation ─────────────────────────────────────────────────────────────
  const data: Record<string, unknown> = {}

  if (body.rateMode !== undefined) {
    if (body.rateMode !== 'AUTO_MONIERATE' && body.rateMode !== 'MANUAL') {
      return NextResponse.json({ error: 'rateMode must be AUTO_MONIERATE or MANUAL' }, { status: 400 })
    }
    data.rateMode = body.rateMode
  }

  if (body.manualRates !== undefined) {
    const clean: Record<string, string> = {}
    for (const [cur, val] of Object.entries(body.manualRates)) {
      const upper = cur.toUpperCase()
      if (!(NGN_BASE_CURRENCIES as readonly string[]).includes(upper)) {
        return NextResponse.json({ error: `Unsupported manual-rate currency: ${cur}` }, { status: 400 })
      }
      if (val === '' || val === null) continue // blank clears the rate
      let d: Prisma.Decimal
      try { d = new Prisma.Decimal(String(val)) } catch {
        return NextResponse.json({ error: `Invalid manual rate for ${upper}` }, { status: 400 })
      }
      if (!d.gt(0) || d.gt(1_000_000)) {
        return NextResponse.json({ error: `Manual rate for ${upper} out of range` }, { status: 400 })
      }
      clean[upper] = d.toString()
    }
    data.manualRates = clean
  }

  if (body.adjustmentUsd !== undefined) {
    let d: Prisma.Decimal
    try { d = new Prisma.Decimal(String(body.adjustmentUsd)) } catch {
      return NextResponse.json({ error: 'Invalid adjustmentUsd' }, { status: 400 })
    }
    if (d.lt(0) || d.gt(1_000)) {
      return NextResponse.json({ error: 'adjustmentUsd must be between 0 and 1000' }, { status: 400 })
    }
    data.adjustmentUsd = d
  }

  if (body.cacheMinutes !== undefined) {
    const n = Number(body.cacheMinutes)
    if (!Number.isInteger(n) || n < 1 || n > 1440) {
      return NextResponse.json({ error: 'cacheMinutes must be 1–1440' }, { status: 400 })
    }
    data.cacheMinutes = n
  }

  if (body.lockMinutes !== undefined) {
    const n = Number(body.lockMinutes)
    if (!Number.isInteger(n) || n < 1 || n > 1440) {
      return NextResponse.json({ error: 'lockMinutes must be 1–1440' }, { status: 400 })
    }
    data.lockMinutes = n
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    const before = await prisma.fxSettings.findUnique({ where: { id: FX_SETTINGS_ID } })
    const after  = await prisma.fxSettings.upsert({
      where:  { id: FX_SETTINGS_ID },
      create: { id: FX_SETTINGS_ID, ...data, updatedBy: session.email },
      update: { ...data, updatedBy: session.email },
    })
    invalidateFxSettingsCache()

    // Audit: who changed company FX pricing, old value, new value, when.
    await prisma.activityLog.create({
      data: {
        staffId:    session.id,
        staffName:  session.name ?? session.email,
        staffRole:  session.staffRole,
        action:     'FX: settings updated',
        module:     'settings',
        entityType: 'FxSettings',
        entityId:   FX_SETTINGS_ID,
        detail:     `Changed: ${Object.keys(data).join(', ')}`,
        before:     before ? JSON.parse(JSON.stringify(before)) : Prisma.JsonNull,
        after:      JSON.parse(JSON.stringify(after)),
      },
    }).catch(e => console.error('[fx settings] audit write failed:', e instanceof Error ? e.message : e))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[fx settings] update failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to save FX settings' }, { status: 500 })
  }
}
