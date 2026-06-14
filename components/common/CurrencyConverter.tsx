'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { X, ArrowLeftRight, RefreshCw } from 'lucide-react'
import { useCurrency } from '@/lib/context/CurrencyContext'
import { CURRENCIES } from '@/lib/currencies'

const LS_FROM_KEY = 'walz_conv_from'
const LS_TO_KEY   = 'walz_conv_to'

const QUICK_AMOUNTS = [100, 500, 1_000, 5_000, 10_000]

function minutesAgo(iso: string): string {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 minute ago'
  return `${mins} minutes ago`
}

export function CurrencyConverter() {
  const { rates, convert, format, lastUpdated, loading } = useCurrency()

  const [isOpen,    setIsOpen]    = useState(false)
  const [amount,    setAmount]    = useState('1000')
  const [fromCode,  setFromCode]  = useState('USD')
  const [toCode,    setToCode]    = useState('GBP')
  const [swapAngle, setSwapAngle] = useState(0)
  const [timeLabel, setTimeLabel] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)

  // Restore last used pair from localStorage
  useEffect(() => {
    try {
      const f = localStorage.getItem(LS_FROM_KEY)
      const t = localStorage.getItem(LS_TO_KEY)
      if (f && CURRENCIES.some(c => c.code === f)) setFromCode(f)
      if (t && CURRENCIES.some(c => c.code === t)) setToCode(t)
    } catch { /* private browsing */ }
  }, [])

  // Update "Updated X minutes ago" label every 30 s
  useEffect(() => {
    const update = () => setTimeLabel(minutesAgo(lastUpdated))
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [lastUpdated])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  const persist = useCallback((from: string, to: string) => {
    try {
      localStorage.setItem(LS_FROM_KEY, from)
      localStorage.setItem(LS_TO_KEY,   to)
    } catch { /* private browsing */ }
  }, [])

  const handleSwap = () => {
    setSwapAngle(a => a + 180)
    setFromCode(toCode)
    setToCode(fromCode)
    persist(toCode, fromCode)
  }

  const setFrom = (code: string) => { setFromCode(code); persist(code, toCode) }
  const setTo   = (code: string) => { setToCode(code);   persist(fromCode, code) }

  const numAmount  = parseFloat(amount) || 0
  const toCurrency = CURRENCIES.find(c => c.code === toCode)
  const fromRate   = rates[fromCode] ?? 1
  const toRate     = rates[toCode]   ?? 1
  const unitRate   = toRate / fromRate
  const converted  = (numAmount / fromRate) * toRate

  return (
    <div ref={containerRef} className="fixed bottom-6 left-6 z-40" style={{ bottom: 96 }}>
      {/* ── Expanded panel ─────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="mb-3 w-80 rounded-2xl shadow-2xl overflow-hidden"
          style={{
            background: 'rgba(11,31,58,0.97)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(201,168,76,0.3)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">💱</span>
              <span className="text-white font-bold text-sm">Currency Converter</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/50 hover:text-white transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 pb-5 space-y-4">
            {/* Amount input */}
            <div>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full bg-white/5 border-0 border-b-2 border-white/20 focus:border-[#C9A84C] outline-none text-white text-4xl font-light px-0 py-2 placeholder:text-white/20 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            {/* Quick amounts */}
            <div className="flex gap-1.5 flex-wrap">
              {QUICK_AMOUNTS.map(q => (
                <button
                  key={q}
                  onClick={() => setAmount(String(q))}
                  className="px-2.5 py-1 rounded-full bg-white/10 text-white/70 text-xs hover:bg-[#C9A84C]/20 hover:text-[#C9A84C] transition-colors"
                >
                  {q >= 1000 ? `${q / 1000}k` : q}
                </button>
              ))}
            </div>

            {/* From currency */}
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-widest mb-1.5">From</p>
              <select
                value={fromCode}
                onChange={e => setFrom(e.target.value)}
                className="w-full bg-white/10 text-white rounded-xl px-3 py-2.5 text-sm border border-white/10 outline-none focus:border-[#C9A84C] transition-colors appearance-none cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code} style={{ background: '#0B1F3A' }}>
                    {c.flag} {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Swap button */}
            <div className="flex justify-center">
              <button
                onClick={handleSwap}
                className="w-9 h-9 rounded-full bg-[#C9A84C] text-[#0B1F3A] flex items-center justify-center hover:bg-[#d4b05a] transition-all"
                style={{ transform: `rotate(${swapAngle}deg)`, transition: 'transform 0.3s ease' }}
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
            </div>

            {/* To currency */}
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-widest mb-1.5">To</p>
              <select
                value={toCode}
                onChange={e => setTo(e.target.value)}
                className="w-full bg-white/10 text-white rounded-xl px-3 py-2.5 text-sm border border-white/10 outline-none focus:border-[#C9A84C] transition-colors appearance-none cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code} style={{ background: '#0B1F3A' }}>
                    {c.flag} {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Result */}
            <div className="bg-white/5 rounded-xl px-4 py-4 text-center">
              {loading ? (
                <div className="text-white/30 animate-pulse text-2xl">—</div>
              ) : (
                <>
                  <div className="text-[#C9A84C] text-3xl font-bold">
                    {format(converted, toCode)}
                  </div>
                  <div className="text-white/40 text-xs mt-2">
                    1 {fromCode} = {unitRate.toFixed(4)} {toCode}
                  </div>
                  {timeLabel && (
                    <div className="text-white/30 text-xs mt-0.5 flex items-center justify-center gap-1">
                      <RefreshCw className="w-2.5 h-2.5" />
                      Updated {timeLabel}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Full page link */}
            <Link
              href="/currency"
              className="block text-center text-[#C9A84C] text-xs hover:underline"
            >
              Full converter →
            </Link>
          </div>
        </div>
      )}

      {/* ── Collapsed button ────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(v => !v)}
        title="Currency Converter"
        className="group w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95"
        style={{
          background: isOpen ? '#C9A84C' : '#0B1F3A',
          border: '2px solid rgba(201,168,76,0.6)',
        }}
      >
        <span
          className="text-2xl"
          style={{
            filter: isOpen ? 'none' : 'drop-shadow(0 0 6px rgba(201,168,76,0.8))',
            animation: isOpen ? 'none' : 'pulse-glow 2.5s infinite',
          }}
        >
          💱
        </span>
      </button>

      <style jsx>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(1.08); }
        }
      `}</style>
    </div>
  )
}
