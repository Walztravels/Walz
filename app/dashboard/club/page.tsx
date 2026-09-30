// app/dashboard/club/page.tsx — Jade Travel Club Phase 1: customer home.
//
// Extends My Walz (does not replace it). Reads:
//   - Membership via lib/jade-club/membership.ts (lazily created, FREE by default)
//   - Walz Miles via the EXISTING lib/portal/miles-data.ts reader (read-only,
//     never recalculated here — see that module's own header for the rules)
//   - Benefits via lib/jade-club/benefits.ts (Walz + Partner catalog)
//
// No prices are ever shown for CLUB/CLUB_PLUS — "Coming Soon" only. No
// purchase button exists anywhere on this page.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Gem, ConciergeBell, CreditCard, Plane, ShieldCheck, Gift, Award, Lock } from 'lucide-react'
import { ensureJadeClubMembership } from '@/lib/jade-club/membership'
import { listActiveBenefits } from '@/lib/jade-club/benefits'
import { getMilesWalletData } from '@/lib/portal/miles-data'
import { listActivePoliciesForTier } from '@/lib/jade-club/purchase'
import { JADE_CLUB_TIER_LABELS, JADE_CLUB_STATUS_LABELS } from '@/lib/jade-club/types'

export const dynamic = 'force-dynamic'

export default async function JadeClubPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/dashboard/club')

  const userId = session.user.id

  const [membership, miles, clubPolicies, clubPlusPolicies] = await Promise.all([
    ensureJadeClubMembership(userId),
    getMilesWalletData(userId),
    listActivePoliciesForTier('CLUB'),
    listActivePoliciesForTier('CLUB_PLUS'),
  ])
  const benefits = await listActiveBenefits(membership.tier)
  // A tier is "purchasable" only when an admin has actually activated a
  // commercial policy for it — never assumed, never hardcoded. Zero ACTIVE
  // policies for a tier means it stays gated, exactly as it was before 2B.
  const clubAvailable = clubPolicies.length > 0
  const clubPlusAvailable = clubPlusPolicies.length > 0

  const walzBenefits    = benefits.filter(b => b.category === 'WALZ')
  const partnerBenefits = benefits.filter(b => b.category === 'PARTNER')

  const tierLabel   = JADE_CLUB_TIER_LABELS[membership.tier]
  const statusLabel = JADE_CLUB_STATUS_LABELS[membership.status]

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 lg:px-8 py-8 pb-24">
      <div className="max-w-3xl">
        <Link href="/dashboard"
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Gem className="w-5 h-5 text-[#C9A84C]" />
          <h1 className="text-white font-bold text-2xl">Jade Travel Club</h1>
        </div>
        <p className="text-white/40 text-sm mb-8">
          Your Walz Travels membership and benefits programme.
        </p>

        {/* ── Your Membership ─────────────────────────── */}
        <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 overflow-hidden mb-6">
          <div className="px-6 py-8 text-center bg-gradient-to-b from-[#C9A84C]/10 to-transparent">
            <p className="text-white/40 text-xs uppercase tracking-widest font-semibold mb-2">Your Membership</p>
            <p className="text-3xl font-bold text-[#C9A84C]">{tierLabel}</p>
            {membership.tier !== 'FREE' && (
              <span className="inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/70">
                {statusLabel}
                {membership.expiresAt && ` · Valid through ${format(new Date(membership.expiresAt), 'd MMM yyyy')}`}
              </span>
            )}
          </div>
          <div className="px-6 py-4 border-t border-white/5 text-center">
            <p className="text-white/40 text-xs">
              Member since {format(new Date(membership.startedAt), 'MMMM yyyy')}
            </p>
          </div>
        </div>

        {/* ── Digital Jade Card ────────────────────────── */}
        <Link href="/dashboard/club/card"
          className="flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-[#0B1F3A] to-[#0B1F3A]/70 border border-[#C9A84C]/20 hover:border-[#C9A84C]/40 transition-all mb-6 group">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#C9A84C] to-[#a87e38] flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-5 h-5 text-[#0B1F3A]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Your Digital Jade Card</p>
            <p className="text-white/40 text-xs mt-0.5">Membership ID {membership.memberCode} · View &amp; verify</p>
          </div>
          <span className="flex-shrink-0 px-3 py-1.5 bg-white/8 border border-white/15 text-white text-xs font-bold rounded-lg group-hover:bg-white/12 transition-colors">
            View Card
          </span>
        </Link>

        {/* ── Tiers ────────────────────────────────────── */}
        <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Membership Tiers</h2>
        <div className="grid sm:grid-cols-3 gap-3 mb-8">
          <TierTile label="Jade Free" active={membership.tier === 'FREE'} description="Every Walz customer's starting membership." />
          <TierTile
            label="Jade Club" active={membership.tier === 'CLUB'}
            comingSoon={membership.tier !== 'CLUB' && !clubAvailable}
            joinHref={membership.tier !== 'CLUB' && clubAvailable ? '/dashboard/club/join/club' : undefined}
            description="Enhanced member benefits."
          />
          <TierTile
            label="Jade Club+" active={membership.tier === 'CLUB_PLUS'}
            comingSoon={membership.tier !== 'CLUB_PLUS' && !clubPlusAvailable}
            joinHref={membership.tier !== 'CLUB_PLUS' && clubPlusAvailable ? '/dashboard/club/join/club_plus' : undefined}
            description="Our most premium tier."
          />
        </div>

        {/* ── Walz Miles (read-only) ──────────────────── */}
        <Card title="Walz Miles" icon={<Award className="w-4 h-4 text-[#C9A84C]" />} viewAll="/dashboard/miles">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-[#C9A84C]">{miles.milesBalance.toLocaleString()}</p>
              <p className="text-white/40 text-xs mt-1">Available Walz Miles — a separate rewards ledger from your Club membership.</p>
            </div>
          </div>
        </Card>

        {/* ── Walz Benefits ────────────────────────────── */}
        <div className="mt-6">
          <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Walz Benefits</h2>
          <div className="space-y-2">
            {walzBenefits.map(b => <BenefitRow key={b.key} benefit={b} />)}
          </div>
        </div>

        {/* ── Partner Benefits ─────────────────────────── */}
        <div className="mt-6">
          <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Partner Benefits</h2>
          <div className="space-y-2">
            {partnerBenefits.length === 0 ? (
              <p className="text-white/20 text-sm py-2">No partner benefits configured yet.</p>
            ) : partnerBenefits.map(b => <BenefitRow key={b.key} benefit={b} />)}
          </div>
        </div>

        {/* ── Physical Jade Card ───────────────────────── */}
        <div className="mt-6 flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/8">
          <div className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-4 h-4 text-white/50" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Physical Jade Card</p>
            <p className="text-white/40 text-xs mt-0.5">A physical membership card is coming soon.</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/10 text-white/50 flex-shrink-0">Coming Soon</span>
        </div>

        {/* ── Ask Jade ─────────────────────────────────── */}
        <Link href="/dashboard/jade?club=1"
          className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-[#C9A84C]/10 to-[#C9A84C]/5 border border-[#C9A84C]/20 hover:border-[#C9A84C]/40 transition-all mt-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#C9A84C] to-[#a87e38] flex items-center justify-center flex-shrink-0">
            <ConciergeBell className="w-4 h-4 text-[#0B1F3A]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Ask Jade about Jade Travel Club</p>
            <p className="text-white/40 text-xs">What membership includes, and what's coming next</p>
          </div>
        </Link>
      </div>
    </div>
  )
}

function TierTile({ label, active, comingSoon, joinHref, description }: { label: string; active: boolean; comingSoon?: boolean; joinHref?: string; description: string }) {
  return (
    <div className={`rounded-xl border p-4 ${active ? 'bg-[#C9A84C]/10 border-[#C9A84C]/30' : 'bg-white/5 border-white/8'}`}>
      <div className="flex items-center justify-between mb-1">
        <p className={`font-bold text-sm ${active ? 'text-[#C9A84C]' : 'text-white'}`}>{label}</p>
        {active && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C9A84C] text-[#0B1F3A]">Current</span>}
        {comingSoon && !active && <Lock className="w-3 h-3 text-white/25" />}
      </div>
      <p className="text-white/40 text-xs">{description}</p>
      {comingSoon && !active && (
        <span className="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/50">Coming Soon</span>
      )}
      {joinHref && !active && (
        <Link href={joinHref} className="inline-block mt-2 text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#C9A84C] text-[#0B1F3A] hover:opacity-90 transition-opacity">
          Join
        </Link>
      )}
    </div>
  )
}

function BenefitRow({ benefit }: { benefit: { name: string; provider: string | null; description: string | null; status: string; eligibleForViewer: boolean } }) {
  const statusBadge = benefit.status === 'ACTIVE'
    ? { label: 'Included', cls: 'bg-green-500/10 text-green-400' }
    : { label: 'Coming Soon', cls: 'bg-white/10 text-white/50' }
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/8">
      <div className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center flex-shrink-0">
        {benefit.name.toLowerCase().includes('lounge') ? <Plane className="w-4 h-4 text-white/50" /> : <Gift className="w-4 h-4 text-white/50" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm">{benefit.name}</p>
        {benefit.description && <p className="text-white/40 text-xs mt-0.5">{benefit.description}</p>}
        {benefit.provider && <p className="text-white/25 text-xs mt-0.5">Provider: {benefit.provider}</p>}
      </div>
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${benefit.status === 'ACTIVE' && !benefit.eligibleForViewer ? 'bg-white/10 text-white/40' : statusBadge.cls}`}>
        {benefit.status === 'ACTIVE' && !benefit.eligibleForViewer ? 'Requires higher tier' : statusBadge.label}
      </span>
    </div>
  )
}

function Card({ title, icon, viewAll, children }: { title: string; icon: React.ReactNode; viewAll?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-bold text-white text-base">{title}</h2>
        </div>
        {viewAll && <Link href={viewAll} className="text-xs text-[#C9A84C] font-semibold hover:underline">View Wallet →</Link>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}
