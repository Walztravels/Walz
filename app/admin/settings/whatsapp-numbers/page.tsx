'use client'

import { MessageSquare, ExternalLink, AlertCircle, Clock } from 'lucide-react'

// ─── Static data ─────────────────────────────────────────────────────────────

const NUMBERS = [
  {
    flag: '🇬🇧',
    label: 'United Kingdom',
    number: '+44 7398 753797',
    status: 'expired',
    statusLabel: 'Token expired',
    statusColor: 'bg-red-100 text-red-700',
    reconnectUrl: 'https://business.facebook.com/settings/whatsapp-business-accounts',
  },
  {
    flag: '🇨🇦',
    label: 'Canada',
    number: '+1 365-720-0865',
    status: 'pending',
    statusLabel: 'Pending BM verification',
    statusColor: 'bg-amber-100 text-amber-700',
    reconnectUrl: 'https://business.facebook.com',
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WhatsAppNumbersPage() {
  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0B1F3A]/8 flex items-center justify-center flex-shrink-0 mt-0.5">
          <MessageSquare className="w-5 h-5 text-[#0B1F3A]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">WhatsApp Numbers</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage WhatsApp Business channels connected to Walz Travels
          </p>
        </div>
      </div>

      {/* Number cards */}
      <div className="space-y-4 max-w-2xl">
        {NUMBERS.map((item) => (
          <div
            key={item.number}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 flex items-center gap-5"
          >
            {/* Flag + label */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-3xl leading-none flex-shrink-0" role="img" aria-label={item.label}>
                {item.flag}
              </span>
              <div className="min-w-0">
                <p className="font-bold text-[#0B1F3A] text-sm">{item.label}</p>
                <p className="text-gray-500 text-sm font-mono mt-0.5">{item.number}</p>
              </div>
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {item.status === 'expired' ? (
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-amber-500" />
              )}
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${item.statusColor}`}>
                {item.statusLabel}
              </span>
            </div>

            {/* Action button */}
            <a
              href={item.reconnectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#1a3358] px-4 py-2 rounded-xl transition-colors"
            >
              {item.status === 'expired' ? 'Reconnect via Meta' : 'Connect via Meta'}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ))}
      </div>

      {/* Info box */}
      <div className="mt-8 max-w-2xl p-4 bg-[#0B1F3A]/4 rounded-xl border border-[#0B1F3A]/10">
        <div className="flex items-start gap-3">
          <MessageSquare className="w-4 h-4 text-[#C9A84C] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-[#0B1F3A] mb-1">
              How to connect a WhatsApp Business number
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Connecting a number requires a Meta Business Manager account with a verified WhatsApp
              Business Account. Log in to the Meta Business Manager, navigate to
              &ldquo;WhatsApp Accounts&rdquo; under Business Settings, and follow the token
              refresh or verification flow. Once connected, the number will become active and
              messages from the Walz Travels portal will route through it automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
