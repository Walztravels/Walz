'use client'

import { useState } from 'react'
import { Star, TrendingUp, Users, Award, ChevronRight, Gift, Zap } from 'lucide-react'

const TIERS = [
  { name: 'Bronze',   threshold: 0,      mult: 1.0,  color: '#CD7F32', members: 2841, perks: ['10 miles/£1', 'Birthday bonus', 'Member deals'] },
  { name: 'Silver',   threshold: 5000,   mult: 1.25, color: '#94A3B8', members: 634,  perks: ['12.5 miles/£1', 'Priority check-in', 'Phone support'] },
  { name: 'Gold',     threshold: 20000,  mult: 1.5,  color: '#C9A84C', members: 218,  perks: ['15 miles/£1', 'Free seat select', 'Lounge guest pass'] },
  { name: 'Platinum', threshold: 50000,  mult: 2.0,  color: '#8B5CF6', members: 47,   perks: ['20 miles/£1', 'Upgrades', 'Private concierge'] },
]

const RECENT_ACTIVITY = [
  { client: 'Amara Osei', action: 'Earned 6,800 Jade Miles', route: 'LHR→LOS', tier: 'Silver', time: '2 hours ago', miles: +6800 },
  { client: 'James Walton', action: 'Redeemed 10,000 Jade Miles', route: 'LHR→DXB', tier: 'Gold', time: '4 hours ago', miles: -10000 },
  { client: 'Fatima Al-Hassan', action: 'Upgraded to Gold', route: 'YYZ→LOS', tier: 'Gold', time: '6 hours ago', miles: +12500 },
  { client: 'David Mensah', action: 'Earned 3,200 Jade Miles', route: 'LHR→ACC', tier: 'Bronze', time: '8 hours ago', miles: +3200 },
  { client: 'Sophie Hargreaves', action: 'Redeemed 5,000 Jade Miles', route: 'LHR→JFK', tier: 'Silver', time: '12 hours ago', miles: -5000 },
  { client: 'Kelechi Nwosu', action: 'Earned 18,400 Jade Miles', route: 'LHR→LOS Business', tier: 'Silver', time: '1 day ago', miles: +18400 },
]

const PARTNER_AIRLINES = [
  { name: 'Qatar Airways',    programme: 'Privilege Club',  ratio: '2:1', eligible: ['Gold', 'Platinum'] },
  { name: 'British Airways',  programme: 'Executive Club',  ratio: '2:1', eligible: ['Gold', 'Platinum'] },
  { name: 'Emirates',         programme: 'Skywards',        ratio: '2:1', eligible: ['Gold', 'Platinum'] },
  { name: 'Turkish Airlines', programme: 'Miles & Smiles',  ratio: '2:1', eligible: ['Gold', 'Platinum'] },
  { name: 'Air Canada',       programme: 'Aeroplan',        ratio: '2:1', eligible: ['Platinum'] },
]

type Tab = 'overview' | 'members' | 'partners' | 'settings'

const TIER_COLOR: Record<string, string> = {
  Bronze: '#CD7F32', Silver: '#94A3B8', Gold: '#C9A84C', Platinum: '#8B5CF6',
}

export default function JadeMilesAdminPage() {
  const [tab, setTab] = useState<Tab>('overview')

  const totalMembers   = TIERS.reduce((s, t) => s + t.members, 0)
  const totalMilesOut  = 42_650_000
  const milesRedeemed  = 11_200_000
  const avgMilesPerMember = Math.round(totalMilesOut / totalMembers)

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#C9A84C] to-[#8B6914] flex items-center justify-center shadow-md shadow-[#C9A84C]/30">
              <span className="text-[#0B1F3A] font-bold text-sm">J</span>
            </div>
            <h1 className="text-2xl font-bold text-[#0B1F3A]">Jade Miles</h1>
          </div>
          <p className="text-gray-500 text-sm">Manage the Walz Travels loyalty programme — tiers, members, redemptions and partner transfers.</p>
        </div>
        <a href="/flights/loyalty" target="_blank"
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#0B1F3A]/10 text-sm font-medium text-[#0B1F3A] hover:border-[#C9A84C]/40 hover:text-[#C9A84C] transition-all">
          View public page
          <ChevronRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-8 w-fit">
        {(['overview', 'members', 'partners', 'settings'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-gray-500 hover:text-[#0B1F3A]'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Members',      value: totalMembers.toLocaleString(),           icon: Users,      color: '#3B82F6' },
              { label: 'Miles Outstanding',  value: `${(totalMilesOut / 1_000_000).toFixed(1)}M`,  icon: Star,       color: '#C9A84C' },
              { label: 'Miles Redeemed',     value: `${(milesRedeemed / 1_000_000).toFixed(1)}M`,  icon: Gift,       color: '#10B981' },
              { label: 'Avg Miles/Member',   value: avgMilesPerMember.toLocaleString(),       icon: TrendingUp, color: '#8B5CF6' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-400 font-medium">{label}</p>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-[#0B1F3A]">{value}</p>
              </div>
            ))}
          </div>

          {/* Tier breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-bold text-[#0B1F3A] mb-5">Tier Breakdown</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {TIERS.map(tier => (
                <div key={tier.name} className="rounded-2xl border p-5" style={{ borderColor: `${tier.color}25`, backgroundColor: `${tier.color}08` }}>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-bold text-base" style={{ color: tier.color }}>{tier.name}</span>
                    <span className="text-xs font-bold bg-white/70 px-2 py-0.5 rounded-full text-gray-500">
                      {tier.threshold > 0 ? `${tier.threshold.toLocaleString()}+` : 'Starter'}
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-[#0B1F3A] mb-1">{tier.members.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mb-4">members · {tier.mult}× multiplier</p>
                  <div className="space-y-1">
                    {tier.perks.map(p => (
                      <p key={p} className="text-[11px] text-gray-500 flex items-center gap-1.5">
                        <span style={{ color: tier.color }}>✓</span> {p}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Progress bar visualization */}
            <div className="mt-6 pt-5 border-t border-gray-50">
              <p className="text-xs text-gray-400 mb-3 font-medium">Member distribution</p>
              <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                {TIERS.map(t => (
                  <div key={t.name} className="rounded-full transition-all"
                    style={{ backgroundColor: t.color, width: `${(t.members / totalMembers) * 100}%` }}
                    title={`${t.name}: ${t.members}`}
                  />
                ))}
              </div>
              <div className="flex gap-4 mt-2">
                {TIERS.map(t => (
                  <div key={t.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="text-[10px] text-gray-400">{t.name} ({Math.round((t.members / totalMembers) * 100)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent activity */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50">
              <h2 className="font-bold text-[#0B1F3A]">Recent Miles Activity</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {RECENT_ACTIVITY.map((a, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ backgroundColor: TIER_COLOR[a.tier] ?? '#CBD5E1' }}>
                    {a.client.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0B1F3A] leading-none truncate">{a.client}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.action} · {a.route}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${a.miles > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {a.miles > 0 ? '+' : ''}{a.miles.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{a.time}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ color: TIER_COLOR[a.tier], backgroundColor: `${TIER_COLOR[a.tier]}15` }}>
                    {a.tier}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MEMBERS TAB ── */}
      {tab === 'members' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-[#0B1F3A]">All Jade Miles Members</h2>
            <div className="flex items-center gap-3">
              <input placeholder="Search members…" className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C] w-48" />
              <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                <option>All tiers</option>
                {TIERS.map(t => <option key={t.name}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {RECENT_ACTIVITY.map((a, i) => (
              <div key={i} className="flex items-center gap-4 py-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: TIER_COLOR[a.tier] ?? '#CBD5E1' }}>
                  {a.client.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#0B1F3A]">{a.client}</p>
                  <p className="text-xs text-gray-400">{a.route} · Last activity {a.time}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ color: TIER_COLOR[a.tier], backgroundColor: `${TIER_COLOR[a.tier]}15` }}>
                  {a.tier}
                </span>
                <p className="text-sm font-bold text-[#0B1F3A]">
                  {Math.abs(a.miles).toLocaleString()} miles
                </p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-4 pt-4 border-t border-gray-50">
            Showing 6 of {totalMembers.toLocaleString()} members. Connect database to load all members.
          </p>
        </div>
      )}

      {/* ── PARTNERS TAB ── */}
      {tab === 'partners' && (
        <div className="space-y-5">
          <div className="bg-[#0B1F3A] rounded-2xl p-6 text-white">
            <div className="flex items-center gap-3 mb-3">
              <Award className="w-5 h-5 text-[#C9A84C]" />
              <h2 className="font-bold">Partner Airline Programme</h2>
            </div>
            <p className="text-white/50 text-sm leading-relaxed max-w-xl">
              Gold and Platinum Jade Miles members can transfer their miles to partner airline loyalty programmes.
              The standard transfer ratio is 2:1 (2 Jade Miles = 1 partner mile).
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {PARTNER_AIRLINES.map((p, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-5">
                  <div className="w-10 h-10 rounded-xl bg-[#0B1F3A]/4 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-4 h-4 text-[#0B1F3A]/40" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[#0B1F3A] text-sm">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.programme}</p>
                  </div>
                  <div className="text-center flex-shrink-0">
                    <p className="text-xs text-gray-400 mb-0.5">Transfer ratio</p>
                    <p className="text-sm font-bold text-[#0B1F3A]">{p.ratio}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {p.eligible.map(e => (
                      <span key={e} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ color: TIER_COLOR[e], backgroundColor: `${TIER_COLOR[e]}18` }}>
                        {e}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-green-600 flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-xs font-medium">Active</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {tab === 'settings' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-bold text-[#0B1F3A] mb-5">Programme Settings</h2>
            <div className="space-y-5 max-w-lg">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Earn rate (miles per £1 spent)</label>
                <input type="number" defaultValue={10} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Redemption rate (miles per £1 discount)</label>
                <input type="number" defaultValue={100} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Silver threshold (miles)</label>
                  <input type="number" defaultValue={5000} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Gold threshold (miles)</label>
                  <input type="number" defaultValue={20000} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Platinum threshold (miles)</label>
                <input type="number" defaultValue={50000} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
              </div>
              <div className="flex items-center gap-3 py-3 px-4 bg-amber-50 rounded-xl border border-amber-100">
                <Star className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
                <p className="text-xs text-amber-800">Changes to earn/redeem rates take effect on new bookings only. Existing balances are not affected.</p>
              </div>
              <button className="w-full bg-[#0B1F3A] text-white font-bold py-3 rounded-xl hover:bg-[#152D52] transition-colors text-sm">
                Save Programme Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
