// app/dashboard/miles/page.tsx — My Walz Phase 1: Walz Miles wallet (read-only).
//
// Shows Available balance + Lifetime Earned + ledger/activity history from the
// EXISTING authoritative WalzRewardsMembership / WalzMilesTransaction tables.
// No redemption UI, no currency/monetary conversion figure, no historical
// backfill — this page only reads what already exists.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Sparkles, Award, Gift } from 'lucide-react'
import { getMilesWalletData, type MilesActivityCategory } from '@/lib/portal/miles-data'

export const dynamic = 'force-dynamic'

function categoryColor(category: MilesActivityCategory): string {
  switch (category) {
    case 'Booking Earn': return 'bg-green-500/10 text-green-400'
    case 'Bonus':        return 'bg-[#C9A84C]/10 text-[#C9A84C]'
    case 'Adjustment':   return 'bg-blue-500/10 text-blue-400'
    case 'Reversal':     return 'bg-red-500/10 text-red-400'
    case 'Expiry':       return 'bg-white/10 text-white/50'
    default:             return 'bg-white/10 text-white/50'
  }
}

export default async function MilesWalletPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/dashboard/miles')

  const wallet = await getMilesWalletData(session.user.id)

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 lg:px-8 py-8 pb-24">
      <div className="max-w-3xl">
        <Link href="/dashboard"
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <Sparkles className="w-5 h-5 text-[#C9A84C]" />
          <h1 className="text-white font-bold text-2xl">Walz Miles</h1>
        </div>

        {/* Balance hero */}
        <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 overflow-hidden mb-6">
          <div className="px-6 py-10 text-center bg-gradient-to-b from-[#C9A84C]/10 to-transparent">
            <p className="text-white/40 text-xs uppercase tracking-widest font-semibold mb-2">Available</p>
            <p className="text-5xl font-bold text-[#C9A84C]">{wallet.milesBalance.toLocaleString()}</p>
            <p className="text-white/40 text-sm mt-1">Walz Miles</p>
          </div>

          <div className="grid grid-cols-2 divide-x divide-white/5 border-t border-white/5">
            <div className="px-6 py-4 text-center">
              <p className="text-white font-bold text-lg">{wallet.lifetimeMiles.toLocaleString()}</p>
              <p className="text-white/40 text-xs mt-0.5">Lifetime Earned</p>
            </div>
            <div className="px-6 py-4 text-center">
              <p className="text-white font-bold text-lg capitalize">{wallet.enrolled ? wallet.tier : '—'}</p>
              <p className="text-white/40 text-xs mt-0.5">Status Tier</p>
            </div>
          </div>
        </div>

        {/* Zero / positive-framing state */}
        {wallet.milesBalance === 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/8 mb-6">
            <Gift className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#C9A84C]" />
            <div>
              <p className="text-sm font-semibold text-white">0 Walz Miles — for now</p>
              <p className="text-xs text-white/40 mt-0.5">Earn Walz Miles on eligible Walz bookings. Your balance updates automatically once a booking is confirmed.</p>
            </div>
          </div>
        )}

        {/* Redemption — informational only, no monetary value, no action */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[#C9A84C]/5 border border-[#C9A84C]/15 mb-6">
          <Award className="w-4 h-4 flex-shrink-0 text-[#C9A84C]" />
          <p className="text-xs text-white/50">Redemption benefits are coming soon.</p>
        </div>

        {/* Ask Jade — contextual entry point, no ownership id needed (scoped to session) */}
        <Link href="/dashboard/jade"
          className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-[#C9A84C]/10 to-[#C9A84C]/5 border border-[#C9A84C]/20 hover:border-[#C9A84C]/40 transition-all mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#C9A84C] to-[#a87e38] flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-[#0B1F3A]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Ask Jade about your Miles</p>
            <p className="text-white/40 text-xs">How Walz Miles work, or what's coming next</p>
          </div>
        </Link>

        {/* Activity */}
        <div>
          <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">
            Activity
            {wallet.activity.length > 0 && (
              <span className="ml-2 text-white/20 font-normal normal-case">{wallet.activity.length}</span>
            )}
          </h2>

          {wallet.activity.length === 0 ? (
            <p className="text-white/20 text-sm py-4">No Miles activity yet.</p>
          ) : (
            <div className="space-y-2">
              {wallet.activity.map((row, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-[#0B1F3A] border border-white/8">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${categoryColor(row.category)}`}>
                      {row.category}
                    </span>
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{row.description}</p>
                      <p className="text-white/30 text-xs">{format(new Date(row.date), 'd MMM yyyy')}</p>
                    </div>
                  </div>
                  <p className={`font-bold text-sm flex-shrink-0 ml-3 ${row.miles < 0 ? 'text-red-400' : 'text-[#C9A84C]'}`}>
                    {row.miles > 0 ? '+' : ''}{row.miles.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
