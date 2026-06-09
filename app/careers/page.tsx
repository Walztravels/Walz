import type { Metadata } from 'next'
import { MapPin, Clock, ArrowRight, MessageCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Careers',
  description: 'Join the Walz Travels team. We\'re looking for passionate travel experts, visa specialists and tech talent.',
}

const OPENINGS = [
  {
    title: 'Visa Application Specialist',
    type: 'Full-time',
    location: 'London, UK (Hybrid)',
    description: 'Prepare visa applications, liaise with embassies and coach clients through the interview process. 2+ years visa processing experience required.',
  },
  {
    title: 'Travel Consultant',
    type: 'Full-time',
    location: 'Remote (UK/Nigeria)',
    description: 'Research and book bespoke itineraries for our clients. Strong knowledge of Sabre GDS or Amadeus and luxury travel experience preferred.',
  },
  {
    title: 'Customer Success Agent',
    type: 'Full-time',
    location: 'Remote',
    description: 'First point of contact for clients via WhatsApp and email. Resolve booking queries, escalate issues and ensure every client has an exceptional experience.',
  },
  {
    title: 'Frontend Engineer',
    type: 'Contract',
    location: 'Remote',
    description: 'Build and maintain walztravels.com — Next.js 14, TypeScript, Tailwind, GSAP. You\'ll work directly with the founding team.',
  },
]

const VALUES = [
  { emoji: '✈️', title: 'Real expertise', desc: 'We\'ve been to the places we sell. Every recommendation comes from genuine first-hand experience.' },
  { emoji: '🌍', title: 'Global team', desc: 'We operate across the UK, Nigeria, Canada and beyond — bringing diverse perspectives to travel.' },
  { emoji: '💛', title: 'Client obsession', desc: 'We measure success by our clients\' journeys, not just our bookings. 24/7 WhatsApp proves it.' },
  { emoji: '🚀', title: 'Move fast', desc: 'We\'re a lean, ambitious team. If you want to build something significant, you\'ll fit right in.' },
]

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-[#F5F2EE]">

      {/* Hero */}
      <div className="bg-[#0B1F3A] py-16 lg:py-24 px-5">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-4">Join Us</p>
          <h1 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            Travel is What We Do.<br />It Could Be What You Do Too.
          </h1>
          <p className="text-white/50 text-base lg:text-lg max-w-2xl leading-relaxed">
            We&apos;re a growing travel agency on a mission to give every client the best possible experience. If that excites you, we&apos;d love to hear from you.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-14 lg:py-20">

        {/* Values */}
        <div className="mb-16">
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] mb-8">Why Walz Travels</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {VALUES.map(({ emoji, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-6 border border-[#E2D9CC]">
                <span className="text-2xl mb-3 block">{emoji}</span>
                <h3 className="font-bold text-[#0B1F3A] mb-1.5">{title}</h3>
                <p className="text-[#0B1F3A]/55 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Open positions */}
        <div>
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] mb-8">Open Positions</h2>
          <div className="space-y-4">
            {OPENINGS.map(({ title, type, location, description }) => (
              <div key={title} className="bg-white rounded-2xl border border-[#E2D9CC] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                  <h3 className="font-display text-lg font-bold text-[#0B1F3A]">{title}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[#C9A84C] bg-[#C9A84C]/10 px-2.5 py-1 rounded-full">
                      {type}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mb-3 text-xs text-[#0B1F3A]/50">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{location}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{type}</span>
                </div>
                <p className="text-[#0B1F3A]/60 text-sm leading-relaxed mb-4">{description}</p>
                <a
                  href={`mailto:contact@walztravels.com?subject=Application: ${encodeURIComponent(title)}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#C9A84C] hover:underline"
                >
                  Apply Now <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Speculative */}
        <div className="mt-10 bg-[#0B1F3A] rounded-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#C9A84C] flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-6 h-6 text-[#0B1F3A]" />
            </div>
            <div>
              <p className="text-white font-bold">Don&apos;t see your role?</p>
              <p className="text-white/50 text-sm mt-0.5">Send us your CV anyway — we&apos;re always on the lookout for great people.</p>
            </div>
          </div>
          <a
            href="mailto:contact@walztravels.com?subject=Speculative%20Application"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors"
          >
            Send Your CV
          </a>
        </div>

      </div>
    </div>
  )
}
