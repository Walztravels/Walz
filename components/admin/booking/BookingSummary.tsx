'use client'
import { Loader2, User, Package, Calendar, Building2, TrendingUp, CreditCard } from 'lucide-react'
import type { AdminCustomer } from './CustomerSelector'
import type { BookingPriceResult } from '@/lib/pricing/booking-price'

export interface BookingSummaryProps {
  customer?:        AdminCustomer | null
  productName?:     string | null
  productDetail?:   string | null
  supplier?:        string | null
  dates?:           string | null
  travellers?:      string | null
  pricing?:         BookingPriceResult | null
  paymentStatus?:   'PENDING' | 'PAID' | 'PARTIAL' | 'FAILED' | 'REFUNDED' | null
  extraRows?:       Array<{ label: string; value: string; highlight?: boolean }>
  onContinue?:      () => void
  continueLabel?:   string
  continueDisabled?: boolean
  isLoading?:       boolean
  showProfit?:      boolean  // only shown to staff with booking.viewProfit permission
}

const PAYMENT_STATUS_LABEL: Record<string, { label: string; colour: string }> = {
  PENDING:  { label: 'Pending',        colour: 'text-amber-400' },
  PAID:     { label: 'Paid',           colour: 'text-green-400' },
  PARTIAL:  { label: 'Partially Paid', colour: 'text-amber-400' },
  FAILED:   { label: 'Failed',         colour: 'text-red-400'   },
  REFUNDED: { label: 'Refunded',       colour: 'text-blue-400'  },
}

function fmt(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface RowProps { icon?: React.ReactNode; label: string; value: string; highlight?: boolean; muted?: boolean }
function Row({ icon, label, value, highlight, muted }: RowProps) {
  return (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-[#1a2f4a] last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="text-gray-500 flex-shrink-0">{icon}</span>}
        <span className={`text-xs ${muted ? 'text-gray-500' : 'text-gray-400'} truncate`}>{label}</span>
      </div>
      <span className={`text-xs font-medium flex-shrink-0 ${
        highlight ? 'text-[#C9A84C]' : muted ? 'text-gray-500' : 'text-white'
      }`}>
        {value}
      </span>
    </div>
  )
}

export default function BookingSummary({
  customer,
  productName,
  productDetail,
  supplier,
  dates,
  travellers,
  pricing,
  paymentStatus,
  extraRows,
  onContinue,
  continueLabel  = 'Continue',
  continueDisabled,
  isLoading,
  showProfit     = true,
}: BookingSummaryProps) {
  const paymentMeta = paymentStatus ? PAYMENT_STATUS_LABEL[paymentStatus] : null
  const hasContent  = customer || productName || pricing

  return (
    <aside className="bg-[#0a1929] rounded-2xl border border-[#1a2f4a] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1a2f4a]">
        <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Booking Summary</p>
      </div>

      <div className="flex-1 px-5 py-4 space-y-0">
        {!hasContent && (
          <p className="text-xs text-gray-600 text-center py-6">
            Details will appear as you build the booking.
          </p>
        )}

        {/* Client */}
        {customer && (
          <Row
            icon={<User className="w-3.5 h-3.5" />}
            label="Client"
            value={customer.name}
            highlight
          />
        )}

        {/* Product */}
        {productName && (
          <Row
            icon={<Package className="w-3.5 h-3.5" />}
            label="Product"
            value={productDetail ? `${productName} · ${productDetail}` : productName}
          />
        )}

        {/* Dates */}
        {dates && (
          <Row
            icon={<Calendar className="w-3.5 h-3.5" />}
            label="Dates"
            value={dates}
          />
        )}

        {/* Travellers */}
        {travellers && (
          <Row
            icon={<User className="w-3.5 h-3.5" />}
            label="Travellers"
            value={travellers}
          />
        )}

        {/* Supplier */}
        {supplier && (
          <Row
            icon={<Building2 className="w-3.5 h-3.5" />}
            label="Supplier"
            value={supplier}
            muted
          />
        )}

        {/* Pricing breakdown */}
        {pricing && (
          <>
            <Row
              label="Supplier Cost"
              value={fmt(pricing.currency, pricing.supplierCost)}
              muted
            />
            <Row
              label={`Markup (${pricing.markupPercent}%)`}
              value={fmt(pricing.currency, pricing.markupAmount)}
              muted
            />
            {pricing.serviceFee > 0 && (
              <Row label="Service Fee" value={fmt(pricing.currency, pricing.serviceFee)} muted />
            )}
            {pricing.discount > 0 && (
              <Row label="Discount" value={`−${fmt(pricing.currency, pricing.discount)}`} muted />
            )}
            <div className="border-t border-[#1a2f4a] mt-2 pt-3 pb-1">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-semibold text-white">Customer Total</span>
                <span className="text-lg font-bold text-[#C9A84C]">
                  {fmt(pricing.currency, pricing.sellingPrice)}
                </span>
              </div>
            </div>
            {showProfit && (
              <Row
                icon={<TrendingUp className="w-3.5 h-3.5" />}
                label={`Gross Profit (${pricing.marginPercent}%)`}
                value={fmt(pricing.currency, pricing.grossProfit)}
                muted
              />
            )}
          </>
        )}

        {/* Payment status */}
        {paymentMeta && (
          <Row
            icon={<CreditCard className="w-3.5 h-3.5" />}
            label="Payment"
            value={paymentMeta.label}
          />
        )}

        {/* Extra rows passed by the booking page */}
        {extraRows?.map(r => (
          <Row key={r.label} label={r.label} value={r.value} highlight={r.highlight} />
        ))}
      </div>

      {/* Continue button */}
      {onContinue && (
        <div className="px-5 py-4 border-t border-[#1a2f4a]">
          <button
            type="button"
            onClick={onContinue}
            disabled={continueDisabled || isLoading}
            className="w-full py-3 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold
              hover:bg-[#e0b85c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors
              flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? 'Processing…' : continueLabel}
          </button>
        </div>
      )}
    </aside>
  )
}
