'use client'

import { useEffect, useState } from 'react'
import { processorsFor } from '@/lib/payments/processors'
import type { Processor } from '@/lib/payments/processors'
import { BUSINESS, waLink } from '@/lib/config/business'

export type Gateway = Processor['id']

interface Props {
  currency: string
  amount: number
  selected: Gateway | null
  onSelect: (id: Gateway, currency: string) => void
}

const FX_FALLBACK: Record<string, number> = { NGN: 1620, GHS: 16.5, KES: 130, ZAR: 18 }

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

export default function GatewaySelector({ currency, amount, selected, onSelect }: Props) {
  const [fxRates, setFxRates] = useState<Record<string, number>>(FX_FALLBACK)
  const [fwCurrency, setFwCurrency] = useState<'NGN' | 'GHS'>(() =>
    currency === 'GHS' ? 'GHS' : 'NGN'
  )

  useEffect(() => {
    fetch('/api/currency')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const rates = data.rates ?? data
        setFxRates(prev => ({
          ...prev,
          ...(rates.NGN ? { NGN: Number(rates.NGN) } : {}),
          ...(rates.GHS ? { GHS: Number(rates.GHS) } : {}),
          ...(rates.KES ? { KES: Number(rates.KES) } : {}),
          ...(rates.ZAR ? { ZAR: Number(rates.ZAR) } : {}),
        }))
      })
      .catch(() => {})
  }, [])

  const processors = processorsFor(currency, amount)

  // Convert amount to USD then to target local currency
  const amountUSD =
    currency === 'USD' ? amount
    : currency === 'GBP' ? amount * 1.27
    : currency === 'EUR' ? amount * 1.09
    : currency === 'CAD' ? amount * 0.73
    : currency === 'AED' ? amount * 0.27
    : fxRates[currency] ? amount / fxRates[currency]
    : amount

  function localAmount(cur: string): number {
    if (currency === cur) return amount
    return Math.round(amountUSD * (fxRates[cur] ?? 1))
  }

  const cardBase = 'relative border-2 rounded-2xl p-4 cursor-pointer transition-all duration-200 select-none'
  const cardActive = 'border-[#C9A84C] bg-[#FFF8E6]'
  const cardInactive = 'border-[#E2D9CC] bg-white hover:border-[#C9A84C]/50'

  if (processors.length === 0) {
    return (
      <div className="rounded-2xl border border-[#E2D9CC] bg-white p-6 text-center">
        <p className="text-[#0B1F3A]/60 text-sm mb-3">
          No payment methods available for {currency}.
        </p>
        <a
          href={waLink(BUSINESS.contacts.globalWhatsapp.e164)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#25D366] text-white text-sm font-semibold"
        >
          Contact us on WhatsApp
        </a>
      </div>
    )
  }

  function RadioDot({ id }: { id: Gateway }) {
    const on = selected === id
    return (
      <div
        className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0"
        style={{
          borderColor: on ? '#C9A84C' : '#D1D5DB',
          backgroundColor: on ? '#C9A84C' : 'transparent',
        }}
      >
        {on && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>
    )
  }

  const PS_CURRENCIES = ['NGN', 'GHS', 'KES', 'ZAR']

  return (
    <div className="space-y-3">
      {processors.map(p => {
        const on = selected === p.id

        if (p.id === 'stripe') {
          return (
            <div
              key="stripe"
              className={`${cardBase} ${on ? cardActive : cardInactive}`}
              onClick={() => onSelect('stripe', currency)}
              role="radio"
              aria-checked={on}
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelect('stripe', currency)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5"><RadioDot id="stripe" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="font-semibold text-[#0B1F3A] text-sm">Pay with Card (International)</p>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">Stripe</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">USD · CAD · GBP · EUR — Visa / Mastercard / Amex</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">💳</span>
                    <span className="text-xs text-gray-500">Apple Pay · Google Pay · Instant confirmation</span>
                  </div>
                  {on && (
                    <p className="mt-2 text-sm font-semibold text-[#0B1F3A]">
                      Amount: <span style={{ color: '#C9A84C' }}>{fmtAmount(amount, currency)}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        }

        if (p.id === 'flutterwave') {
          const fwAmt = localAmount(fwCurrency)
          return (
            <div
              key="flutterwave"
              className={`${cardBase} ${on ? cardActive : cardInactive}`}
              onClick={() => onSelect('flutterwave', fwCurrency)}
              role="radio"
              aria-checked={on}
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelect('flutterwave', fwCurrency)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5"><RadioDot id="flutterwave" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="font-semibold text-[#0B1F3A] text-sm">Pay from Africa</p>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">Flutterwave</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">NGN · GHS — Bank transfer · Card · Mobile money</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">🏦 📱</span>
                    <span className="text-xs text-gray-500">USSD · Mobile money</span>
                  </div>
                  {on && (
                    <div className="mt-3 space-y-2">
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
                        Amount:{' '}
                        <span style={{ color: '#C9A84C' }}>{fmtAmount(fwAmt, fwCurrency)}</span>
                        {currency !== fwCurrency && (
                          <span className="text-xs text-gray-400 font-normal ml-1">
                            (≈ {fmtAmount(amount, currency)})
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        }

        if (p.id === 'paystack') {
          const psCur = PS_CURRENCIES.includes(currency) ? currency : 'NGN'
          const psAmt = localAmount(psCur)
          return (
            <div
              key="paystack"
              className={`${cardBase} ${on ? cardActive : cardInactive}`}
              onClick={() => onSelect('paystack', psCur)}
              role="radio"
              aria-checked={on}
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelect('paystack', psCur)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5"><RadioDot id="paystack" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="font-semibold text-[#0B1F3A] text-sm">Pay via Paystack</p>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">Paystack</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">NGN · GHS · KES · ZAR — Card, bank transfer, USSD</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">🇳🇬 🇬🇭 🇰🇪 🇿🇦</span>
                    <span className="text-xs text-gray-500">Instant confirmation</span>
                  </div>
                  {on && (
                    <p className="mt-2 text-sm font-semibold text-[#0B1F3A]">
                      Amount:{' '}
                      <span style={{ color: '#C9A84C' }}>{fmtAmount(psAmt, psCur)}</span>
                      {currency !== psCur && (
                        <span className="text-xs text-gray-400 font-normal ml-1">
                          (≈ {fmtAmount(amount, currency)})
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        }

        if (p.id === 'nowpayments') {
          return (
            <div
              key="nowpayments"
              className={`${cardBase} ${on ? cardActive : cardInactive}`}
              onClick={() => onSelect('nowpayments', currency)}
              role="radio"
              aria-checked={on}
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onSelect('nowpayments', currency)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5"><RadioDot id="nowpayments" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="font-semibold text-[#0B1F3A] text-sm">Pay with Cryptocurrency</p>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">Crypto</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">USDT · BTC · ETH and others</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">🔒</span>
                    <span className="text-xs text-gray-500">Powered by NOWPayments</span>
                  </div>
                  {on && (
                    <p className="mt-2 text-sm font-semibold text-[#0B1F3A]">
                      Amount:{' '}
                      <span style={{ color: '#C9A84C' }}>{fmtAmount(amount, currency)}</span>
                      <span className="text-xs text-gray-400 font-normal ml-1">(converted at checkout)</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
