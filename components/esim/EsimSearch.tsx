'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Search, X, ArrowRight, MessageCircle, Check } from 'lucide-react'
import type { EsimPackage, CountryGroup } from '@/lib/esim/types'
import { groupByCountry, REGIONS } from '@/lib/esim/utils'

const REGION_ORDER  = ['All', 'Europe', 'Asia', 'Americas', 'Middle East', 'Africa', 'Oceania', 'Global']
const POPULAR_CODES = ['GB', 'AE', 'CA', 'FR', 'US', 'JP', 'NG', 'GH', 'TH', 'DE']

// ── Success overlay (for ?paid=1 redirect from Flutterwave / 3DS) ─────────────
function SuccessOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    ;(async () => {
      try {
        const confetti = (await import('canvas-confetti')).default
        const opts = { spread: 90, ticks: 100, gravity: 1.2, decay: 0.94, startVelocity: 40,
          colors: ['#C9A84C','#FFD700','#0B1F3A','#FFFFFF'] }
        confetti({ ...opts, origin: { x: 0.3, y: 0.5 }, particleCount: 60 })
        setTimeout(() => confetti({ ...opts, origin: { x: 0.7, y: 0.5 }, particleCount: 60 }), 150)
        setTimeout(() => confetti({ ...opts, origin: { x: 0.5, y: 0.3 }, particleCount: 80 }), 300)
      } catch { /* no-op */ }
    })()
  }, [])

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-white rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5 border-4 border-green-400">
          <Check className="w-10 h-10 text-green-600" />
        </div>
        <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.2em] uppercase mb-2">📶 Jade Connect</p>
        <h2 className="font-display font-bold text-[#0B1F3A] text-2xl mb-2">You&apos;re connected!</h2>
        <p className="text-[#0B1F3A]/55 text-sm leading-relaxed mb-7">
          Your eSIM QR code is on its way to your email. Activate before you land.
        </p>
        <div className="space-y-3">
          <a href="/portal/esims"
            className="block w-full py-3.5 text-center font-bold text-sm rounded-full hover:opacity-90 transition-opacity"
            style={{ background: '#C9A84C', color: '#0B1F3A' }}>
            View My eSIMs
          </a>
          <button onClick={onClose}
            className="block w-full py-3 text-[#0B1F3A]/50 text-sm hover:text-[#0B1F3A] transition-colors">
            Buy another eSIM
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Country card (Airalo-style — links to dedicated country page) ──────────────
function CountryCard({ group }: { group: CountryGroup }) {
  return (
    <Link
      href={`/esim/${group.code.toLowerCase()}`}
      className="block text-center p-5 rounded-2xl bg-white transition-all duration-200"
      style={{ border: '1px solid #E9E6E0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.borderColor = '#C9A84C'
        el.style.boxShadow   = '0 4px 16px rgba(201,168,76,0.14)'
        el.style.transform   = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.borderColor = '#E9E6E0'
        el.style.boxShadow   = '0 1px 4px rgba(0,0,0,0.05)'
        el.style.transform   = 'translateY(0)'
      }}
    >
      <span className="block text-4xl mb-3 leading-none">{group.flag}</span>
      <p className="font-semibold text-[#0D1B2A] text-[13px] mb-1 leading-tight">{group.name}</p>
      <p className="text-[#9CA3AF] text-[11px] mb-2">
        {group.packages.length} plan{group.packages.length !== 1 ? 's' : ''}
      </p>
      <p className="font-bold text-[#C9A84C] text-[13px]">from ${group.minPrice.toFixed(2)}</p>
    </Link>
  )
}

// ── MAIN ESIM SEARCH ──────────────────────────────────────────────────────────
export function EsimSearch({ packages }: { packages: EsimPackage[] }) {
  const searchParams = useSearchParams()

  const [query,        setQuery]        = useState('')
  const [region,       setRegion]       = useState('All')
  const [showSuccess,  setShowSuccess]  = useState(false)
  const [livePackages, setLivePackages] = useState<EsimPackage[]>(packages)
  const fetchedRef = useRef(false)

  // Hero search pre-fill
  useEffect(() => {
    const q = sessionStorage.getItem('esim-hero-q')
    if (q) { setQuery(q); sessionStorage.removeItem('esim-hero-q') }
  }, [])

  // Paid redirect (Flutterwave / 3DS returning to /esim?paid=1)
  useEffect(() => {
    if (searchParams.get('paid') === '1') setShowSuccess(true)
  }, [searchParams])

  // Client-side fallback fetch (if ISR returned 0 packages)
  useEffect(() => {
    if (packages.length > 0 || fetchedRef.current) return
    fetchedRef.current = true
    Promise.allSettled(
      POPULAR_CODES.map(iso2 =>
        fetch(`/api/esim/packages?country=${iso2}`)
          .then(r => r.json())
          .then((d: { packages?: EsimPackage[] }) => d.packages ?? [])
          .catch(() => [])
      )
    ).then(results => {
      const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
      if (all.length) setLivePackages(all)
    })
  }, [packages])

  const allGroups = useMemo(() => groupByCountry(livePackages), [livePackages])

  const filtered = useMemo(() => {
    let groups = allGroups
    if (region !== 'All') {
      const codes = REGIONS[region] ?? []
      groups = region === 'Global'
        ? groups.filter(g => !Object.values(REGIONS).flat().includes(g.code))
        : groups.filter(g => codes.includes(g.code))
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      groups = groups.filter(g => g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q))
    }
    return groups
  }, [allGroups, region, query])

  const popularGroups = useMemo(
    () => POPULAR_CODES.map(code => allGroups.find(g => g.code === code)).filter(Boolean) as CountryGroup[],
    [allGroups]
  )

  const showingAll    = query !== '' || region !== 'All'
  const displayGroups = showingAll ? filtered : popularGroups

  return (
    <section id="esim-search" style={{ background: '#F5F4F0' }}>

      {/* ── Sticky search + region tabs ── */}
      <div className="sticky top-0 z-20 bg-white"
        style={{ borderBottom: '1px solid #E9E6E0', boxShadow: '0 1px 0 rgba(0,0,0,0.03)' }}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-4 pb-0">

          {/* Search input */}
          <div className="relative max-w-lg mb-3">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search destination or country code…"
              className="w-full h-11 pl-10 pr-10 rounded-xl text-sm text-[#0D1B2A] placeholder:text-[#9CA3AF] outline-none transition-colors"
              style={{ border: '1.5px solid #E9E6E0', background: '#F5F4F0' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#C9A84C'; e.currentTarget.style.background = '#fff' }}
              onBlur={e  => { e.currentTarget.style.borderColor = '#E9E6E0'; e.currentTarget.style.background = '#F5F4F0' }}
            />
            {query && (
              <button onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Region tabs */}
          <div className="flex gap-0.5 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', paddingBottom: 1 }}>
            {REGION_ORDER.map(r => (
              <button key={r} onClick={() => setRegion(r)}
                className="flex-shrink-0 px-3.5 py-2.5 rounded-t-lg text-xs font-semibold transition-all"
                style={{
                  background:   region === r ? '#F5F4F0' : 'transparent',
                  color:        region === r ? '#0B1F3A' : '#6B7280',
                  borderBottom: region === r ? '2px solid #C9A84C' : '2px solid transparent',
                }}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Country grid ── */}
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8">
        {livePackages.length === 0 ? (
          <div className="flex items-center justify-center py-28">
            <div className="w-10 h-10 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
          </div>
        ) : displayGroups.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[#6B7280] text-base mb-2">No destinations match &ldquo;{query}&rdquo;</p>
            <p className="text-[#9CA3AF] text-sm mb-6">Try a different spelling or browse by region above</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button onClick={() => setQuery('')}
                className="px-5 py-2.5 rounded-full text-[#0D1B2A] text-sm font-semibold transition-colors hover:bg-white"
                style={{ border: '1.5px solid #E9E6E0' }}>
                Clear search
              </button>
              <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold"
                style={{ background: '#C9A84C', color: '#0B1F3A' }}>
                <MessageCircle className="w-4 h-4" /> Ask Jade
              </a>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-[#9CA3AF] font-semibold uppercase tracking-wider mb-5">
              {showingAll
                ? `${displayGroups.length} destination${displayGroups.length !== 1 ? 's' : ''}`
                : 'Popular destinations'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {displayGroups.map(group => (
                <CountryCard key={group.code} group={group} />
              ))}
            </div>

            {!showingAll && allGroups.length > popularGroups.length && (
              <div className="text-center mt-10">
                <button onClick={() => setRegion('All')}
                  className="text-[#C9A84C] text-sm font-semibold hover:opacity-80 transition-opacity inline-flex items-center gap-1">
                  View all {allGroups.length} countries <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Trust strip ── */}
      <div className="bg-white border-t border-[#E9E6E0] py-7">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {[
            ['30M+', 'travellers connected'],
            ['215+', 'countries covered'],
            ['4G/5G', 'high-speed data'],
            ['Instant', 'eSIM delivery'],
            ['24/7', 'Jade support'],
          ].map(([val, label]) => (
            <div key={val} className="text-center">
              <p className="font-bold text-[#0D1B2A] text-lg leading-none mb-0.5">{val}</p>
              <p className="text-[#9CA3AF] text-xs">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Success overlay (for ?paid=1 redirect back to /esim) */}
      {showSuccess && <SuccessOverlay onClose={() => setShowSuccess(false)} />}
    </section>
  )
}
