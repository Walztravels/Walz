// app/dashboard/club/join/[tier]/page.tsx — Jade Travel Club Release 2B:
// customer join/upgrade flow, step 1.
//
// Server-resolved authoritative price/benefits ONLY — no hardcoded numbers
// anywhere on this page. If no ACTIVE policy exists for this tier in any
// market/currency, this renders a clean "not available yet" state rather
// than inventing a price. If more than one ACTIVE scope exists (multiple
// markets/currencies), the customer explicitly picks one — still 100%
// server-resolved, never client-priced.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ensureJadeClubMembership } from '@/lib/jade-club/membership'
import { listActivePoliciesForTier } from '@/lib/jade-club/purchase'
import { isJadeCommercialTier } from '@/lib/jade-club/commercial-types'
import { JADE_CLUB_TIER_LABELS } from '@/lib/jade-club/types'
import prisma from '@/lib/db'
import { formatCurrencyMinor } from '@/lib/currency'
import JoinCheckoutButton from './JoinCheckoutButton'

export const dynamic = 'force-dynamic'

export default async function JoinTierPage({ params }: { params: { tier: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/login?callbackUrl=/dashboard/club/join/${params.tier}`)

  const tierParam = params.tier.toUpperCase()
  if (!isJadeCommercialTier(tierParam)) notFound()

  const membership = await ensureJadeClubMembership(session.user.id)
  const policies = await listActivePoliciesForTier(tierParam)

  const tierLabel = JADE_CLUB_TIER_LABELS[tierParam]

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 lg:px-8 py-8 pb-24">
      <div className="max-w-2xl">
        <Link href="/dashboard/club"
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to Jade Travel Club
        </Link>

        <h1 className="text-white font-bold text-2xl mb-2">Join {tierLabel}</h1>

        {membership.tier === tierParam && membership.status === 'ACTIVE' ? (
          <p className="text-white/50 text-sm">You&apos;re already a {tierLabel} member.</p>
        ) : policies.length === 0 ? (
          <p className="text-white/50 text-sm">
            {tierLabel} isn&apos;t available to purchase in your market yet. Check back soon.
          </p>
        ) : (
          <div className="space-y-4 mt-6">
            {await Promise.all(policies.map(async (policy) => {
              const benefitNames = await Promise.all(policy.benefits.map(async (b) => {
                const catalog = await prisma.jadeClubBenefit.findUnique({ where: { key: b.benefitKey }, select: { name: true } })
                return { key: b.benefitKey, name: catalog?.name ?? b.benefitKey, entitlementType: b.entitlementType, countPerPeriod: b.countPerPeriod }
              }))

              return (
                <div key={policy.id} className="bg-[#0B1F3A] rounded-2xl border border-[#C9A84C]/20 p-6">
                  <div className="flex items-baseline justify-between mb-1">
                    <p className="text-white/40 text-xs uppercase tracking-widest font-semibold">{policy.market}</p>
                    <p className="text-2xl font-bold text-[#C9A84C]">
                      {formatCurrencyMinor(policy.annualPriceMinor, policy.currency)}
                      <span className="text-white/40 text-sm font-normal"> / {policy.durationMonths} months</span>
                    </p>
                  </div>
                  {benefitNames.length > 0 && (
                    <ul className="mt-4 space-y-1.5">
                      {benefitNames.map((b) => (
                        <li key={b.key} className="text-white/70 text-sm flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-[#C9A84C]" />
                          {b.name}{b.entitlementType === 'COUNT_PER_PERIOD' && b.countPerPeriod ? ` — ${b.countPerPeriod}× per period` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  {policy.serviceFeeDiscountPercent > 0 && (
                    <p className="text-white/50 text-sm mt-3">{policy.serviceFeeDiscountPercent}% off Walz service fees</p>
                  )}
                  <JoinCheckoutButton tier={tierParam} market={policy.market} currency={policy.currency} />
                </div>
              )
            }))}
          </div>
        )}
      </div>
    </div>
  )
}
