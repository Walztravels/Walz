'use client'

import { CheckCircle, Clock, MessageSquare } from 'lucide-react'
import { BUSINESS, waLink } from '@/lib/config/business'

interface Props {
  reference: string
  sla:       string
}

export function ConciergeRequestCard({ reference, sla }: Props) {
  return (
    <div className="mx-0.5 my-2 rounded-xl overflow-hidden border border-[#C9A84C]/30 shadow-sm">
      {/* Header strip */}
      <div className="bg-[#0B1F3A] px-4 py-2.5 flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
        <span className="text-white text-xs font-bold tracking-wide">CONCIERGE REQUEST RECEIVED</span>
      </div>

      {/* Body */}
      <div className="bg-white px-4 py-3 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">Reference</p>
            <p className="text-[#0B1F3A] font-bold text-sm tracking-widest">{reference}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">Response within</p>
            <div className="flex items-center gap-1 justify-end">
              <Clock className="w-3 h-3 text-[#C9A84C]" />
              <p className="text-[#0B1F3A] font-semibold text-xs">{sla}</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          Your dedicated concierge specialist will contact you directly with a personalised proposal.
        </p>

        <a
          href={waLink(BUSINESS.contacts.globalWhatsapp.e164, 'Hi, I have a concierge request and my reference is ')}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/30
            text-[#0B1F3A] text-xs font-semibold hover:bg-[#C9A84C]/20 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5 text-[#C9A84C]" />
          Follow up on WhatsApp
        </a>
      </div>
    </div>
  )
}
