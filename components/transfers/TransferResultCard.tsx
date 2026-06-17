'use client'

import { Car, Users, Clock, ArrowRight } from 'lucide-react'

export interface TransferResult {
  transferKey:  string
  transferType: string
  vehicleName:  string
  vehicleDesc?: string | null
  maxPax?:      number | null
  price:        number
  currency:     string
  duration?:    number | null
  imageUrl?:    string | null
  from?:        unknown
  to?:          unknown
}

interface Props {
  transfer:   TransferResult
  onSelect:   (t: TransferResult) => void
  fromName:   string
  toName:     string
  passengers: number
}

const TYPE_LABELS: Record<string, string> = {
  PRIVATE: 'Private Transfer',
  SHUTTLE: 'Shared Shuttle',
  TAXI:    'Taxi',
  BUS:     'Bus',
}

export function TransferResultCard({ transfer, onSelect, fromName, toName, passengers }: Props) {
  const label    = TYPE_LABELS[transfer.transferType] ?? transfer.transferType
  const fmtPrice = new Intl.NumberFormat('en-GB', { style: 'currency', currency: transfer.currency, minimumFractionDigits: 0 }).format(transfer.price)

  return (
    <div className="bg-white rounded-2xl border border-[#E2D9CC] hover:shadow-md transition-shadow flex flex-col sm:flex-row overflow-hidden">
      {/* Vehicle image / icon */}
      <div className="relative w-full sm:w-40 h-32 sm:h-auto bg-gradient-to-br from-[#0B1F3A] to-[#1a3358] flex items-center justify-center flex-shrink-0">
        {transfer.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={transfer.imageUrl} alt={transfer.vehicleName} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <Car className="w-12 h-12 text-white/20" strokeWidth={1} />
        )}
        <span className="absolute top-2 left-2 bg-[#C9A84C] text-[#0B1F3A] text-[10px] font-bold px-2 py-0.5 rounded-full">
          {label}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        <h3 className="font-bold text-[#0B1F3A] text-base leading-snug">{transfer.vehicleName}</h3>

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <ArrowRight className="w-3 h-3 text-[#C9A84C]" />
          <span className="truncate">{fromName} → {toName}</span>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          {transfer.maxPax && (
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3 text-[#C9A84C]" />
              Up to {transfer.maxPax} passengers
              {passengers > transfer.maxPax && (
                <span className="text-red-500 ml-1">(group too large)</span>
              )}
            </span>
          )}
          {transfer.duration && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#C9A84C]" />
              ~{transfer.duration} min
            </span>
          )}
        </div>

        {transfer.vehicleDesc && (
          <p className="text-xs text-gray-400 leading-snug line-clamp-2">{transfer.vehicleDesc}</p>
        )}

        <div className="flex items-end justify-between mt-auto pt-2 border-t border-gray-100">
          <div>
            <p className="text-[10px] text-gray-400">Total price</p>
            <p className="text-xl font-bold text-[#C9A84C]">{fmtPrice}</p>
          </div>
          <button
            onClick={() => onSelect(transfer)}
            className="bg-[#C9A84C] text-[#0B1F3A] font-bold text-xs px-5 py-2.5 rounded-xl hover:bg-[#d4b05a] transition-colors"
          >
            Book Transfer
          </button>
        </div>
      </div>
    </div>
  )
}
