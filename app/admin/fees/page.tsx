'use client'

import { useState, useEffect } from 'react'
import { DollarSign, Save, RefreshCw, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface VisaFee {
  id:               string
  countryName:      string
  flagEmoji:        string
  destinationIso2:  string
  walzFeeUsd:       number
  govtFeeAmount:    number
  govtFeeCurrency:  string
}

interface ProcessingFee {
  key:         string
  label:       string
  description: string
  percent:     number
}

// ── Processing fee defaults (payment gateway fees) ───────────────────────────

const PROCESSING_FEES: ProcessingFee[] = [
  { key: 'flutterwave',    label: 'Flutterwave',        description: 'Bank transfer & card (NGN/GHS)',  percent: 1.4 },
  { key: 'virtual_account',label: 'Virtual Account',    description: 'NGN bank transfer (FLW VA)',      percent: 1.4 },
  { key: 'stripe_eu',      label: 'Stripe EU cards',    description: 'EU-issued cards (GBP/EUR)',        percent: 1.4 },
  { key: 'stripe_non_eu',  label: 'Stripe Non-EU cards',description: 'Non-EU cards (USD/CAD/AED)',       percent: 2.9 },
]

// ── Component ────────────────────────────────────────────────────────────────

export default function FeesPage() {
  const [visaFees,   setVisaFees]   = useState<VisaFee[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState<string | null>(null)
  const [saved,      setSaved]      = useState<string | null>(null)
  const [edits,      setEdits]      = useState<Record<string, { walzFee: string; govtFee: string; govtCurrency: string }>>({})
  const [search,     setSearch]     = useState('')
  const [showProc,   setShowProc]   = useState(false)

  useEffect(() => {
    fetch('/api/admin/fees/visa')
      .then(r => r.json())
      .then((d: { fees: VisaFee[] }) => {
        setVisaFees(d.fees ?? [])
        const init: typeof edits = {}
        for (const f of d.fees ?? []) {
          init[f.id] = {
            walzFee:     String(f.walzFeeUsd),
            govtFee:     String(f.govtFeeAmount),
            govtCurrency:f.govtFeeCurrency,
          }
        }
        setEdits(init)
      })
      .finally(() => setLoading(false))
  }, [])

  const saveVisa = async (fee: VisaFee) => {
    const e = edits[fee.id]
    if (!e) return
    setSaving(fee.id)
    await fetch('/api/admin/fees/visa', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        id:             fee.id,
        walzFeeUsd:     parseFloat(e.walzFee)   || 0,
        govtFeeAmount:  parseFloat(e.govtFee)    || 0,
        govtFeeCurrency:e.govtCurrency,
      }),
    })
    setVisaFees(prev => prev.map(f => f.id === fee.id ? {
      ...f,
      walzFeeUsd:    parseFloat(e.walzFee)   || 0,
      govtFeeAmount: parseFloat(e.govtFee)   || 0,
      govtFeeCurrency: e.govtCurrency,
    } : f))
    setSaving(null)
    setSaved(fee.id)
    setTimeout(() => setSaved(null), 2000)
  }

  const filtered = visaFees.filter(f =>
    f.countryName.toLowerCase().includes(search.toLowerCase()) ||
    f.destinationIso2.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-[#C9A84C]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0B1F3A]">Fee Management</h1>
            <p className="text-sm text-gray-500">Update Walz service fees and government fees per country</p>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6 max-w-5xl">

        {/* Payment processing fees — read-only info panel */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowProc(p => !p)}
            className="w-full flex items-center justify-between px-6 py-4 text-left"
          >
            <div>
              <p className="font-semibold text-[#0B1F3A]">Payment Processing Fees</p>
              <p className="text-xs text-gray-400 mt-0.5">Gateway fees added on top of service fees at checkout</p>
            </div>
            {showProc ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {showProc && (
            <div className="border-t border-gray-100 px-6 py-4">
              <div className="grid grid-cols-2 gap-3">
                {PROCESSING_FEES.map(pf => (
                  <div key={pf.key} className="bg-gray-50 rounded-lg p-3">
                    <p className="font-semibold text-sm text-[#0B1F3A]">{pf.label}</p>
                    <p className="text-xs text-gray-400">{pf.description}</p>
                    <p className="text-[#C9A84C] font-bold mt-1">{pf.percent}%</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                These are gateway fees charged by Flutterwave/Stripe. To change them, update <code className="bg-gray-100 px-1 rounded">lib/payment-fees.ts</code>.
              </p>
            </div>
          )}
        </div>

        {/* Visa fees table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-[#0B1F3A]">Visa Service Fees</p>
              <p className="text-xs text-gray-400 mt-0.5">Per-country Walz fee (USD) and government fee — shown live on the website</p>
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search country…"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 w-48"
            />
          </div>

          {loading ? (
            <div className="p-8 space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(fee => {
                const e = edits[fee.id] ?? { walzFee: '0', govtFee: '0', govtCurrency: 'USD' }
                const isSaving = saving === fee.id
                const isSaved  = saved  === fee.id
                return (
                  <div key={fee.id} className="flex items-center gap-4 px-6 py-3">
                    {/* Country */}
                    <div className="w-48 flex items-center gap-2 flex-shrink-0">
                      <span className="text-xl">{fee.flagEmoji}</span>
                      <div>
                        <p className="font-semibold text-sm text-[#0B1F3A]">{fee.countryName}</p>
                        <p className="text-xs text-gray-400">{fee.destinationIso2}</p>
                      </div>
                    </div>

                    {/* Walz fee (USD) */}
                    <div className="flex-1">
                      <label className="text-xs text-gray-400 block mb-1">Walz Fee (USD)</label>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={e.walzFee}
                          onChange={ev => setEdits(prev => ({ ...prev, [fee.id]: { ...e, walzFee: ev.target.value } }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
                        />
                      </div>
                    </div>

                    {/* Govt fee */}
                    <div className="flex-1">
                      <label className="text-xs text-gray-400 block mb-1">Govt Fee</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={e.govtCurrency}
                          onChange={ev => setEdits(prev => ({ ...prev, [fee.id]: { ...e, govtCurrency: ev.target.value.toUpperCase().slice(0,3) } }))}
                          className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 text-center font-mono"
                        />
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={e.govtFee}
                          onChange={ev => setEdits(prev => ({ ...prev, [fee.id]: { ...e, govtFee: ev.target.value } }))}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
                        />
                      </div>
                    </div>

                    {/* Save */}
                    <button
                      onClick={() => saveVisa(fee)}
                      disabled={isSaving || isSaved}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ${
                        isSaved
                          ? 'bg-green-50 text-green-600 border border-green-200'
                          : 'bg-[#0B1F3A] text-[#C9A84C] hover:bg-[#0d2548] disabled:opacity-50'
                      }`}
                    >
                      {isSaving ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : isSaved ? (
                        <CheckCircle className="w-3.5 h-3.5" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {isSaved ? 'Saved' : 'Save'}
                    </button>
                  </div>
                )
              })}
              {filtered.length === 0 && (
                <div className="py-12 text-center text-gray-400">No countries match "{search}"</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
