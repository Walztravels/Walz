'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeftRight, RefreshCw } from 'lucide-react'
import { useCurrency } from '@/lib/context/CurrencyContext'
import { CURRENCIES } from '@/lib/currencies'
import { Price } from '@/components/common/Price'

// ── Walz services pricing table ───────────────────────────────────────────────
const SERVICES = [
  { name: 'Flight Booking Fee',      amount: 50,    note: 'from' },
  { name: 'UK Tourist Visa',         amount: 188,   note: ''     },
  { name: 'Canada Visitor Visa',     amount: 281,   note: ''     },
  { name: 'UAE Tourist Visa',        amount: 470,   note: ''     },
  { name: 'Schengen Visa',           amount: 231,   note: ''     },
  { name: 'USA B1/B2 Visa',          amount: 344,   note: ''     },
  { name: 'Niagara Falls VIP Tour',  amount: 350,   note: ''     },
  { name: 'London Private Tour',     amount: 295,   note: ''     },
  { name: 'Dubai City Tour',         amount: 200,   note: ''     },
  { name: 'Travel Insurance',        amount: 45,    note: 'from' },
  { name: 'Airport Transfer',        amount: 40,    note: 'from' },
  { name: 'Jade Connect eSIM',       amount: 9.99,  note: 'from' },
]

// ── Popular pairs ─────────────────────────────────────────────────────────────
const POPULAR_PAIRS = [
  { from: 'USD', to: 'GBP' },
  { from: 'USD', to: 'CAD' },
  { from: 'USD', to: 'NGN' },
  { from: 'USD', to: 'GHS' },
  { from: 'GBP', to: 'NGN' },
  { from: 'AED', to: 'NGN' },
]

function minutesAgo(iso: string): string {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 minute ago'
  return `${mins} minutes ago`
}

const QUICK_AMOUNTS = [100, 500, 1_000, 5_000, 10_000, 50_000, 100_000]

export default function CurrencyPage() {
  const { rates, format, lastUpdated, loading, selectedCurrency, setSelectedCurrency } = useCurrency()

  const [fromCode,  setFromCode]  = useState('USD')
  const [toCode,    setToCode]    = useState('GBP')
  const [amount,    setAmount]    = useState('1000')
  const [swapAngle, setSwapAngle] = useState(0)
  const [timeLabel, setTimeLabel] = useState('')

  useEffect(() => {
    const update = () => setTimeLabel(minutesAgo(lastUpdated))
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [lastUpdated])

  const handleSwap = useCallback(() => {
    setSwapAngle(a => a + 180)
    setFromCode(prev => { setToCode(prev); return toCode })
  }, [toCode])

  const loadPair = (from: string, to: string) => {
    setFromCode(from)
    setToCode(to)
  }

  const numAmount = parseFloat(amount) || 0
  const fromCurr  = CURRENCIES.find(c => c.code === fromCode)
  const toCurr    = CURRENCIES.find(c => c.code === toCode)
  const fromRate  = rates[fromCode] ?? 1
  const toRate    = rates[toCode]   ?? 1
  const unitRate  = toRate / fromRate
  const converted = (numAmount / fromRate) * toRate

  return (
    <div className="min-h-screen bg-[#F8F7F4]">

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="bg-[#0B1F3A] py-20 lg:py-28 px-4 text-center" style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[4px] mb-4">LIVE EXCHANGE RATES</p>
        <h1 className="text-4xl lg:text-6xl font-display font-bold text-white mb-4 leading-tight">
          Know What You Pay
        </h1>
        <p className="text-white/60 text-lg max-w-xl mx-auto">
          Convert between 11 currencies instantly. Live rates updated every hour.
        </p>
      </section>

      {/* ── Main converter card ───────────────────────────────────────────── */}
      <section className="py-12 px-4 -mt-8">
        <div className="max-w-xl mx-auto">
          <div
            className="rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: 'rgba(11,31,58,0.97)', border: '1px solid rgba(201,168,76,0.25)' }}
          >
            <div className="p-6 lg:p-8 space-y-6">

              {/* Amount + from */}
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">Amount</p>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full bg-transparent border-b-2 border-white/20 focus:border-[#C9A84C] outline-none text-white text-5xl font-light py-2 placeholder:text-white/20 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="mt-4">
                  <select
                    value={fromCode}
                    onChange={e => setFromCode(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#C9A84C] appearance-none cursor-pointer border border-white/10 transition-colors"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code} style={{ background: '#0B1F3A' }}>
                        {c.flag} {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Swap */}
              <div className="flex justify-center">
                <button
                  onClick={handleSwap}
                  className="w-12 h-12 rounded-full bg-[#C9A84C] text-[#0B1F3A] flex items-center justify-center hover:bg-[#d4b05a] shadow-lg transition-all active:scale-95"
                  style={{ transform: `rotate(${swapAngle}deg)`, transition: 'transform 0.4s ease' }}
                >
                  <ArrowLeftRight className="w-5 h-5" />
                </button>
              </div>

              {/* Result + to */}
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">Converted to</p>
                <div
                  className="text-5xl font-bold mb-4 min-h-[60px]"
                  style={{ color: '#C9A84C' }}
                >
                  {loading ? (
                    <span className="animate-pulse text-white/20">—</span>
                  ) : (
                    format(converted, toCode)
                  )}
                </div>
                <select
                  value={toCode}
                  onChange={e => setToCode(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#C9A84C] appearance-none cursor-pointer border border-white/10 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code} style={{ background: '#0B1F3A' }}>
                      {c.flag} {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Exchange rate bar */}
              <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                <span className="text-white/50 text-xs">
                  1 {fromCode} = {loading ? '…' : unitRate.toFixed(4)} {toCode}
                </span>
                {timeLabel && (
                  <span className="text-white/30 text-xs flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    {timeLabel}
                  </span>
                )}
              </div>

              {/* Quick amounts */}
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">Quick amounts</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.map(q => (
                    <button
                      key={q}
                      onClick={() => setAmount(String(q))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        amount === String(q)
                          ? 'bg-[#C9A84C] text-[#0B1F3A]'
                          : 'bg-white/10 text-white/70 hover:bg-[#C9A84C]/20 hover:text-[#C9A84C]'
                      }`}
                    >
                      {q >= 1_000 ? `${(q / 1_000).toLocaleString()}k` : q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Popular pairs ────────────────────────────────────────────────────── */}
      <section className="py-12 px-4 max-w-5xl mx-auto">
        <h2 className="text-2xl font-display font-bold text-[#0B1F3A] mb-6 text-center">Popular Pairs</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {POPULAR_PAIRS.map(({ from, to }) => {
            const r  = (rates[to] ?? 1) / (rates[from] ?? 1)
            const fc = CURRENCIES.find(c => c.code === from)
            const tc = CURRENCIES.find(c => c.code === to)
            return (
              <button
                key={`${from}-${to}`}
                onClick={() => loadPair(from, to)}
                className="bg-white rounded-2xl border border-gray-100 p-5 text-left hover:border-[#C9A84C]/40 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{fc?.flag}</span>
                  <span className="text-gray-400 text-sm">↔</span>
                  <span className="text-xl">{tc?.flag}</span>
                </div>
                <div className="text-[#0B1F3A] font-bold text-lg group-hover:text-[#C9A84C] transition-colors">
                  {from} → {to}
                </div>
                <div className="text-gray-500 text-sm mt-1">
                  {loading ? '…' : `1 ${from} = ${r.toFixed(4)} ${to}`}
                </div>
                {timeLabel && (
                  <div className="text-gray-400 text-xs mt-1">{timeLabel}</div>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Walz services pricing table ───────────────────────────────────── */}
      <section className="py-12 px-4 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-display font-bold text-[#0B1F3A] mb-2">Walz Travels Pricing</h2>
          <p className="text-gray-500 text-sm">
            All prices shown in your selected currency.{' '}
            <button
              onClick={() => {}}
              className="text-[#C9A84C] hover:underline"
            >
              Change currency in the navbar.
            </button>
          </p>
          {/* Currency quick-select */}
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {CURRENCIES.map(c => (
              <button
                key={c.code}
                onClick={() => setSelectedCurrency(c.code)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  c.code === selectedCurrency
                    ? 'bg-[#0B1F3A] text-[#C9A84C]'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-[#C9A84C]/40'
                }`}
              >
                <span>{c.flag}</span>
                <span>{c.code}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0B1F3A] text-white">
                <th className="text-left px-6 py-4 font-semibold">Service</th>
                <th className="text-right px-6 py-4 font-semibold">USD Price</th>
                <th className="text-right px-6 py-4 font-semibold">Your Currency</th>
              </tr>
            </thead>
            <tbody>
              {SERVICES.map(({ name, amount: svcAmount, note }, i) => (
                <tr key={name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-6 py-4 text-[#0B1F3A] font-medium">{name}</td>
                  <td className="px-6 py-4 text-right text-gray-500">
                    {note ? `${note} ` : ''}${svcAmount}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Price amount={svcAmount} from="USD" size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              * All Walz Travels service fees are charged in USD. The amounts shown in your selected currency are
              approximate based on live rates and may vary slightly at time of payment.
            </p>
          </div>
        </div>
      </section>

    </div>
  )
}
