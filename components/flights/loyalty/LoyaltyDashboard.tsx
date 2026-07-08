'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams }                   from 'next/navigation'
import { useFlightStore, type LoyaltyAccount } from '@/store/flightStore'

type Variant = 'earn-preview' | 'compact' | 'full'

interface Props {
  variant:           Variant
  bookingValueGBP?:  number
  onRedeem?:         (miles: number, discountGBP: number) => void
}

const TIER_CONFIG = {
  bronze:   { label: 'Bronze',   colour: '#CD7F32', bg: 'bg-amber-50',   border: 'border-amber-200',  multiplier: 1,    threshold: 0      },
  silver:   { label: 'Silver',   colour: '#9BA4B5', bg: 'bg-slate-50',   border: 'border-slate-200',  multiplier: 1.25, threshold: 5000   },
  gold:     { label: 'Gold',     colour: '#C9A84C', bg: 'bg-yellow-50',  border: 'border-yellow-200', multiplier: 1.5,  threshold: 20000  },
  platinum: { label: 'Platinum', colour: '#8B5CF6', bg: 'bg-purple-50',  border: 'border-purple-200', multiplier: 2,    threshold: 50000  },
}

const TIER_BENEFITS: Record<string, string[]> = {
  bronze:   ['10 miles per £1 spent', 'Birthday bonus miles', 'Member discounts'],
  silver:   ['12.5 miles per £1 spent', 'Priority check-in', '10% upgrade discount', 'Dedicated support line'],
  gold:     ['15 miles per £1 spent', 'Free seat selection', '25% upgrade discount', 'Lounge guest pass', 'Partner airline transfers'],
  platinum: ['20 miles per £1 spent', 'Complimentary upgrades', '50% upgrade discount', 'Unlimited lounge access', 'Private concierge', 'Partner airline Gold status'],
}

function TierBadge({ tier, size = 'sm' }: { tier: string; size?: 'sm' | 'lg' }) {
  const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze
  const sz = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[10px]'
  return (
    <span className={`inline-flex items-center gap-1 ${sz} rounded-full font-bold border ${config.bg} ${config.border}`}
      style={{ color: config.colour }}>
      ★ {config.label}
    </span>
  )
}

function ProgressBar({ miles, nextThreshold, colour }: { miles: number; nextThreshold: number; colour: string }) {
  const pct = nextThreshold > 0 ? Math.min(100, (miles / nextThreshold) * 100) : 100
  return (
    <div className="w-full h-1.5 bg-[#0B1F3A]/10 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: colour }} />
    </div>
  )
}

function EnrolButton({ onEnrol }: { onEnrol: () => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const handle = async () => {
    setState('loading')
    try {
      const res = await fetch('/api/rewards/membership', { method: 'POST' })
      if (res.ok) { setState('done'); onEnrol() }
      else setState('error')
    } catch { setState('error') }
  }
  if (state === 'done') return (
    <div className="mt-3 text-center text-sm font-semibold text-green-600">✓ Welcome to Walz Rewards!</div>
  )
  return (
    <button onClick={handle} disabled={state === 'loading'}
      className="mt-3 block w-full text-center px-4 py-2 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold hover:bg-[#E8C87A] transition-all disabled:opacity-50">
      {state === 'loading' ? 'Enrolling…' : state === 'error' ? 'Try again' : 'Join Walz Rewards — it\'s free'}
    </button>
  )
}

function EarnPreview({ bookingValueGBP, account }: { bookingValueGBP: number; account: LoyaltyAccount }) {
  const config    = TIER_CONFIG[account.tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze
  const earnRate  = account.multiplier * 10
  const milesEarning = Math.round(bookingValueGBP * earnRate)

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${config.bg} ${config.border}`}>
      <div className="text-xl">✈</div>
      <div className="flex-1">
        <p className="text-[11px] text-[#0B1F3A]/50 font-medium">Walz Miles · {config.label} Member</p>
        <p className="text-sm font-bold" style={{ color: config.colour }}>
          Earn +{milesEarning.toLocaleString()} miles on this booking
        </p>
      </div>
      {!account.enrolled && (
        <a href={account.isGuest ? '/portal/register?enrol=rewards' : '#enrol'}
          className="text-[11px] font-semibold text-[#C9A84C] hover:underline whitespace-nowrap">
          Join free →
        </a>
      )}
    </div>
  )
}

function CompactCard({ account, onEnrol }: { account: LoyaltyAccount; onEnrol: () => void }) {
  const config     = TIER_CONFIG[account.tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze
  const nextConfig = account.nextTier ? TIER_CONFIG[account.nextTier as keyof typeof TIER_CONFIG] : null
  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] text-[#0B1F3A]/40 font-medium uppercase tracking-wider">Walz Miles</p>
          <p className="text-2xl font-bold" style={{ color: config.colour }}>{account.miles.toLocaleString()}</p>
        </div>
        <TierBadge tier={account.tier} size="lg" />
      </div>

      {account.nextTier && nextConfig && (
        <div className="mt-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] text-[#0B1F3A]/50">{account.milesNextTier.toLocaleString()} miles to {nextConfig.label}</span>
          </div>
          <ProgressBar miles={account.miles} nextThreshold={nextConfig.threshold} colour={config.colour} />
        </div>
      )}

      {account.enrolled && (
        <a href="/flights/loyalty" className="mt-3 block text-center text-[12px] font-semibold text-[#C9A84C] hover:underline">
          View full loyalty account →
        </a>
      )}
      {!account.enrolled && account.isGuest && (
        <a href="/portal/register?enrol=rewards"
          className="mt-3 block text-center px-4 py-2 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold hover:bg-[#E8C87A] transition-all">
          Join Walz Rewards — it's free
        </a>
      )}
      {!account.enrolled && !account.isGuest && (
        <EnrolButton onEnrol={onEnrol} />
      )}
    </div>
  )
}

const REDEEM_OPTIONS = [
  { miles: 5000,  discountGBP: 50,  label: '5,000 miles', value: '£50 off' },
  { miles: 10000, discountGBP: 100, label: '10,000 miles', value: '£100 off' },
  { miles: 20000, discountGBP: 200, label: '20,000 miles', value: '£200 off' },
]

function FullDashboard({ account, onRedeem, onEnrol }: { account: LoyaltyAccount; onRedeem?: Props['onRedeem']; onEnrol: () => void }) {
  const config     = TIER_CONFIG[account.tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze
  const nextConfig = account.nextTier ? TIER_CONFIG[account.nextTier as keyof typeof TIER_CONFIG] : null

  return (
    <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
      {/* Balance header */}
      <div className="bg-[#0B1F3A] px-6 py-8 text-center">
        <TierBadge tier={account.tier} size="lg" />
        <p className="mt-3 text-5xl font-bold" style={{ color: config.colour }}>{account.miles.toLocaleString()}</p>
        <p className="text-white/50 text-sm mt-1">Walz Miles balance</p>

        {account.nextTier && nextConfig && (
          <div className="mt-4 max-w-xs mx-auto">
            <div className="flex justify-between text-[11px] text-white/40 mb-1">
              <span>{account.tier}</span>
              <span>{account.nextTier}</span>
            </div>
            <ProgressBar miles={account.miles} nextThreshold={nextConfig.threshold} colour={config.colour} />
            <p className="text-[11px] text-white/40 mt-1">{account.milesNextTier.toLocaleString()} miles to {nextConfig.label}</p>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Benefits */}
        <div>
          <p className="text-xs font-bold text-[#0B1F3A]/40 uppercase tracking-wider mb-3">{config.label} Benefits</p>
          <div className="space-y-2">
            {(TIER_BENEFITS[account.tier] ?? []).map((b, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: config.colour + '20' }}>
                  <span className="text-[10px]" style={{ color: config.colour }}>✓</span>
                </div>
                <span className="text-sm text-[#0B1F3A]/70">{b}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Redeem */}
        {account.enrolled && onRedeem && (
          <div>
            <p className="text-xs font-bold text-[#0B1F3A]/40 uppercase tracking-wider mb-3">Redeem Miles</p>
            <div className="space-y-2">
              {REDEEM_OPTIONS.filter(o => o.miles <= account.miles).map((opt) => (
                <button key={opt.miles} type="button"
                  onClick={() => onRedeem(opt.miles, opt.discountGBP)}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-[#C9A84C]/30 hover:bg-[#C9A84C]/5 transition-all text-left">
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">{opt.label}</p>
                    <p className="text-[11px] text-[#0B1F3A]/50">= {opt.value} discount</p>
                  </div>
                  <span className="text-sm font-bold text-[#C9A84C]">Redeem →</span>
                </button>
              ))}
              {REDEEM_OPTIONS.every(o => o.miles > account.miles) && (
                <p className="text-sm text-[#0B1F3A]/40 text-center py-4">Book more to earn redeemable miles</p>
              )}
            </div>
          </div>
        )}

        {!account.enrolled && account.isGuest && (
          <a href="/portal/register?enrol=rewards"
            className="block w-full text-center py-3 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] transition-all">
            Join Walz Rewards — it's free
          </a>
        )}
        {!account.enrolled && !account.isGuest && (
          <EnrolButton onEnrol={onEnrol} />
        )}
      </div>
    </div>
  )
}

export function LoyaltyDashboard({ variant, bookingValueGBP = 0, onRedeem }: Props) {
  const { loyalty, setLoyalty } = useFlightStore()
  const searchParams = useSearchParams()

  const refreshAccount = useCallback(() => {
    fetch('/api/flights/loyalty')
      .then(r => r.json())
      .then(d => d.account && setLoyalty(d.account))
      .catch(() => {})
  }, [setLoyalty])

  useEffect(() => {
    // Always re-fetch on mount (session state may differ from cached store)
    refreshAccount()
  }, []) // eslint-disable-line

  // Auto-enrol when landing with ?join=1 (redirected here from register page)
  useEffect(() => {
    if (searchParams?.get('join') !== '1') return
    fetch('/api/rewards/membership', { method: 'POST' })
      .then(r => r.json())
      .then(() => refreshAccount())
      .catch(() => {})
  }, [searchParams]) // eslint-disable-line

  const account: LoyaltyAccount = loyalty ?? {
    isGuest:       true,
    enrolled:      false,
    miles:         0,
    tier:          'bronze',
    nextTier:      'silver',
    milesNextTier: 5000,
    recentActivity: [],
    multiplier:    1,
  }

  if (variant === 'earn-preview') return <EarnPreview bookingValueGBP={bookingValueGBP} account={account} />
  if (variant === 'compact')     return <CompactCard account={account} onEnrol={refreshAccount} />
  return <FullDashboard account={account} onRedeem={onRedeem} onEnrol={refreshAccount} />
}
