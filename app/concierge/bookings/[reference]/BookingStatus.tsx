'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, CheckCircle, Clock, XCircle, Download, QrCode, ArrowLeft } from 'lucide-react'

interface BookingData {
  reference:      string
  status:         string
  serviceName:    string
  airportCode:    string | null
  date:           string | null
  time:           string | null
  flightNumber:   string | null
  passengerCount: number | null
  displayPrice:   string | null
  createdAt:      string
  cpStatus:       string | null
  bookingNumber:  number | null
  voucherUrl:     string | null
  voucherReady:   boolean
  submissionState: string | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  pending_payment: {
    label:       'Awaiting payment',
    color:       'text-amber-400',
    icon:        <Clock className="w-5 h-5" />,
    description: 'Complete payment to confirm your booking.',
  },
  pending: {
    label:       'Processing',
    color:       'text-amber-400',
    icon:        <Clock className="w-5 h-5" />,
    description: 'Your booking is being processed.',
  },
  confirmed: {
    label:       'Confirmed',
    color:       'text-green-400',
    icon:        <CheckCircle className="w-5 h-5" />,
    description: 'Your booking is confirmed. Voucher will appear below when ready.',
  },
  in_progress: {
    label:       'Active',
    color:       'text-green-400',
    icon:        <CheckCircle className="w-5 h-5" />,
    description: 'Your service is active.',
  },
  completed: {
    label:       'Completed',
    color:       'text-white/60',
    icon:        <CheckCircle className="w-5 h-5" />,
    description: 'Your service has been completed.',
  },
  cancelled: {
    label:       'Cancelled',
    color:       'text-red-400',
    icon:        <XCircle className="w-5 h-5" />,
    description: 'This booking has been cancelled.',
  },
}

const DEFAULT_STATUS_CONFIG = {
  label:       'Processing',
  color:       'text-amber-400',
  icon:        <Clock className="w-5 h-5" />,
  description: 'Your booking is being processed. We will update you shortly.',
}

export default function BookingStatus({ reference, initialPaid }: { reference: string; initialPaid?: boolean }) {
  const [data,    setData]    = useState<BookingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [polling, setPolling] = useState(true)

  const fetch_ = async () => {
    try {
      const res = await fetch(`/api/concierge/bookings/status?ref=${encodeURIComponent(reference)}`)
      if (res.status === 404) {
        setError('Booking not found. Please check your reference number.')
        setPolling(false)
        return
      }
      if (!res.ok) {
        setError('Could not load booking details.')
        return
      }
      const booking = await res.json() as BookingData
      setData(booking)
      setError('')

      // Stop polling once we have a terminal state
      const terminal = ['confirmed', 'completed', 'cancelled'].includes(booking.status) && booking.voucherReady
      if (terminal) setPolling(false)
    } catch {
      setError('Connection error. Retrying…')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetch_()
  }, [])

  useEffect(() => {
    if (!polling) return
    const interval = setInterval(() => void fetch_(), 15_000)
    return () => clearInterval(interval)
  }, [polling, reference])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-white/70 text-sm">{error}</p>
        <Link href="/concierge/airport-services" className="mt-6 inline-block text-[#C9A84C] text-sm hover:underline">
          ← Back to Airport Services
        </Link>
      </div>
    )
  }

  if (!data) return null

  const cfg = STATUS_CONFIG[data.status] ?? DEFAULT_STATUS_CONFIG

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-wider mb-4">Booking Confirmed</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-white font-bold text-xl mb-1">{data.serviceName}</h2>
            {data.airportCode && <p className="text-white/50 text-sm">{data.airportCode}</p>}
          </div>
          <div className="flex-shrink-0">
            <span className={`flex items-center gap-1.5 text-sm font-semibold ${cfg.color}`}>
              {cfg.icon}
              {cfg.label}
            </span>
          </div>
        </div>
        <p className="text-white/40 text-xs mt-3">{cfg.description}</p>
      </div>

      {/* Reference */}
      <div className="bg-[#0F2340] border border-[#C9A84C]/30 rounded-2xl p-5 text-center">
        <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Your Reference</p>
        <p className="text-[#C9A84C] text-3xl font-bold tracking-wider">{data.reference}</p>
        {data.bookingNumber && (
          <p className="text-white/30 text-xs mt-2">Booking #{data.bookingNumber}</p>
        )}
      </div>

      {/* Booking details */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-4">Details</p>
        <dl className="space-y-3">
          {[
            data.date          && ['Date',       data.date],
            data.time          && ['Time',       data.time],
            data.flightNumber  && ['Flight',     data.flightNumber],
            data.passengerCount !== null && ['Passengers', String(data.passengerCount)],
            data.displayPrice  && ['Total paid', data.displayPrice],
          ].filter(Boolean).map((row) => {
            const [k, v] = row as [string, string]
            return (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-white/40 text-sm">{k}</dt>
                <dd className="text-white text-sm font-medium">{v}</dd>
              </div>
            )
          })}
        </dl>
      </div>

      {/* Voucher */}
      {data.voucherReady && data.voucherUrl ? (
        <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <p className="text-green-300 font-semibold text-sm">Your voucher is ready</p>
          </div>
          <p className="text-white/50 text-xs">
            Present this voucher at the airport. Save it to your phone or print it.
          </p>
          <a
            href={data.voucherUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white
              font-bold text-sm px-6 py-3 rounded-full transition-colors w-full">
            <Download className="w-4 h-4" />
            Download Voucher
          </a>
        </div>
      ) : ['confirmed', 'in_progress'].includes(data.status) ? (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-[#C9A84C] animate-spin flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-medium">Voucher being prepared</p>
            <p className="text-white/40 text-xs">This page will update automatically.</p>
          </div>
        </div>
      ) : null}

      {/* Polling indicator */}
      {polling && (
        <p className="text-white/20 text-xs text-center">
          Auto-refreshing every 15 seconds…
        </p>
      )}

      {/* Support */}
      <div className="text-center pt-2">
        <p className="text-white/30 text-xs">
          Need help?{' '}
          <a
            href={`https://wa.me/12317902336?text=Hi%2C%20my%20booking%20reference%20is%20${data.reference}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#C9A84C]/60 hover:text-[#C9A84C] transition-colors">
            WhatsApp us
          </a>
          {' '}with your reference.
        </p>
      </div>
    </div>
  )
}
