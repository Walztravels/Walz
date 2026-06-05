'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  Globe, Search, Clock, ChevronRight, AlertTriangle,
  CheckCircle, Info, ExternalLink, Plane, Hotel,
  MessageCircle, Shield, Loader2, ChevronDown,
} from 'lucide-react'
import { CountrySelect } from '@/components/visa/CountrySelect'
import { ADVISORY_CONFIG, RULE_TYPE_CONFIG, getCountryByIso2 } from '@/lib/countries'
import { ISO2_TO_SLUG } from '@/lib/visa-config'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Portal {
  destinationIso2: string; countryName: string; flagEmoji: string | null
  region: string | null; portalUrl: string | null
  walzFeeUsd: number; walzFeeNgn: number; govtFeeUsd: number
  govtFeeAmount: number; govtFeeCurrency: string
  processingDaysMin: number; processingDaysMax: number
  maxStayDays: number; validityDays: number; singleOrMultiple: string
  requiredDocuments: string[]; jadeTips: string | null
  commonRefusals: string[]; advisoryLevel: number
}

interface VisaResult {
  found: boolean
  rule: { ruleType: string; maxDays: number | null; notes: string | null } | null
  portal: Portal | null
  advisory: { advisoryLevel: number; advisoryText: string | null; message: string | null } | null
}

// ─── Advisory badge ───────────────────────────────────────────────────────────
function AdvisoryBadge({ level }: { level: number }) {
  const cfg = ADVISORY_CONFIG[level as keyof typeof ADVISORY_CONFIG] ?? ADVISORY_CONFIG[1]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      Level {level} — {cfg.label}
    </span>
  )
}

// ─── Visa Result Card ─────────────────────────────────────────────────────────
function VisaResultCard({ result, passport, destination }: {
  result: VisaResult; passport: string; destination: string
}) {
  const [docsOpen, setDocsOpen] = useState(false)
  const [refusalsOpen, setRefusalsOpen] = useState(false)

  const passportCountry    = getCountryByIso2(passport)
  const destinationCountry = getCountryByIso2(destination)
  const ruleType = result.rule?.ruleType ?? 'visa_required'
  const ruleCfg  = RULE_TYPE_CONFIG[ruleType as keyof typeof RULE_TYPE_CONFIG] ?? RULE_TYPE_CONFIG.visa_required
  const advisory = result.advisory?.advisoryLevel ?? result.portal?.advisoryLevel ?? 1
  const portal   = result.portal

  return (
    <div className="mt-8 max-w-2xl mx-auto">
      {/* Verdict */}
      <div className={`rounded-2xl p-6 mb-4 ${ruleCfg.bg} border-2 ${
        ruleType === 'visa_free' ? 'border-green-300' :
        ruleType === 'evisa' || ruleType === 'eta' ? 'border-purple-200' :
        ruleType === 'visa_on_arrival' ? 'border-blue-200' : 'border-red-200'
      }`}>
        <div className="flex items-start gap-4">
          <div className="text-4xl">{ruleCfg.badge}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`font-bold text-xl ${ruleCfg.color}`}>{ruleCfg.label}</span>
              <AdvisoryBadge level={advisory} />
            </div>
            <p className={`text-sm ${ruleCfg.color} opacity-80`}>
              {passportCountry?.flag} {passportCountry?.name} passport →{' '}
              {destinationCountry?.flag} {destinationCountry?.name}
              {result.rule?.maxDays ? ` · up to ${result.rule.maxDays} days` : ''}
            </p>
            {result.rule?.notes && (
              <p className={`text-xs mt-1 ${ruleCfg.color} opacity-70`}>{result.rule.notes}</p>
            )}
          </div>
        </div>
      </div>

      {/* Portal details */}
      {portal && (
        <>
          {/* Fees & timing */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Walz Fee', value: portal.walzFeeUsd > 0 ? `$${portal.walzFeeUsd}` : 'Contact us', sub: portal.walzFeeNgn > 0 ? `₦${(portal.walzFeeNgn / 1000).toFixed(0)}k` : '' },
              { label: 'Govt Fee', value: portal.govtFeeAmount > 0 ? `${portal.govtFeeCurrency} ${portal.govtFeeAmount}` : 'Included' },
              { label: 'Processing', value: `${portal.processingDaysMin}–${portal.processingDaysMax} days` },
              { label: 'Max Stay', value: `${portal.maxStayDays} days` },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                <div className="text-[#0B1F3A] font-bold text-base">{value}</div>
                {sub && <div className="text-gray-400 text-xs">{sub}</div>}
                <div className="text-gray-400 text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Required Documents */}
          {portal.requiredDocuments.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 mb-4 overflow-hidden">
              <button
                onClick={() => setDocsOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[#C9A84C]" />
                  <span className="font-semibold text-[#0B1F3A] text-sm">Required Documents</span>
                  <span className="text-xs bg-[#0B1F3A] text-white px-2 py-0.5 rounded-full">{portal.requiredDocuments.length}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${docsOpen ? 'rotate-180' : ''}`} />
              </button>
              {docsOpen && (
                <div className="px-5 pb-4 space-y-2">
                  {portal.requiredDocuments.map((doc, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      {doc}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Jade Tips */}
          {portal.jadeTips && (
            <div className="bg-[#0B1F3A] rounded-xl p-5 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-sm flex-shrink-0">J</div>
                <div>
                  <p className="text-[#C9A84C] font-semibold text-xs uppercase tracking-wider mb-1.5">Jade's Insider Tip</p>
                  <p className="text-white/80 text-sm leading-relaxed">{portal.jadeTips}</p>
                </div>
              </div>
            </div>
          )}

          {/* Common Refusals */}
          {portal.commonRefusals.length > 0 && (
            <div className="bg-white rounded-xl border border-red-100 mb-4 overflow-hidden">
              <button
                onClick={() => setRefusalsOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-red-50/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="font-semibold text-[#0B1F3A] text-sm">Common Rejection Reasons</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${refusalsOpen ? 'rotate-180' : ''}`} />
              </button>
              {refusalsOpen && (
                <div className="px-5 pb-4 space-y-2">
                  {portal.commonRefusals.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-red-700">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Link href={`/visa/apply/${ISO2_TO_SLUG[destination] ?? destination.toLowerCase()}`}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors">
              Apply with Walz Travels →
            </Link>
            <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 border-2 border-[#0B1F3A] text-[#0B1F3A] font-bold text-sm rounded-xl hover:bg-gray-50 transition-colors">
              <MessageCircle className="w-4 h-4" />
              Ask Jade First
            </a>
          </div>
        </>
      )}

      {/* No portal — but rule found */}
      {!portal && result.rule && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-4">
          <p className="text-sm text-gray-600 mb-4">
            We have basic visa requirements for this route. Contact our team for full guidance and application support.
          </p>
          <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm rounded-xl hover:bg-[#b8943d] transition-colors">
            <MessageCircle className="w-4 h-4" />
            Get Full Guidance on WhatsApp
          </a>
        </div>
      )}

      {/* Not found */}
      {!result.found && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-center mb-4">
          <Info className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-[#0B1F3A] mb-2">Route not in our database yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            We may still be able to help. Our team handles visa applications for many routes not yet in our online checker.
          </p>
          <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#0B1F3A] text-white font-bold text-sm rounded-xl hover:bg-[#0d2345] transition-colors">
            <MessageCircle className="w-4 h-4" />
            Ask Walz on WhatsApp
          </a>
        </div>
      )}

      {/* Cross-sell */}
      {destinationCountry && (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/flights" className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl hover:border-blue-200 transition-colors">
            <Plane className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-blue-900">Flights to {destinationCountry.name}</p>
              <p className="text-xs text-blue-600">Search →</p>
            </div>
          </Link>
          <Link href="/hotels" className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-100 rounded-xl hover:border-purple-200 transition-colors">
            <Hotel className="w-5 h-5 text-purple-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-purple-900">Hotels in {destinationCountry.name}</p>
              <p className="text-xs text-purple-600">Search →</p>
            </div>
          </Link>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 text-center mt-6 leading-relaxed">
        Walz Travels provides visa information sourced from official government portals, refreshed regularly.
        Entry decisions are made solely by destination country immigration authorities.
        Always verify current requirements with the official embassy before travel.
        Walz Travels is not liable for denied entry or application rejections.
      </p>
    </div>
  )
}

// ─── Country Card ─────────────────────────────────────────────────────────────
function CountryCard({ portal }: { portal: Portal }) {
  // Slug map: ISO2 → friendly URL slug
  const ISO2_TO_SLUG: Record<string, string> = {
    GB: 'uk', CA: 'canada', AE: 'uae', FR: 'schengen',
    US: 'usa', AU: 'australia', VN: 'vietnam', IN: 'india',
    TR: 'turkey', KE: 'kenya', EG: 'egypt', PH: 'philippines',
    MA: 'morocco', NZ: 'new-zealand', ZA: 'south-africa',
  }
  const slug = ISO2_TO_SLUG[portal.destinationIso2] ?? portal.destinationIso2.toLowerCase()

  return (
    <Link href={`/visa/${slug}`}
      className="bg-white rounded-xl border border-gray-100 p-4 hover:border-[#C9A84C]/40 hover:shadow-sm transition-all group">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl leading-none">{portal.flagEmoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[#0B1F3A] text-sm leading-tight">{portal.countryName}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{portal.region}</p>
        </div>
        <AdvisoryBadge level={portal.advisoryLevel} />
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap mb-3">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{portal.processingDaysMin}–{portal.processingDaysMax}d</span>
        <span>{portal.maxStayDays} days stay</span>
        {portal.walzFeeUsd > 0 && <span className="font-semibold text-[#0B1F3A]">from ${portal.walzFeeUsd}</span>}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{portal.singleOrMultiple} entry</span>
        <span className="text-xs text-[#C9A84C] font-semibold group-hover:underline flex items-center gap-0.5">
          View details <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VisaPage() {
  useSession()
  const [passport, setPassport]         = useState('NG')
  const [destination, setDestination]   = useState('')
  const [result, setResult]             = useState<VisaResult | null>(null)
  const [checking, setChecking]         = useState(false)
  const [portals, setPortals]           = useState<Portal[]>([])
  const [regionFilter, setRegionFilter] = useState('All')
  const [searchQuery, setSearchQuery]   = useState('')

  useEffect(() => {
    fetch('/api/visa-countries').then(r => r.json()).then(d => setPortals(d.portals ?? []))
  }, [])

  async function handleCheck() {
    if (!passport || !destination) return
    setChecking(true)
    setResult(null)
    const res = await fetch('/api/visa-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passport_iso2: passport, destination_iso2: destination }),
    })
    const data = await res.json()
    setResult(data)
    setChecking(false)
    setTimeout(() => document.getElementById('visa-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const regions = ['All', ...Array.from(new Set(portals.map(p => p.region).filter((r): r is string => Boolean(r))))]
  const filteredPortals = portals.filter(p =>
    (regionFilter === 'All' || p.region === regionFilter) &&
    (searchQuery === '' || p.countryName.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  return (
    <div className="min-h-screen">
      {/* ── Hero + Checker ───────────────────────────────────────────── */}
      <div className="bg-[#0B1F3A] pt-12 pb-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-full text-[#C9A84C] text-xs font-semibold uppercase tracking-wider mb-6">
            <Globe className="w-3.5 h-3.5" />
            Visa Intelligence
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            Every passport.<br className="hidden sm:block" /> Every border. One place.
          </h1>
          <p className="text-white/60 text-base sm:text-lg mb-10 max-w-xl mx-auto">
            Walz tracks visa requirements for 199 countries — linked directly to official government portals.
          </p>

          {/* Checker form */}
          <div id="checker" className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <CountrySelect
                label="I am a citizen of"
                value={passport}
                onChange={setPassport}
                exclude={destination}
                placeholder="Select passport country"
              />
              <CountrySelect
                label="I am travelling to"
                value={destination}
                onChange={setDestination}
                exclude={passport}
                placeholder="Select destination"
              />
            </div>
            <button
              onClick={handleCheck}
              disabled={!destination || checking}
              className="w-full py-4 bg-[#C9A84C] hover:bg-[#b8943d] disabled:opacity-50 text-[#0B1F3A] font-bold text-base rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {checking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
              {checking ? 'Checking requirements…' : 'Check Visa Requirements'}
            </button>
            <div className="flex items-center justify-center gap-6 mt-4 text-white/30 text-xs">
              <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> 199 destinations</span>
              <span>Official government portals</span>
              <span>Free — no account needed</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Result ──────────────────────────────────────────────────── */}
      {(result || checking) && (
        <div id="visa-result" className="bg-[#F4F6F9] px-4 py-8">
          {checking ? (
            <div className="flex items-center justify-center gap-3 py-12">
              <Loader2 className="w-6 h-6 text-[#C9A84C] animate-spin" />
              <span className="text-gray-500">Checking requirements…</span>
            </div>
          ) : result && (
            <VisaResultCard result={result} passport={passport} destination={destination} />
          )}
        </div>
      )}

      {/* ── Country Directory ────────────────────────────────────────── */}
      <div id="directory" className={`${result ? 'bg-white' : 'bg-[#F4F6F9]'} px-4 py-12`}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[#0B1F3A] mb-2">Browse all destinations</h2>
            <p className="text-gray-500 text-sm">Click any country for full visa guide, fees, and application</p>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search countries…"
                className="w-full pl-10 pr-4 h-10 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {regions.map(r => (
                <button key={r} onClick={() => setRegionFilter(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    regionFilter === r
                      ? 'bg-[#0B1F3A] text-white'
                      : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPortals.map(p => <CountryCard key={p.destinationIso2} portal={p} />)}
          </div>

          {filteredPortals.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No countries match your search</p>
            </div>
          )}

          {/* More countries CTA */}
          <div className="mt-10 bg-[#0B1F3A] rounded-2xl p-6 text-center text-white">
            <h3 className="font-bold text-lg mb-2">Don't see your destination?</h3>
            <p className="text-white/60 text-sm mb-4">
              Our team handles visa applications for 199+ destinations. WhatsApp us for any country not listed.
            </p>
            <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm rounded-xl hover:bg-[#b8943d] transition-colors">
              <MessageCircle className="w-4 h-4" />
              WhatsApp Walz Travels
            </a>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-gray-50 border-t border-gray-100 py-6 px-4 text-center">
        <p className="text-xs text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Walz Travels provides visa information as a convenience. Our data is sourced from public government sources
          and refreshed regularly. Entry decisions are made solely by destination country immigration authorities.
          Always verify current requirements with the official embassy before travel. Walz Travels is not liable
          for denied entry or application rejections.
        </p>
      </div>
    </div>
  )
}
