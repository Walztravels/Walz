'use client'

import { useEffect, useState } from 'react'

export type Gateway = 'stripe' | 'flutterwave'

interface Props {
  depositAmount: number
  packageCurrency: string
  onSelect: (gateway: Gateway, currency: string) => void
  selected: Gateway | null
}

const FX_FALLBACK: Record<string, number> = {
  NGN: 1620,
  GHS: 16.5,
}

function fmtAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

export default function GatewaySelector({ depositAmount, packageCurrency, onSelect, selected }: Props) {
  const [ngnRate, setNgnRate] = useState(FX_FALLBACK.NGN)
  const [ghsRate, setGhsRate] = useState(FX_FALLBACK.GHS)
  const [fwCurrency, setFwCurrency] = useState<'NGN' | 'GHS'>('NGN')

  // Fetch live exchange rates against USD
  useEffect(() => {
    fetch('/api/currency')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        // Try common response shapes
        const rates = data.rates ?? data
        if (rates?.NGN) setNgnRate(Number(rates.NGN))
        if (rates?.GHS) setGhsRate(Number(rates.GHS))
      })
      .catch(() => {})
  }, [])

  // Convert deposit to USD equivalent first, then to local
  const depositUSD =
    packageCurrency === 'USD' ? depositAmount
    : packageCurrency === 'GBP' ? depositAmount * 1.27
    : packageCurrency === 'EUR' ? depositAmount * 1.09
    : packageCurrency === 'CAD' ? depositAmount * 0.73
    : depositAmount

  const depositNGN = Math.round(depositUSD * ngnRate)
  const depositGHS = Math.round(depositUSD * ghsRate)
  const fwDepositAmount = fwCurrency === 'NGN' ? depositNGN : depositGHS

  const handleSelectStripe = () => onSelect('stripe', packageCurrency)
  const handleSelectFlutterwave = () => {
    onSelect('flutterwave', fwCurrency)
  }

  const cardBase =
    'relative border-2 rounded-2xl p-4 cursor-pointer transition-all duration-200 select-none'
  const cardActive = 'border-[#C9A84C] bg-[#FFF8E6]'
  const cardInactive = 'border-[#E2D9CC] bg-white hover:border-[#C9A84C]/50'

  return (
    <div className="space-y-3">
      {/* Stripe */}
      <div
        className={`${cardBase} ${selected === 'stripe' ? cardActive : cardInactive}`}
        onClick={handleSelectStripe}
        role="radio"
        aria-checked={selected === 'stripe'}
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && handleSelectStripe()}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">
            <div
              className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
              style={{
                borderColor: selected === 'stripe' ? '#C9A84C' : '#D1D5DB',
                backgroundColor: selected === 'stripe' ? '#C9A84C' : 'transparent',
              }}
            >
              {selected === 'stripe' && (
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="font-semibold text-[#0B1F3A] text-sm">Pay with Card (International)</p>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                Stripe
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              USD · CAD · GBP · EUR — Visa / Mastercard / Amex
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">💳</span>
              <span className="text-xs text-gray-500">Instant confirmation</span>
            </div>
            {selected === 'stripe' && (
              <p className="mt-2 text-sm font-semibold text-[#0B1F3A]">
                Deposit:{' '}
                <span style={{ color: '#C9A84C' }}>{fmtAmount(depositAmount, packageCurrency)}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Flutterwave */}
      <div
        className={`${cardBase} ${selected === 'flutterwave' ? cardActive : cardInactive}`}
        onClick={handleSelectFlutterwave}
        role="radio"
        aria-checked={selected === 'flutterwave'}
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && handleSelectFlutterwave()}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">
            <div
              className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
              style={{
                borderColor: selected === 'flutterwave' ? '#C9A84C' : '#D1D5DB',
                backgroundColor: selected === 'flutterwave' ? '#C9A84C' : 'transparent',
              }}
            >
              {selected === 'flutterwave' && (
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="font-semibold text-[#0B1F3A] text-sm">Pay from Nigeria or Ghana</p>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                Flutterwave
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              NGN · GHS — Bank transfer · Card · Mobile money
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">🏦 📱</span>
              <span className="text-xs text-gray-500">USSD · Mobile money</span>
            </div>

            {selected === 'flutterwave' && (
              <div className="mt-3 space-y-2">
                {/* NGN/GHS currency toggle */}
                <div className="flex gap-2">
                  {(['NGN', 'GHS'] as const).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={e => { e.stopPropagation(); setFwCurrency(c); onSelect('flutterwave', c) }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style={
                        fwCurrency === c
                          ? { background: '#C9A84C', color: '#0B1F3A' }
                          : { background: '#F3F4F6', color: '#6B7280' }
                      }
                    >
                      {c === 'NGN' ? '🇳🇬 Naira' : '🇬🇭 Cedis'}
                    </button>
                  ))}
                </div>
                <p className="text-sm font-semibold text-[#0B1F3A]">
                  Deposit:{' '}
                  <span style={{ color: '#C9A84C' }}>
                    {fmtAmount(fwDepositAmount, fwCurrency)}
                  </span>
                  <span className="text-xs text-gray-400 font-normal ml-1">
                    (≈ {fmtAmount(depositAmount, packageCurrency)})
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
