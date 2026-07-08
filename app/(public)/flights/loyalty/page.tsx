import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoyaltyDashboard } from '@/components/flights/loyalty/LoyaltyDashboard'

export const metadata: Metadata = {
  title: 'Walz Rewards — Loyalty Programme | Walz Travels',
  description: 'Earn Walz Miles on every booking. Bronze, Silver, Gold and Platinum tiers with exclusive benefits.',
}

const HOW_IT_WORKS = [
  { icon: '✈', step: '1', title: 'Book any flight', desc: 'Search and book on walztravels.com to start earning.' },
  { icon: '⭐', step: '2', title: 'Earn Walz Miles', desc: 'Earn 10 miles per £1 spent. Gold/Platinum members earn up to 2× miles.' },
  { icon: '🎁', step: '3', title: 'Redeem rewards',  desc: '100 miles = £1 off your next booking. Use miles on flights, hotels, extras.' },
]

const TIERS = [
  {
    name:       'Bronze',
    colour:     '#CD7F32',
    threshold:  0,
    multiplier: '1×',
    benefits:   ['10 miles per £1', 'Birthday bonus miles', 'Member-only deals'],
  },
  {
    name:       'Silver',
    colour:     '#9BA4B5',
    threshold:  5000,
    multiplier: '1.25×',
    benefits:   ['12.5 miles per £1', 'Priority check-in', '10% upgrade discount', 'Dedicated phone support'],
  },
  {
    name:       'Gold',
    colour:     '#C9A84C',
    threshold:  20000,
    multiplier: '1.5×',
    benefits:   ['15 miles per £1', 'Free seat selection', '25% upgrade discount', 'Lounge guest pass', 'Partner airline transfers'],
  },
  {
    name:       'Platinum',
    colour:     '#8B5CF6',
    threshold:  50000,
    multiplier: '2×',
    benefits:   ['20 miles per £1', 'Complimentary upgrades', '50% upgrade discount', 'Unlimited lounge access', 'Private concierge', 'Partner airline Gold status'],
  },
]

const PARTNERS = [
  { name: 'Qatar Airways',       programme: 'Privilege Club',   ratio: '2:1', tiers: ['Gold', 'Platinum'] },
  { name: 'British Airways',     programme: 'Executive Club',   ratio: '2:1', tiers: ['Gold', 'Platinum'] },
  { name: 'Emirates',            programme: 'Skywards',         ratio: '2:1', tiers: ['Gold', 'Platinum'] },
  { name: 'Turkish Airlines',    programme: 'Miles & Smiles',   ratio: '2:1', tiers: ['Gold', 'Platinum'] },
  { name: 'Ethiopian Airlines',  programme: 'ShebaMiles',       ratio: '2:1', tiers: ['Gold', 'Platinum'] },
  { name: 'Air Canada',          programme: 'Aeroplan',         ratio: '2:1', tiers: ['Platinum']         },
]

export default function LoyaltyPage() {
  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Hero */}
      <div className="bg-[#0B1F3A] py-20 px-4 text-center">
        <p className="text-[#C9A84C] text-xs font-semibold tracking-[0.3em] uppercase mb-4">Walz Rewards</p>
        <h1 className="font-display text-4xl lg:text-5xl font-bold text-white mb-4">
          Your loyalty, rewarded.
        </h1>
        <p className="text-white/50 text-lg max-w-lg mx-auto mb-8">
          Every booking earns Walz Miles. Climb the tiers for better perks, upgrades, and exclusive access.
        </p>
        <a href="/portal/register?enrol=rewards"
          className="inline-block px-8 py-3.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-base hover:bg-[#E8C87A] transition-all">
          Join for free →
        </a>
      </div>

      {/* Dashboard */}
      <div className="container-walz py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* How it works */}
            <div className="bg-white rounded-2xl border border-black/5 p-6">
              <h2 className="font-display font-bold text-[#0B1F3A] text-xl mb-6">How it works</h2>
              <div className="grid grid-cols-3 gap-6">
                {HOW_IT_WORKS.map(s => (
                  <div key={s.step} className="text-center">
                    <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] text-2xl flex items-center justify-center mx-auto mb-3">
                      {s.icon}
                    </div>
                    <p className="text-xs text-[#C9A84C] font-bold uppercase tracking-wider mb-1">Step {s.step}</p>
                    <p className="font-semibold text-[#0B1F3A] text-sm mb-1">{s.title}</p>
                    <p className="text-xs text-[#0B1F3A]/50 leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tier cards */}
            <div>
              <h2 className="font-display font-bold text-[#0B1F3A] text-xl mb-4">Membership tiers</h2>
              <div className="grid grid-cols-2 gap-4">
                {TIERS.map(tier => (
                  <div key={tier.name} className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                    <div className="h-2" style={{ backgroundColor: tier.colour }} />
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-bold text-lg" style={{ color: tier.colour }}>{tier.name}</p>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#0B1F3A]/5 text-[#0B1F3A]/60">
                          {tier.threshold > 0 ? `${tier.threshold.toLocaleString()}+ miles` : 'Starter'}
                        </span>
                      </div>
                      <div className="inline-block mb-3 px-2.5 py-1 rounded-lg text-xs font-bold" style={{ backgroundColor: tier.colour + '20', color: tier.colour }}>
                        {tier.multiplier} miles multiplier
                      </div>
                      <ul className="space-y-1.5">
                        {tier.benefits.map(b => (
                          <li key={b} className="flex items-start gap-2 text-xs text-[#0B1F3A]/60">
                            <span className="text-[10px] mt-0.5" style={{ color: tier.colour }}>✓</span>
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Partner airlines */}
            <div className="bg-white rounded-2xl border border-black/5 p-6">
              <h2 className="font-display font-bold text-[#0B1F3A] text-xl mb-1">Partner Airlines</h2>
              <p className="text-sm text-[#0B1F3A]/50 mb-5">Transfer Walz Miles to partner programmes (Gold & Platinum only)</p>
              <div className="space-y-3">
                {PARTNERS.map(p => (
                  <div key={p.name} className="flex items-center justify-between py-3 border-b border-black/5 last:border-0">
                    <div>
                      <p className="font-semibold text-sm text-[#0B1F3A]">{p.name}</p>
                      <p className="text-xs text-[#0B1F3A]/40">{p.programme}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[#0B1F3A] bg-[#0B1F3A]/5 px-2 py-1 rounded-lg">{p.ratio} ratio</span>
                      <div className="flex gap-1">
                        {p.tiers.map(t => (
                          <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: t === 'Platinum' ? '#8B5CF620' : '#C9A84C20', color: t === 'Platinum' ? '#8B5CF6' : '#8B6914' }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: live dashboard */}
          <aside>
            <div className="sticky top-6">
              <Suspense fallback={<div className="bg-white rounded-2xl border border-black/5 h-64 animate-pulse" />}>
                <LoyaltyDashboard variant="full" />
              </Suspense>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
