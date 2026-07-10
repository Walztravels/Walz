/**
 * POST /api/admin/esim/sync-packages
 *
 * Fetches both Airalo and eSIM Access package catalogs, matches them by
 * (locationCode, dataAmountMb, durationDays), and upserts the pairings
 * into EsimPackageMapping. Run hourly via a cron or Vercel scheduled function.
 *
 * Only exact matches (same data + same duration) are recorded — no fuzzy
 * matching. Packages that exist only on one provider get a null counterpart.
 */

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { fetchAllEsimPackages } from '@/lib/esim/api'
import { fetchAllEsimAccessPackages } from '@/lib/esimaccess'
import type { ProviderPackage } from '@/lib/esim/provider'

export const dynamic = 'force-dynamic'

type MatchKey = string  // `${locationCode}::${dataAmountMb ?? 'unlimited'}::${durationDays}`

/** -1 is the sentinel for unlimited packages (avoids NULL in a unique key) */
const UNLIMITED_SENTINEL = -1

function toDbAmount(dataAmountMb: number | null): number {
  return dataAmountMb ?? UNLIMITED_SENTINEL
}

function makeKey(p: ProviderPackage): MatchKey {
  return `${p.locationCode.toUpperCase()}::${toDbAmount(p.dataAmountMb)}::${p.durationDays}`
}

export async function POST() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 401 })

  // Fetch both catalogs in parallel
  const [airaloPackages, accessPackages] = await Promise.all([
    fetchAllEsimPackages().then(pkgs =>
      pkgs.map((p): ProviderPackage => ({
        provider:      'airalo',
        packageCode:   p.packageCode,
        name:          p.name,
        locationCode:  p.locationCode,
        locationName:  p.locationName,
        durationDays:  p.durationDays,
        dataAmountMb:  p.dataAmount,
        dataLabel:     p.dataLabel,
        dataUnit:      p.dataUnit,
        wholesaleUsd:  p.wholesaleUsd,
        isUnlimited:   p.isUnlimited ?? false,
        voice:         p.voice ?? null,
        text:          p.text  ?? null,
        planType:      p.planType,
        isFairUsagePolicy: p.isFairUsagePolicy,
        fairUsagePolicy:   p.fairUsagePolicy,
        speed:         p.speed,
      })),
    ),
    fetchAllEsimAccessPackages(),
  ])

  // Index eSIM Access packages by match key (one key may have multiple packages;
  // take the cheapest wholesale for fallback — prefer lower cost)
  const accessByKey = new Map<MatchKey, ProviderPackage>()
  for (const pkg of accessPackages) {
    const key     = makeKey(pkg)
    const current = accessByKey.get(key)
    if (!current || pkg.wholesaleUsd < current.wholesaleUsd) {
      accessByKey.set(key, pkg)
    }
  }

  const now = new Date()
  let upserted = 0
  let paired   = 0

  // Upsert one row per Airalo package
  for (const ap of airaloPackages) {
    const key    = makeKey(ap)
    const match  = accessByKey.get(key) ?? null

    const dbAmount = toDbAmount(ap.dataAmountMb)
    await prisma.esimPackageMapping.upsert({
      where: {
        locationCode_dataAmountMb_durationDays: {
          locationCode: ap.locationCode.toUpperCase(),
          dataAmountMb: dbAmount,
          durationDays: ap.durationDays,
        },
      },
      update: {
        airaloPackageId:     ap.packageCode,
        esimAccessPackageId: match?.packageCode ?? null,
        wholesaleUsdAiralo:  ap.wholesaleUsd,
        wholesaleUsdAccess:  match?.wholesaleUsd ?? null,
        lastSyncedAt:        now,
      },
      create: {
        locationCode:        ap.locationCode.toUpperCase(),
        dataAmountMb:        dbAmount,
        durationDays:        ap.durationDays,
        airaloPackageId:     ap.packageCode,
        esimAccessPackageId: match?.packageCode ?? null,
        wholesaleUsdAiralo:  ap.wholesaleUsd,
        wholesaleUsdAccess:  match?.wholesaleUsd ?? null,
        lastSyncedAt:        now,
      },
    })

    upserted++
    if (match) paired++
  }

  console.log(
    `[esim/sync] Synced ${upserted} Airalo packages; ${paired} have an eSIM Access match`,
  )

  return NextResponse.json({
    ok:      true,
    synced:  upserted,
    paired,
    unpaired: upserted - paired,
    syncedAt: now.toISOString(),
  })
}
