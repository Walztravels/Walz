'use client'
import { useState, useEffect, useCallback } from 'react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', NGN: '₦', GHS: '₵' }

const CATEGORY_LABELS: Record<string, string> = {
  payment_link: '🔗 Payment Link',
  visa_fee:     '🛂 Visa Fee',
  payroll:      '👥 Payroll',
  refund:       '↩ Refund',
}

const PROVIDER_LABELS: Record<string, string> = {
  stripe:          '💳 Stripe',
  flutterwave_va:  '🏦 Bank Transfer',
  flutterwave:     '🌍 Flutterwave',
  manual:          '✍ Manual',
}

interface Transaction {
  id: string
  date: string
  type: 'inflow' | 'outflow'
  category: string
  description: string
  client: string
  clientEmail?: string
  amount: number
  currency: string
  provider?: string
  reference?: string
  status: string
  payerBank?: string | null
}

interface CurrencySummary {
  totalIn: number
  totalOut: number
  net: number
  count: number
}

export default function AccountingPage() {
  const { can, loading: permLoading } = useStaffPermissions()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [summary,      setSummary]      = useState<Record<string, CurrencySummary>>({})
  const [loading,      setLoading]      = useState(true)
  const [period,       setPeriod]       = useState('month')
  const [type,         setType]         = useState('all')
  const [search,       setSearch]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/admin/accounting?period=${period}&type=${type}`)
      const data = await res.json()
      setTransactions(data.transactions || [])
      setSummary(data.summary || {})
    } finally {
      setLoading(false)
    }
  }, [period, type])

  useEffect(() => { load() }, [load])

  const filtered = transactions.filter(t =>
    !search ||
    t.client?.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase()) ||
    t.reference?.toLowerCase().includes(search.toLowerCase())
  )

  const exportCsv = () => {
    const rows = [
      ['Date', 'Type', 'Category', 'Description', 'Client', 'Amount', 'Currency', 'Reference', 'Provider'].join(','),
      ...filtered.map(t => [
        new Date(t.date).toLocaleDateString('en-GB'),
        t.type,
        t.category,
        `"${t.description}"`,
        `"${t.client}"`,
        t.amount,
        t.currency,
        t.reference ?? '',
        t.provider ?? '',
      ].join(',')),
    ].join('\n')

    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }))
    a.download = `walz-transactions-${period}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const periodLabel = { week: 'This week', month: 'This month', year: 'This year', all: 'All time' }[period] ?? ''

  if (!permLoading && !can('accounting_view')) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-[#0B1F3A] mb-1">Access Restricted</h2>
          <p className="text-sm text-gray-500">You don't have permission to view accounting data. Contact your admin.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-white font-bold text-2xl">Accounting</h1>
        <p className="text-white/40 text-sm mt-0.5">All Walz Travels transactions — money in and money out</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(summary).map(([currency, data]) => (
          <div key={currency} className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-3">{currency}</p>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-white/40 text-xs">In</span>
                <span className="text-green-400 font-bold text-sm">
                  {SYM[currency] ?? currency}{Number(data.totalIn).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/40 text-xs">Out</span>
                <span className="text-red-400 font-bold text-sm">
                  {SYM[currency] ?? currency}{Number(data.totalOut).toLocaleString()}
                </span>
              </div>
              <div className="border-t border-white/10 pt-1.5 flex justify-between">
                <span className="text-white/40 text-xs">Net</span>
                <span className={`font-bold text-sm ${data.net >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                  {data.net < 0 ? '-' : ''}{SYM[currency] ?? currency}{Math.abs(data.net).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Transaction count */}
        <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5">
          <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Transactions</p>
          <p className="text-white font-bold text-3xl">{transactions.length}</p>
          <p className="text-white/30 text-xs mt-1">{periodLabel}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Period */}
        <div className="flex bg-white/5 rounded-xl p-1 gap-1">
          {[['week','Week'],['month','Month'],['year','Year'],['all','All Time']].map(([val, label]) => (
            <button key={val} onClick={() => setPeriod(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${period === val ? 'bg-amber-500 text-black' : 'text-white/50 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Direction */}
        <div className="flex bg-white/5 rounded-xl p-1 gap-1">
          {[['all','All'],['inflow','↑ In'],['outflow','↓ Out']].map(([val, label]) => (
            <button key={val} onClick={() => setType(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${type === val ? 'bg-amber-500 text-black' : 'text-white/50 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input type="text" placeholder="Search client, reference…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-500/50" />

        {/* Export */}
        <button onClick={exportCsv}
          className="bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition">
          ⬇ Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-white/30 text-sm">No transactions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/8">
                <tr>
                  {['Date', 'Type', 'Description', 'Client', 'Amount', 'Provider', 'Ref'].map(h => (
                    <th key={h} className="text-white/40 text-xs uppercase tracking-wider text-left px-5 py-3 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => (
                  <tr key={tx.id} className="border-b border-white/5 hover:bg-white/3 transition last:border-0">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <p className="text-white/60 text-xs">
                        {new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        tx.type === 'inflow' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                      }`}>
                        {tx.type === 'inflow' ? '↑ In' : '↓ Out'}
                      </span>
                    </td>
                    <td className="px-5 py-3 max-w-[200px]">
                      <p className="text-white text-sm font-medium truncate">{tx.description}</p>
                      <p className="text-white/30 text-xs mt-0.5">{CATEGORY_LABELS[tx.category] ?? tx.category}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-white/70 text-sm">{tx.client}</p>
                      {tx.payerBank && <p className="text-white/30 text-xs">via {tx.payerBank}</p>}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <p className={`font-bold text-sm ${tx.type === 'inflow' ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.type === 'outflow' ? '−' : '+'}{SYM[tx.currency] ?? tx.currency}{Number(tx.amount).toLocaleString()}
                      </p>
                      <p className="text-white/30 text-xs">{tx.currency}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        tx.provider === 'stripe'         ? 'bg-blue-500/15 text-blue-400'  :
                        tx.provider?.includes('flutter') ? 'bg-green-500/15 text-green-400':
                                                           'bg-white/10 text-white/40'
                      }`}>
                        {PROVIDER_LABELS[tx.provider ?? ''] ?? tx.provider ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-white/30 text-xs font-mono truncate max-w-[100px]">
                        {tx.reference?.substring(0, 20)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
