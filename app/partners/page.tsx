import type { Metadata } from 'next'
import { Check, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Partners',
  description: 'Partner with Walz Travels. Referral programmes, corporate accounts and trade partnerships for travel agents and businesses.',
}

const PARTNER_TYPES = [
  {
    title: 'Travel Agent Referral',
    icon: '✈️',
    description: 'Are you a travel agent without Sabre GDS access or visa capability? Refer your clients to us and earn a commission on every completed booking.',
    perks: ['10–15% referral commission', 'Dedicated account manager', 'Co-branded client communications', 'Real-time booking status updates'],
  },
  {
    title: 'Corporate Accounts',
    icon: '🏢',
    description: 'Simplify business travel for your organisation. We handle flights, hotels, visas and expense reporting for corporate teams of any size.',
    perks: ['Invoiced monthly billing', 'Negotiated group airfares', 'Priority 24/7 support line', 'Custom travel policy management'],
  },
  {
    title: 'Influencer & Content Creator',
    icon: '📸',
    description: 'Travel bloggers, YouTubers and Instagram creators — work with us on sponsored itineraries, destination reviews and affiliate content.',
    perks: ['Complimentary press trips', 'Affiliate link programme', 'Exclusive destination access', 'Co-marketing opportunities'],
  },
  {
    title: 'Relocation Services',
    icon: '🌍',
    description: 'HR teams and relocation agencies: we handle visa applications, flights and accommodation for employee relocations globally.',
    perks: ['Bulk visa processing', 'Employee travel packs', 'Dedicated relocation desk', 'Document tracking portal'],
  },
]

export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-[#F5F2EE]">

      {/* Hero */}
      <div className="bg-[#0B1F3A] py-16 lg:py-24 px-5">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-4">Partner With Us</p>
          <h1 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            Let&apos;s Grow Together
          </h1>
          <p className="text-white/50 text-base lg:text-lg max-w-xl leading-relaxed">
            Whether you&apos;re a travel agent, corporate HR team or content creator — there&apos;s a partnership model that works for you.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-14 lg:py-20">

        {/* Partner types */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-14">
          {PARTNER_TYPES.map(({ title, icon, description, perks }) => (
            <div key={title} className="bg-white rounded-2xl border border-[#E2D9CC] p-7 flex flex-col">
              <span className="text-3xl mb-4 block">{icon}</span>
              <h2 className="font-display text-lg font-bold text-[#0B1F3A] mb-3">{title}</h2>
              <p className="text-[#0B1F3A]/60 text-sm leading-relaxed mb-5">{description}</p>
              <ul className="space-y-2 flex-1">
                {perks.map(perk => (
                  <li key={perk} className="flex items-center gap-2 text-sm text-[#0B1F3A]/70">
                    <Check className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="bg-[#0B1F3A] rounded-2xl p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-white mb-3">Ready to Partner?</h2>
          <p className="text-white/50 text-sm mb-8 max-w-md mx-auto">
            Get in touch and we&apos;ll set up a call to discuss the best arrangement for your business.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:contact@walztravels.com?subject=Partnership%20Enquiry"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors"
            >
              Email Us <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 border-2 border-white/20 text-white font-semibold text-sm rounded-xl hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors"
            >
              WhatsApp +44 7398 753797
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}
